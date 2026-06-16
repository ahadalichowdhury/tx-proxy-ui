"use server";

import { redirect } from "next/navigation";
import { verifyAdminPassword } from "@/lib/auth/crypto";
import { getAdminPassword } from "@/lib/auth/env";
import {
  establishAdminSession,
  clearAdminSessionCookies,
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

  await establishAdminSession();

  redirect("/admin");
}

export async function logoutAdmin(): Promise<void> {
  await clearAdminSessionCookies();
  redirect("/admin/login");
}

export async function ensureGuestOnLoginPage(): Promise<void> {
  if (await isAdminAuthenticated()) {
    redirect("/admin");
  }
}
