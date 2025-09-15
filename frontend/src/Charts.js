import React, { useState, useEffect } from 'react';
import { Box, Heading, SimpleGrid, Spinner, VStack } from '@chakra-ui/react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF'];

const Charts = () => {
  const [lineChartData, setLineChartData] = useState([]);
  const [barChartData, setBarChartData] = useState([]);
  const [pieChartData, setPieChartData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchChartData = async () => {
      try {
        const today = new Date();
        const thirtyDaysAgo = new Date(new Date().setDate(today.getDate() - 30));
        const startDate = thirtyDaysAgo.toISOString().split('T')[0];
        const endDate = today.toISOString().split('T')[0];

        const [ordersRes, categoryRes] = await Promise.all([
          fetch(`${process.env.REACT_APP_API_URL}/api/insights/orders-by-date?startDate=${startDate}&endDate=${endDate}`),
          fetch(`${process.env.REACT_APP_API_URL}/api/insights/revenue-by-category`),
        ]);
        
        if (!ordersRes.ok || !categoryRes.ok) throw new Error('Failed to fetch chart data');

        const ordersJson = await ordersRes.json();
        const categoryJson = await categoryRes.json();

        // --- Data for Line Chart (individual orders) ---
        const formattedLineData = ordersJson.map(order => ({
          date: new Date(order.orderedAt).toLocaleDateString(),
          Revenue: order.totalPrice,
        })).reverse();
        setLineChartData(formattedLineData);

        // --- NEW: Process data for Bar Chart (sum revenue by day) ---
        const dailyRevenue = ordersJson.reduce((acc, order) => {
          const date = new Date(order.orderedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          acc[date] = (acc[date] || 0) + order.totalPrice;
          return acc;
        }, {});
        const formattedBarData = Object.keys(dailyRevenue).map(date => ({
          date,
          Revenue: dailyRevenue[date],
        }));
        setBarChartData(formattedBarData);


        setPieChartData(categoryJson);
      } catch (error) {
        console.error("Failed to fetch chart data", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchChartData();
  }, []);

  if (isLoading) {
    return <Spinner />;
  }

  return (
    <VStack spacing={8} mt={8} align="stretch">
      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={8}>
        <Box p={5} shadow="md" borderWidth="1px" borderRadius="md" bg="white">
          <Heading size="lg" mb={4}>Orders Over Time</Heading>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={lineChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="Revenue" stroke="#8884d8" />
            </LineChart>
          </ResponsiveContainer>
        </Box>

        <Box p={5} shadow="md" borderWidth="1px" borderRadius="md" bg="white">
          <Heading size="lg" mb={4}>Revenue by Category</Heading>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieChartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
                nameKey="name"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {pieChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>
      
      {/* --- NEW BAR CHART --- */}
      <Box p={5} shadow="md" borderWidth="1px" borderRadius="md" bg="white">
        <Heading size="lg" mb={4}>Daily Revenue</Heading>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={barChartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="Revenue" fill="#82ca9d" />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </VStack>
  );
};

export default Charts;