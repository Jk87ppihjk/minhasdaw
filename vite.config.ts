import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // Carrega variáveis de ambiente do arquivo .env
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // Define variáveis globais acessíveis no código do cliente (navegador)
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      'process.env.MP_PUBLIC_KEY': JSON.stringify(env.MP_PUBLIC_KEY), // Chave Pública do Mercado Pago
    },
    server: {
      host: '0.0.0.0',
      port: 5174,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
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