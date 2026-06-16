import { getRequestContext } from "@cloudflare/next-on-pages";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

export type Database = DrizzleD1Database<typeof schema>;

export function getDb(): Database {
  const { env } = getRequestContext();

  if (!env.DB) {
    throw new Error(
      'D1 binding "DB" is not configured. Add it in wrangler.toml and Cloudflare Pages project settings.',
    );
  }

  return drizzle(env.DB, { schema });
}
