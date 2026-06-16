import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TodayMatches } from "@/components/TodayMatches";
import { PresenceHeartbeat } from "@/components/PresenceHeartbeat";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IPTV Proxy Dashboard",
  description: "Modern IPTV streaming dashboard with proxied HLS playback.",
  icons: {
    icon: "/globe.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-zinc-950 text-zinc-100">
        {children}
        <PresenceHeartbeat />
        <TodayMatches />
      </body>
    </html>
  );
}
