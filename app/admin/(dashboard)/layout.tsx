import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/auth/session";

export const runtime = "edge";

export default async function ProtectedAdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const authenticated = await isAdminAuthenticated();

  if (!authenticated) {
    redirect("/admin/login");
  }

  return children;
}
