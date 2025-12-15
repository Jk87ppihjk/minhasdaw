import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // Carrega variáveis de ambiente
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
    },
    server: {
      host: '0.0.0.0',
      port: 5174, // ALTERADO DE 5173 PARA 5174 PARA EVITAR CONFLITO COM O BACKEND
      // Configuração de Proxy para redirecionar chamadas /api para o backend
      proxy: {
        '/api': {
          target: 'http://localhost:3000', // Backend local roda na 3000
          changeOrigin: true,
          secure: false,
        }
      },
      allowedHosts: [
        'minhasdaw.onrender.com',
        'localhost',
        '127.0.0.1'
      ]
    }
  };
});