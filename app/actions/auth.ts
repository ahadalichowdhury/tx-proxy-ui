"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAdminPassword } from "@/lib/auth/crypto";
import { getAdminPassword } from "@/lib/auth/env";
import {
  createAdminSessionCookie,
  getClearAdminSessionCookie,
  isAdminAuthenticated,
} from "@/lib/auth/session";

export type AuthActionState = {
  error?: string;
};

export async function loginAdmin(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = formData.get("password")?.toString() ?? "";

  if (!password) {
    return { error: "Password is required." };
  }

  let configuredPassword: string;

  try {
    configuredPassword = getAdminPassword();
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Admin authentication is not configured.",
    };
  }

  if (!verifyAdminPassword(password, configuredPassword)) {
    return { error: "Invalid password." };
  }

  const cookieStore = await cookies();
  cookieStore.set(await createAdminSessionCookie());

  redirect("/admin");
}

export async function logoutAdmin(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(getClearAdminSessionCookie());
  redirect("/admin/login");
}

export async function ensureGuestOnLoginPage(): Promise<void> {
  if (await isAdminAuthenticated()) {
    redirect("/admin");
  }
}
