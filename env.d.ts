/// <reference types="@cloudflare/workers-types" />

declare global {
  interface CloudflareEnv {
    DATA_API_URL?: string;
    DATA_API_SECRET?: string;
    ADMIN_PASSWORD: string;
    SESSION_SECRET: string;
    PROXY_BASE_URL?: string;
    NEXT_PUBLIC_PROXY_BASE_URL?: string;
    PROXY_TOKEN_SECRET?: string;
  }
}

export {};
