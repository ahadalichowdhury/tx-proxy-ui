import { getRequestContext } from "@cloudflare/next-on-pages";

type SecretKey = "ADMIN_PASSWORD" | "SESSION_SECRET";

function readSecret(key: SecretKey): string | undefined {
  try {
    const { env } = getRequestContext();
    const fromCloudflare = env[key];

    if (fromCloudflare) {
      return fromCloudflare;
    }
  } catch {
    // Fall back to process.env during local Next.js dev.
  }

  return process.env[key];
}

export function getAdminPassword(): string {
  const password = readSecret("ADMIN_PASSWORD");

  if (!password) {
    throw new Error(
      "ADMIN_PASSWORD is not configured. Create .dev.vars from .dev.vars.example, then restart the dev server.",
    );
  }

  return password;
}

export function getSessionSecret(): string {
  const secret = readSecret("SESSION_SECRET");

  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be at least 32 characters. Create .dev.vars from .dev.vars.example, then restart the dev server.",
    );
  }

  return secret;
}
