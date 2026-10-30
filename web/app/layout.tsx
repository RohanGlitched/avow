import type { Metadata, Viewport } from "next";
import "./globals.css";
import { archivo, bodoni } from "./fonts";
import { getState } from "@/lib/data";
import { LiveProvider } from "@/lib/live";
import { StatusStrip } from "@/components/StatusStrip";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: "Avow: an AI trader whose word is its bond", template: "%s · Avow" },
  description: SITE.tagline,
  openGraph: { title: "Avow", description: SITE.tagline, type: "website", siteName: "Avow" },
  twitter: { card: "summary_large_image", title: "Avow", description: SITE.tagline },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#edf0e8" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1915" },
  ],
};

export const revalidate = 15;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const state = await getState();
  return (
    <html lang="en-IN" className={`${bodoni.variable} ${archivo.variable}`}>
      <body>
        <a href="#main" className="skip">
          Skip to content
        </a>
        <LiveProvider initial={state}>
          <StatusStrip />
          <SiteHeader />
          <main id="main">{children}</main>
          <SiteFooter state={state} />
        </LiveProvider>
      </body>
    </html>
  );
}
