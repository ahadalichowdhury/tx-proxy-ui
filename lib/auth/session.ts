import { cookies } from "next/headers";
import {
  createSignedSessionToken,
  verifySignedSessionToken,
} from "@/lib/auth/crypto";
import { getSessionSecret } from "@/lib/auth/env";

export const ADMIN_SESSION_COOKIE = "admin_session";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24;

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!token) {
    return false;
  }

  try {
    const secret = getSessionSecret();
    return verifySignedSessionToken(token, secret);
  } catch {
    return false;
  }
}

export async function requireAdminSession(): Promise<void> {
  const authenticated = await isAdminAuthenticated();

  if (!authenticated) {
    throw new Error("Unauthorized");
  }
}

export async function createAdminSessionCookie(): Promise<{
  name: string;
  value: string;
  httpOnly: true;
  secure: boolean;
  sameSite: "strict";
  path: string;
  maxAge: number;
}> {
  const secret = getSessionSecret();
  const value = await createSignedSessionToken(secret, ADMIN_SESSION_MAX_AGE);

  return {
    name: ADMIN_SESSION_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: ADMIN_SESSION_MAX_AGE,
  };
}

export function getClearAdminSessionCookie(): {
  name: string;
  value: string;
  httpOnly: true;
  secure: boolean;
  sameSite: "strict";
  path: string;
  maxAge: 0;
} {
  return {
    name: ADMIN_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: 0,
  };
}
