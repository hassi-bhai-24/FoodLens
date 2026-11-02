import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FOODLENS — Chat before you eat unhealthy",
  description: "A food-only conversational AI chatbot. Ask about food, send photos, scan barcodes.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('foodlens-theme');var s=t&&t!=='system'?t:(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.dataset.theme=s;}catch(e){document.documentElement.dataset.theme='dark';}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
