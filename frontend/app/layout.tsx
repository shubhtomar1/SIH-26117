import type { Metadata } from "next";
import { Newsreader, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-newsreader",
  fallback: ["Times New Roman", "serif"],
});

const plex = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex",
});

export const metadata: Metadata = {
  title: "ADRESTIA — Sovereign AI Workbench",
  description: "From Confidential Data → Verified Action. Secure AI workspace for confidential industrial work.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${newsreader.variable} ${plex.variable}`}>
      <body className="min-h-screen bg-black text-slate-100">{children}</body>
    </html>
  );
}