import axios from 'axios';

// Usamos caminho relativo. 
// Em DEV: O Vite proxy redireciona '/api' para 'http://localhost:3000/api'
// Em PROD: O server.js serve tanto o front quanto o back no mesmo domínio
const API_URL = '';

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