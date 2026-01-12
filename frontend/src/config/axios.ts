import axios from 'axios';

// Get backend URL from environment variable or use default
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const instance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default instance;
