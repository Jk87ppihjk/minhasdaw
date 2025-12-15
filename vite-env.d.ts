/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly PROD: boolean;
  readonly DEV: boolean;
  readonly BASE_URL: string;
  readonly MODE: string;
  [key: string]: any;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'file-saver';
declare module '@google/genai';

declare namespace NodeJS {
  interface ProcessEnv {
    API_KEY: string;
  }
}