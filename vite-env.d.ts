/// <reference types="vite/client" />

declare module 'file-saver';
declare module '@google/genai';

declare namespace NodeJS {
  interface ProcessEnv {
    API_KEY: string;
  }
}
