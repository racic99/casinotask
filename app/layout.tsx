import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { getSiteUrl, SITE_NAME, SITE_DESCRIPTION } from "@/lib/seo";
import { env } from "@/lib/env";

// display: "swap" renders text immediately in a metric-compatible fallback,
// then swaps to Geist — avoids invisible text (LCP delay) and minimizes CLS.
const geist = Geist({ subsets: ["latin"], display: "swap" });

const siteUrl = getSiteUrl();
const supabaseOrigin = new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${SITE_NAME} — Real reviews for real companies`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Real reviews for real companies`,
    description: SITE_DESCRIPTION,
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Real reviews for real companies`,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.className} h-full`}>
      <head>
        {/* Warm up the Supabase connection so client-side auth/data calls don't
            pay TLS + DNS on first use. */}
        <link rel="preconnect" href={supabaseOrigin} crossOrigin="anonymous" />
        <link rel="dns-prefetch" href={supabaseOrigin} />
      </head>
      <body className="min-h-full flex flex-col bg-gray-50">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-green-700 focus:shadow focus:outline-none focus:ring-2 focus:ring-green-600"
        >
          Skip to content
        </a>
        <Navbar />
        <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
        <footer className="border-t border-gray-100 bg-white py-6 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} ReviewHub
        </footer>
      </body>
    </html>
  );
}
