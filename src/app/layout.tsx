import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import SwRegister from "@/components/sw-register";
import "./globals.css";

// Brand type (docs/DESIGN.md): Inter for UI, JetBrains Mono for terminal/taxonomy.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Beam",
  description: "Beam your laptop's AI coding agent to your phone",
  // iOS "Add to Home Screen" — standalone, no Safari chrome.
  appleWebApp: {
    capable: true,
    title: "Beam",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  // Android: resize the layout viewport for the keyboard (iOS ignores this;
  // app-shell compensates via visualViewport there).
  interactiveWidget: "resizes-content",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="h-full flex flex-col bg-canvas text-ink">
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
