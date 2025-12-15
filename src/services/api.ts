import axios from 'axios';

// Usamos caminho relativo vazio.
// Em DEV (npm run dev): O proxy do Vite (vite.config.ts) captura '/api' e manda para 'http://localhost:3000'.
// Em PROD (npm start): O server.js serve o front e a API no mesmo domínio/porta, então '/api' funciona nativamente.
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