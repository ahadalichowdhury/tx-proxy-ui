import Link from "next/link";
import { ensureGuestOnLoginPage } from "@/app/actions/auth";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";

export const runtime = "edge";

export default async function AdminLoginPage() {
  await ensureGuestOnLoginPage();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.08),_transparent_35%),linear-gradient(to_bottom,_#09090b,_#020617)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/70 p-8 shadow-2xl shadow-black/30 backdrop-blur-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
            Secure Access
          </p>
          <h1 className="mt-2 text-2xl font-bold text-zinc-50">Admin Sign In</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Credentials are verified on the server only.
          </p>
        </div>

        <AdminLoginForm />

        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-sm text-zinc-500 transition hover:text-zinc-300"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
