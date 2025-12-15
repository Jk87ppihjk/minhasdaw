
// /// <reference types="vite/client" />

declare module 'file-saver';
declare module '@google/genai';

declare namespace NodeJS {
  interface ProcessEnv {
    API_KEY: string;
    DB_HOST?: string;
    DB_USER?: string;
    DB_PASSWORD?: string;
    DB_NAME?: string;
  }
}
