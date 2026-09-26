import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { connection } from "next/server";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/brand";
import { CookieNotice } from "@/components/CookieNotice";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#5FD0EB",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Rendu dynamique : la CSP à nonce (générée par proxy.ts à chaque requête) ne peut pas s'appliquer à des pages statiques.
  await connection();
  return (
    <html lang="fr" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <CookieNotice />
      </body>
    </html>
  );
}
