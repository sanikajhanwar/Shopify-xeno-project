import React, { useState, useEffect } from 'react';
import {
  Box,
  Heading,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Spinner,
  Text,
} from '@chakra-ui/react';

const TopCustomers = () => {
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTopCustomers = async () => {
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/insights/top-customers`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setCustomers(data);
      } catch (error) {
        console.error("Failed to fetch top customers", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTopCustomers();
  }, []);

  if (isLoading) {
    return <Spinner />;
  }

  return (
    <Box mt={8} p={5} shadow="md" borderWidth="1px" borderRadius="md" bg="white">
      <Heading size="lg" mb={4}>Top Customers by Spend</Heading>
      <TableContainer>
        <Table variant="simple">
          <Thead>
            <Tr>
              <Th>Customer</Th>
              <Th>Email</Th>
              <Th isNumeric>Orders</Th>
              <Th isNumeric>Total Spend</Th>
            </Tr>
          </Thead>
          <Tbody>
            {customers.map((customer) => (
              <Tr key={customer.id}>
                <Td>{customer.firstName || 'N/A'}</Td>
                <Td>{customer.email || 'No email'}</Td>
                <Td isNumeric>{customer.orderCount}</Td>
                <Td isNumeric fontWeight="bold">${customer.totalSpent.toFixed(2)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default TopCustomers;