const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { LATEST_API_VERSION, shopifyApi, ApiVersion } = require('@shopify/shopify-api');
const cors = require('cors');
require('@shopify/shopify-api/adapters/node'); // <-- THIS IS THE FIX
require('dotenv').config();

const prisma = new PrismaClient();
const app = express();
app.use(cors());
const port = 3002;

// Configure the Shopify API client
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET_KEY,
  scopes: ['read_products', 'read_orders', 'read_customers'],
  hostName: 'localhost',
  apiVersion: LATEST_API_VERSION,
});

// This is the main ingestion endpoint
// This is the main ingestion endpoint
app.post('/api/ingest', async (req, res) => {
  console.log('Starting data ingestion for all types...');

  try {
    const session = shopify.session.customAppSession(process.env.SHOPIFY_SHOP_NAME);
    session.accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

    const tenant = await prisma.tenant.upsert({
      where: { shopName: process.env.SHOPIFY_SHOP_NAME },
      update: {},
      create: { shopName: process.env.SHOPIFY_SHOP_NAME },
    });
    console.log(`Tenant created/found with ID: ${tenant.id}`);

    const client = new shopify.clients.Graphql({ session });

    const response = await client.request(
      `query {
        products(first: 10) {
          edges { node { id, title, vendor, productType, variants(first: 1) { edges { node { price } } } } }
        }
        customers(first: 10) {
          edges { node { id, firstName, lastName, email } }
        }
        orders(first: 10) {
          edges { node { id, name, createdAt, totalPrice, customer { id } } }
        }
      }`
    );

    const { products, customers, orders } = response.data;

    // Process and save customers
    // (This part remains the same)
    for (const customerEdge of customers.edges) {
      const customer = customerEdge.node;
      const shopifyCustomerId = customer.id.split('/').pop();

      await prisma.customer.upsert({
        where: { tenantId_shopifyCustomerId: { tenantId: tenant.id, shopifyCustomerId: shopifyCustomerId } },
        update: {
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
        },
        create: {
          shopifyCustomerId: shopifyCustomerId,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          tenantId: tenant.id,
        },
      });
    }
    console.log(`Processed ${customers.edges.length} customers.`);

    // --- THIS PART IS UPDATED ---
    // Process and save products, now including the category
    for (const productEdge of products.edges) {
      const product = productEdge.node;
      const shopifyProductId = product.id.split('/').pop();
      await prisma.product.upsert({
        where: { tenantId_shopifyProductId: { tenantId: tenant.id, shopifyProductId: shopifyProductId } },
        update: {
          title: product.title,
          vendor: product.vendor,
          price: parseFloat(product.variants.edges[0].node.price),
          category: product.productType, // <-- Save the category
        },
        create: {
          shopifyProductId: shopifyProductId,
          title: product.title,
          vendor: product.vendor,
          price: parseFloat(product.variants.edges[0].node.price),
          category: product.productType, // <-- Save the category
          tenantId: tenant.id,
        },
      });
    }
    console.log(`Processed ${products.edges.length} products.`);

    // Process and save orders
    // (This part remains the same)
    for (const orderEdge of orders.edges) {
      const order = orderEdge.node;
      if (!order.customer) continue;

      const shopifyOrderId = order.id.split('/').pop();
      const shopifyCustomerIdForOrder = order.customer.id.split('/').pop();

      const internalCustomer = await prisma.customer.findUnique({
        where: { tenantId_shopifyCustomerId: { tenantId: tenant.id, shopifyCustomerId: shopifyCustomerIdForOrder } },
      });

      if (internalCustomer) {
        await prisma.order.upsert({
          where: { tenantId_shopifyOrderId: { tenantId: tenant.id, shopifyOrderId: shopifyOrderId } },
          update: {
            totalPrice: parseFloat(order.totalPrice),
            orderedAt: new Date(order.createdAt),
          },
          create: {
            shopifyOrderId: shopifyOrderId,
            totalPrice: parseFloat(order.totalPrice),
            customerId: internalCustomer.id,
            orderedAt: new Date(order.createdAt),
            tenantId: tenant.id,
          },
        });
      }
    }
    console.log(`Processed ${orders.edges.length} orders.`);

    res.status(200).send('Full ingestion complete!');
  } catch (error) {
    console.error('Error during ingestion:', error);
    res.status(500).send('Ingestion failed.');
  }
});

// --- INSIGHTS API ENDPOINTS ---

