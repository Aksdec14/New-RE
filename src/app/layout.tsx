import type { Metadata, Viewport } from "next";

import { PwaRegister } from "@/components/pwa-register";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Resto POS",
    template: "%s · Resto POS",
  },
  description:
    "Offline-first restaurant point of sale with GST billing, kitchen display and subscription billing.",
  applicationName: "Resto POS",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Resto POS",
  },
};

export const viewport: Viewport = {
  themeColor: "#17130f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-IN">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
