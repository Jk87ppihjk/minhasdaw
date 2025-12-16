import axios from 'axios';

let API_URL = '';

// Safe detection of environment without relying on import.meta.env.PROD
// which can be undefined in certain Vite/Browser runtime configurations.
try {
  if (typeof window !== 'undefined') {
     const hostname = window.location.hostname;
     // Check for common local development hostnames
     if (hostname === 'localhost' || hostname === '127.0.0.1') {
         API_URL = 'http://localhost:3000';
     }
  }
} catch (e) {
  console.warn("Environment detection failed, defaulting to relative API path.");
}

export const api = axios.create({
    baseURL: `${API_URL}/api`,
});
