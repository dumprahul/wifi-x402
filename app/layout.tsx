import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Wifix402 — Pay-Per-Use WiFi on Base",
  description: "Programmable WiFi access powered by x402 + ERC-7710 delegation + 1Shot permissionless relayer. No login. No subscription. Pay in USDC.",
  keywords: ["wifi", "x402", "erc-7710", "1shot", "base", "usdc", "web3", "defi", "metamask"],
  openGraph: {
    title: "Wifix402 — Pay-Per-Use WiFi",
    description: "x402 + ERC-7710 + 1Shot relay. WiFi for cents, paid in USDC.",
    type: "website",
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
