
import axios from 'axios';

// Detecta se está em ambiente de desenvolvimento (Vite) ou produção
const API_URL = import.meta.env.PROD ? '' : 'http://localhost:3000';

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
