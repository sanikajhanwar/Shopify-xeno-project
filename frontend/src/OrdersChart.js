import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const OrdersChart = () => {
  // Set default date range to the last 30 days
  const today = new Date();
  const thirtyDaysAgo = new Date(new Date().setDate(today.getDate() - 30));

  const [startDate, setStartDate] = useState(thirtyDaysAgo.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
  const [data, setData] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchOrderData = async () => {
      try {
        const response = await fetch(`https://shopify-xeno-project-4eil.vercel.app/api/insights/orders-by-date?startDate=${startDate}&endDate=${endDate}`);
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const orderData = await response.json();

        // Format data for the chart
        const formattedData = orderData.map(order => ({
          date: new Date(order.orderedAt).toLocaleDateString(),
          price: order.totalPrice,
        })).reverse(); // Reverse to show oldest to newest

        setData(formattedData);
      } catch (err) {
        setError('Failed to fetch order data.');
        console.error(err);
      }
    };

    fetchOrderData();
  }, [startDate, endDate]); // Re-run this effect when dates change

  return (
    <div className="chart-container">
      <h2>Orders by Date</h2>
      <div className="date-filters">
        <label>Start Date: <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label>End Date: <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
      </div>
      {error && <p className="error">{error}</p>}
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#444" />
          <XAxis dataKey="date" stroke="#f0f0f0" />
          <YAxis stroke="#f0f0f0" />
          <Tooltip contentStyle={{ backgroundColor: '#282c34', border: '1px solid #555' }} />
          <Legend />
          <Line type="monotone" dataKey="price" stroke="#61dafb" activeDot={{ r: 8 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default OrdersChart;