// Endpoint to get total counts and revenue
app.get('/api/insights/totals', async (req, res) => {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) return res.status(404).send('No tenant data found.');

  const totalCustomers = await prisma.customer.count({ where: { tenantId: tenant.id } });
  const totalOrders = await prisma.order.count({ where: { tenantId: tenant.id } });

  const totalRevenue = await prisma.order.aggregate({
    _sum: {
      totalPrice: true,
    },
    where: { tenantId: tenant.id },
  });

  res.json({
    totalCustomers,
    totalOrders,
    totalRevenue: totalRevenue._sum.totalPrice || 0,
  });
});

// Endpoint to get the top 5 customers by spend
app.get('/api/insights/top-customers', async (req, res) => {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) return res.status(404).send('No tenant data found.');

  // We calculate spending by summing up the total price of their orders
  const topCustomersData = await prisma.order.groupBy({
    by: ['customerId'],
    // --- THIS IS THE CHANGE ---
    // We are adding _count to get the number of orders for each customer
    _sum: {
      totalPrice: true,
    },
    _count: {
      customerId: true,
    },
    // -------------------------
    where: { tenantId: tenant.id },
    orderBy: {
      _sum: {
        totalPrice: 'desc',
      },
    },
    take: 5,
  });

  // Now, get the customer details for the top spenders
  const customerDetails = await prisma.customer.findMany({
    where: {
      id: {
        in: topCustomersData.map(c => c.customerId),
      },
    },
  });

  // Combine the data to create a useful response
  const topCustomers = topCustomersData.map(summary => {
    const details = customerDetails.find(c => c.id === summary.customerId);
    return {
      ...details,
      totalSpent: summary._sum.totalPrice,
      orderCount: summary._count.customerId, // And adding the count to the response
    };
  });

  res.json(topCustomers);
});

// Endpoint to get orders by a date range
app.get('/api/insights/orders-by-date', async (req, res) => {
  const { startDate, endDate } = req.query;
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) return res.status(404).send('No tenant data found.');

  const orders = await prisma.order.findMany({
    where: {
      tenantId: tenant.id,
      orderedAt: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
    },
    orderBy: {
      orderedAt: 'desc',
    },
  });

  res.json(orders);
});

// Endpoint to get an approximation of revenue by product category
app.get('/api/insights/revenue-by-category', async (req, res) => {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) return res.status(404).send('No tenant data found.');

  // This is an approximation. A real version would sum line items from orders.
  // We are grouping products by category and summing their prices multiplied by the number of orders.
  // It's not perfect but gives us data for the chart.
  
  const orders = await prisma.order.findMany({
    where: { tenantId: tenant.id },
    select: { totalPrice: true },
  });

  const products = await prisma.product.findMany({
    where: { tenantId: tenant.id },
    select: { category: true, price: true },
  });

  const categoryRevenue = {};

  // Simple approximation: Distribute total revenue based on product price ratios
  const totalProductValue = products.reduce((sum, p) => sum + p.price, 0);
  const totalRevenue = orders.reduce((sum, o) => sum + o.totalPrice, 0);

  products.forEach(product => {
    if (product.category) {
      if (!categoryRevenue[product.category]) {
        categoryRevenue[product.category] = 0;
      }
      const proportion = product.price / totalProductValue;
      categoryRevenue[product.category] += proportion * totalRevenue;
    }
  });

  const pieChartData = Object.keys(categoryRevenue).map(category => ({
    name: category,
    value: Math.round(categoryRevenue[category]),
  }));

  res.json(pieChartData);
});

// --- WEBHOOKS ---

// This middleware is necessary to get the raw body for webhook verification
app.use('/api/webhooks', express.raw({ type: 'application/json' }));

app.post('/api/webhooks', async (req, res) => {
  const topic = req.headers['x-shopify-topic'];
  const shop = req.headers['x-shopify-shop-domain'];
  
  console.log(`Webhook received: Topic - ${topic}, Shop - ${shop}`);

  try {
    // Use the Shopify library to securely validate the webhook
    await shopify.webhooks.validate({
      rawBody: req.body, // The raw body we captured
      headers: req.headers,
    });
    console.log('Webhook validated successfully!');
    
    // Find the tenant to associate the event with
    const tenant = await prisma.tenant.findUnique({ where: { shopName: shop } });
    
    if (tenant) {
      // Save the event to the database
      await prisma.customEvent.create({
        data: {
          eventName: topic,
          eventData: JSON.parse(req.body.toString()), // Parse the body to JSON before saving
          tenantId: tenant.id,
        },
      });
      console.log('Webhook event saved to database.');
    } else {
      console.log(`Could not find tenant for shop: ${shop}`);
    }

    // Acknowledge receipt of the webhook
    res.sendStatus(200);

  } catch (error) {
    console.error('Webhook validation failed:', error);
    res.sendStatus(401); // Unauthorized
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});