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
import Charts from './Charts';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [totals, setTotals] = useState(null);
  const [funnelData, setFunnelData] = useState(null); // <-- New state for funnel data

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        // Fetch both totals and funnel data at the same time
        const [totalsRes, funnelRes] = await Promise.all([
          fetch(`${process.env.REACT_APP_API_URL}/api/insights/totals`),
          fetch(`${process.env.REACT_APP_API_URL}/api/insights/funnel`)
        ]);

        if (!totalsRes.ok || !funnelRes.ok) throw new Error('Failed to fetch data');
        
        const totalsData = await totalsRes.json();
        const funnelJson = await funnelRes.json();

        setTotals(totalsData);
        setFunnelData(funnelJson); // <-- Save the funnel data
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
    setFunnelData(null);
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
          (totals && funnelData) && ( // <-- Check for both data sources
            <VStack spacing={8} align="stretch">
              {/* --- UPDATED METRIC CARDS GRID --- */}
              <SimpleGrid columns={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing={6}>
                {/* Existing Cards */}
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

                {/* --- NEW BONUS CARDS --- */}
                <Stat p={5} shadow="md" borderWidth="1px" borderRadius="md" bg="white">
                  <StatLabel>Checkouts Started</StatLabel>
                  <StatNumber fontSize="3xl">{funnelData.checkoutsStarted}</StatNumber>
                </Stat>
                <Stat p={5} shadow="md" borderWidth="1px" borderRadius="md" bg="white">
                  <StatLabel>Abandoned Checkouts</StatLabel>
                  <StatNumber fontSize="3xl">{funnelData.abandonedCheckouts}</StatNumber>
                </Stat>
                <Stat p={5} shadow="md" borderWidth="1px" borderRadius="md" bg="white">
                  <StatLabel>Conversion Rate</StatLabel>
                  <StatNumber fontSize="3xl">{funnelData.conversionRate}%</StatNumber>
                </Stat>

              </SimpleGrid>

              <TopCustomers /> 
              
              <Charts />
            </VStack>
          )
        )}
      </Box>
    </Box>
  );
}

export default App;