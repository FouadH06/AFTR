import type { Metadata, Viewport } from "next";
import { Inter, Unbounded } from "next/font/google";
import { getBrand } from "@/lib/brand";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const unbounded = Unbounded({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-unbounded", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBrand();
  return { title: { default: b.name, template: `%s · ${b.name}` }, description: b.tagline };
}
export const viewport: Viewport = { themeColor: "#08080B", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const b = await getBrand();
  return (
    <html lang="en" className={`${inter.variable} ${unbounded.variable}`}
      style={{ "--brand-primary": b.primary_color, "--brand-secondary": b.secondary_color } as React.CSSProperties}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
