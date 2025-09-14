import React, { useState, useEffect } from 'react';
import {
  Box,
  Flex,
  Heading,
  Icon,
  Button,
  Text,
  Spinner,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  VStack,
} from '@chakra-ui/react';
import { FaShopify } from 'react-icons/fa';
import Login from './Login';
import TopCustomers from './TopCustomers';
import Charts from './Charts'; // <-- Import the new component

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [totals, setTotals] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const totalsRes = await fetch('http://localhost:3002/api/insights/totals');
        if (!totalsRes.ok) throw new Error('Failed to fetch totals');
        const totalsData = await totalsRes.json();
        setTotals(totalsData);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [isAuthenticated]);

  const handleLogin = (email, password) => {
    if (email === 'user@example.com' && password === 'password') {
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setTotals(null);
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Box bg="gray.100" minH="100vh">
      {/* Header */}
      <Flex
        as="header"
        align="center"
        justify="space-between"
        p={4}
        bg="white"
        borderBottomWidth="1px"
        borderColor="gray.200"
      >
        <Flex align="center">
          <Icon as={FaShopify} w={8} h={8} color="blue.500" />
          <Heading size="md" ml={3}>
            Shopify Insights
          </Heading>
        </Flex>
        <Button onClick={handleLogout} colorScheme="blue" variant="outline">
          Logout
        </Button>
      </Flex>

      {/* Main Content */}
      <Box as="main" p={8}>
        {isLoading ? (
          <Flex justify="center" align="center" height="50vh">
            <Spinner size="xl" />
          </Flex>
        ) : (
          totals && (
            <VStack spacing={8} align="stretch">
              {/* Metric Cards Grid */}
              <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={6}>
                <Stat p={5} shadow="md" borderWidth="1px" borderRadius="md" bg="white">
                  <StatLabel>Total Revenue</StatLabel>
                  <StatNumber fontSize="3xl">${totals.totalRevenue.toFixed(2)}</StatNumber>
                </Stat>
                <Stat p={5} shadow="md" borderWidth="1px" borderRadius="md" bg="white">
                  <StatLabel>Total Orders</StatLabel>
                  <StatNumber fontSize="3xl">{totals.totalOrders}</StatNumber>
                </Stat>
                <Stat p={5} shadow="md" borderWidth="1px" borderRadius="md" bg="white">
                  <StatLabel>Total Customers</StatLabel>
                  <StatNumber fontSize="3xl">{totals.totalCustomers}</StatNumber>
                </Stat>
                <Stat p={5} shadow="md" borderWidth="1px" borderRadius="md" bg="white">
                  <StatLabel>Average Order Value</StatLabel>
                  <StatNumber fontSize="3xl">
                    ${(totals.totalRevenue / totals.totalOrders).toFixed(2)}
                  </StatNumber>
                </Stat>
              </SimpleGrid>

              <TopCustomers /> 
              
              <Charts /> {/* <-- Add the new component here */}
            </VStack>
          )
        )}
      </Box>
    </Box>
  );
}

export default App;