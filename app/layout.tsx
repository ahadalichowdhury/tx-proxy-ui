import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AdSenseScript } from "@/components/AdSenseScript";
import { TodayMatches } from "@/components/TodayMatches";
import { PresenceHeartbeat } from "@/components/PresenceHeartbeat";
import { ADSENSE_CLIENT_ID } from "@/lib/adsense/config";
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
  title: "IPTV Player",
  description: "IPTV Player",
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
      <head>
        <meta name="google-adsense-account" content={ADSENSE_CLIENT_ID} />
        <AdSenseScript />
      </head>
      <body className="min-h-full bg-zinc-950 text-zinc-100">
        {children}
        <PresenceHeartbeat />
        <TodayMatches />
      </body>
    </html>
  );
}
