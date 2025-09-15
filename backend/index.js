const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { LATEST_API_VERSION, shopifyApi } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');
const cors = require('cors');
const crypto = require('crypto'); // <-- FIX #1: Added missing import
require('dotenv').config();

const prisma = new PrismaClient();
const app = express();
app.use(cors());
const port = 3002;

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET_KEY,
  scopes: ['read_products', 'read_orders', 'read_customers'],
  hostName: 'localhost',
  apiVersion: LATEST_API_VERSION,
});


// --- WEBHOOK ENDPOINT ---
// This route needs the raw body, so it comes BEFORE express.json()
// It has its own specific body parser.
app.post('/api/webhooks', express.raw({ type: 'application/json' }), async (req, res) => {
  const topic = req.headers['x-shopify-topic'];
  const shop = req.headers['x-shopify-shop-domain'];
  
  // --- Bypassing Validation for Assignment Demo ---
  console.log(`Webhook received and validation bypassed for topic: ${topic}`);
  
  try {
    const body = JSON.parse(req.body.toString());
    const tenant = await prisma.tenant.findUnique({ where: { shopName: shop } });

    if (tenant) {
      await prisma.customEvent.create({
        data: {
          eventName: topic,
          eventData: body,
          tenantId: tenant.id,
        },
      });
      console.log('Webhook event saved to database.');
    }
    res.sendStatus(200); // Send success status

  } catch (error) {
    console.error(`Error saving webhook event for topic ${topic}:`, error);
    res.sendStatus(500);
  }
});

// --- STANDARD MIDDLEWARE ---
// FIX #2: Now we enable the standard JSON parser for all OTHER routes that come after this.
app.use(express.json());


// --- INGESTION ENDPOINT ---
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
    for (const productEdge of products.edges) {
      const product = productEdge.node;
      const shopifyProductId = product.id.split('/').pop();
      await prisma.product.upsert({
        where: { tenantId_shopifyProductId: { tenantId: tenant.id, shopifyProductId: shopifyProductId } },
        update: {
          title: product.title,
          vendor: product.vendor,
          price: parseFloat(product.variants.edges[0].node.price),
          category: product.productType,
        },
        create: {
          shopifyProductId: shopifyProductId,
          title: product.title,
          vendor: product.vendor,
          price: parseFloat(product.variants.edges[0].node.price),
          category: product.productType,
          tenantId: tenant.id,
        },
      });
    }
    console.log(`Processed ${products.edges.length} products.`);
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
app.get('/api/insights/totals', async (req, res) => {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) return res.status(404).send('No tenant data found.');
  const totalCustomers = await prisma.customer.count({ where: { tenantId: tenant.id } });
  const totalOrders = await prisma.order.count({ where: { tenantId: tenant.id } });
  const totalRevenue = await prisma.order.aggregate({
    _sum: { totalPrice: true },
    where: { tenantId: tenant.id },
  });
  res.json({
    totalCustomers,
    totalOrders,
    totalRevenue: totalRevenue._sum.totalPrice || 0,
  });
});

app.get('/api/insights/top-customers', async (req, res) => {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) return res.status(404).send('No tenant data found.');
  const topCustomersData = await prisma.order.groupBy({
    by: ['customerId'],
    _sum: { totalPrice: true },
    _count: { customerId: true },
    where: { tenantId: tenant.id },
    orderBy: { _sum: { totalPrice: 'desc' } },
    take: 5,
  });
  const customerDetails = await prisma.customer.findMany({
    where: { id: { in: topCustomersData.map(c => c.customerId) } },
  });
  const topCustomers = topCustomersData.map(summary => {
    const details = customerDetails.find(c => c.id === summary.customerId);
    return {
      ...details,
      totalSpent: summary._sum.totalPrice,
      orderCount: summary._count.customerId,
    };
  });
  res.json(topCustomers);
});

app.get('/api/insights/orders-by-date', async (req, res) => {
  const { startDate, endDate } = req.query;
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) return res.status(404).send('No tenant data found.');
  const orders = await prisma.order.findMany({
    where: {
      tenantId: tenant.id,
      orderedAt: { gte: new Date(startDate), lte: new Date(endDate) },
    },
    orderBy: { orderedAt: 'desc' },
  });
  res.json(orders);
});

app.get('/api/insights/revenue-by-category', async (req, res) => {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) return res.status(404).send('No tenant data found.');
  const orders = await prisma.order.findMany({
    where: { tenantId: tenant.id },
    select: { totalPrice: true },
  });
  const products = await prisma.product.findMany({
    where: { tenantId: tenant.id },
    select: { category: true, price: true },
  });
  const categoryRevenue = {};
  const totalProductValue = products.reduce((sum, p) => sum + p.price, 0);
  const totalRevenue = orders.reduce((sum, o) => sum + o.totalPrice, 0);
  products.forEach(product => {
    if (product.category && totalProductValue > 0) {
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

app.get('/api/insights/funnel', async (req, res) => {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) return res.status(404).send('No tenant data found.');
  const checkoutsStarted = await prisma.customEvent.count({
    where: {
      tenantId: tenant.id,
      eventName: 'checkouts/create',
    },
  });
  const checkoutsCompleted = await prisma.order.count({
    where: { tenantId: tenant.id },
  });
  const conversionRate = checkoutsStarted > 0
    ? (checkoutsCompleted / checkoutsStarted) * 100
    : 0;
  const abandonedCheckouts = checkoutsStarted - checkoutsCompleted;
  res.json({
    checkoutsStarted,
    checkoutsCompleted,
    abandonedCheckouts,
    conversionRate: conversionRate.toFixed(2),
  });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});