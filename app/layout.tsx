import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TRPCReactProvider } from "@/lib/trpc/client";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { SerwistProvider } from "@serwist/turbopack/react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Householder",
  description: "Shared shopping lists for your household",
  applicationName: "Householder",
  appleWebApp: { capable: true, title: "Householder", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0d0709" },
    { media: "(prefers-color-scheme: light)", color: "#faf6f5" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV !== "production"}>
          <NextIntlClientProvider>
            <ThemeProvider>
              <TRPCReactProvider>
                {children}
                <Toaster />
              </TRPCReactProvider>
            </ThemeProvider>
          </NextIntlClientProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
