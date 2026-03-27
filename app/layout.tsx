import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Questown MVP",
  description: "Duolingo-inspired game todo app",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Questown"
  },
  icons: {
    apple: "/apple-touch-icon.png"
  }
};

export const viewport: Viewport = {
  themeColor: "#4f46e5"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
