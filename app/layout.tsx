import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { fraunces, switzer, jetBrainsMono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bachelor Party Planner",
  description: "Plan a group trip with your friends.",
  icons: {
    apple: "/apple-touch-icon.png",
  },
  other: {
    "color-scheme": "dark",
  },
};

export const viewport: Viewport = {
  themeColor: "#100C0F",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="bachelor"
      className={`${fraunces.variable} ${switzer.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
