import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteProvider } from "@/components/site-provider";
import { Header, Footer } from "@/components/shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "BeautyScan AI",
  description: "BeautyScan AI — product photography and multilingual packaging workflows for beauty brands.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body><SiteProvider><Header />{children}<Footer /></SiteProvider></body>
    </html>
  );
}
