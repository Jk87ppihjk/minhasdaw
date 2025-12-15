
import axios from 'axios';

// Detect environment based on hostname instead of Vite's import.meta.env
// because import.meta.env might be undefined in some CDN/runtime contexts.
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocalhost ? 'http://localhost:3000' : '';

export const api = axios.create({
    baseURL: `${API_URL}/api`,
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('monochrome_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});
