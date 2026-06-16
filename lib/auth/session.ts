import { cookies } from "next/headers";
import {
  createSignedSessionToken,
  verifySignedSessionToken,
} from "@/lib/auth/crypto";
import { getSessionSecret } from "@/lib/auth/env";

export const ADMIN_SESSION_COOKIE = "admin_session";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24;
export const ADMIN_SESSION_PATH = "/admin";

/** Legacy path from an earlier session-cookie change; cleared on login/logout. */
const LEGACY_ADMIN_SESSION_PATH = "/";

const SESSION_COOKIE_PATHS = [ADMIN_SESSION_PATH, LEGACY_ADMIN_SESSION_PATH] as const;

type SessionCookieOptions = {
  name: string;
  value: string;
  httpOnly: true;
  secure: boolean;
  sameSite: "strict";
  path: string;
  maxAge: number;
  expires: Date;
};

function buildSessionCookie(
  value: string,
  path: string,
  maxAge: number,
): SessionCookieOptions {
  return {
    name: ADMIN_SESSION_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path,
    maxAge,
    expires: maxAge > 0 ? new Date(Date.now() + maxAge * 1000) : new Date(0),
  };
}

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

export async function createAdminSessionCookie(): Promise<SessionCookieOptions> {
  const secret = getSessionSecret();
  const value = await createSignedSessionToken(secret, ADMIN_SESSION_MAX_AGE);

  return buildSessionCookie(value, ADMIN_SESSION_PATH, ADMIN_SESSION_MAX_AGE);
}

export async function clearAdminSessionCookies(): Promise<void> {
  const cookieStore = await cookies();

  for (const path of SESSION_COOKIE_PATHS) {
    cookieStore.delete({
      name: ADMIN_SESSION_COOKIE,
      path,
    });
    cookieStore.set(buildSessionCookie("", path, 0));
  }
}

export async function establishAdminSession(): Promise<void> {
  const cookieStore = await cookies();

  await clearAdminSessionCookies();
  cookieStore.set(await createAdminSessionCookie());
}
