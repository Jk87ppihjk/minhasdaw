import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Ouve em todos os endereços de rede
    allowedHosts: [
      'minhasdaw.onrender.com', // Permite o host específico
      'localhost',
      '127.0.0.1'
    ]
  }
});  