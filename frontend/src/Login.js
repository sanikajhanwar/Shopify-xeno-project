import React, { useState } from 'react';
import {
  Box,
  Button,
  FormControl, // This is correct for v2
  FormLabel,   // This is correct for v2
  Input,
  VStack,
  Heading,
  Text,
  Icon,
} from '@chakra-ui/react';
import { FaShopify } from 'react-icons/fa';

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const success = onLogin(email, password);
    if (!success) {
      setError('Invalid email or password.');
    }
  };

  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="center"
      height="100vh"
      bg="gray.100"
    >
      <Box
        p={8}
        maxWidth="400px"
        borderWidth={1}
        borderRadius={8}
        boxShadow="lg"
        bg="white"
      >
        <VStack spacing={4}>
          <Icon as={FaShopify} w={12} h={12} color="blue.500" />
          <Heading as="h1" size="lg">
            Shopify Insights
          </Heading>
          <Text>Sign in to access your dashboard</Text>
          <form onSubmit={handleSubmit} style={{ width: '100%' }}>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel>Email</FormLabel>
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Password</FormLabel>
                <Input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </FormControl>
              {error && <Text color="red.500">{error}</Text>}
              <Button type="submit" colorScheme="blue" width="full">
                Sign In
              </Button>
            </VStack>
          </form>
          <Text fontSize="sm" color="gray.500" pt={4}>
            Hint: Use <strong>user@example.com</strong> and <strong>password</strong>
          </Text>
        </VStack>
      </Box>
    </Box>
  );
};

export default Login;