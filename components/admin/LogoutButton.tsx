"use client";

import { useFormStatus } from "react-dom";
import { logoutAdmin } from "@/app/actions/auth";

function LogoutSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:opacity-60"
    >
      {pending ? "Signing out..." : "Sign Out"}
    </button>
  );
}

export function LogoutButton() {
  return (
    <form action={logoutAdmin}>
      <LogoutSubmitButton />
    </form>
  );
}
