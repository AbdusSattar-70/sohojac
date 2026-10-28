import type { Metadata, Viewport } from "next";
import { Montserrat, Noto_Sans_Bengali } from "next/font/google";
import { LanguageProvider } from "@/components/providers/language-provider";
import "./globals.css";

const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-en", display: "swap" });
const bengali = Noto_Sans_Bengali({ subsets: ["bengali"], variable: "--font-bn", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://sohojac.com"),
  title: { default: "Sohoj Academy", template: "%s | Sohoj Academy" },
  description: "Sohoj Academy — small batches, focused teaching, continuous assessment and measurable progress. Learning made easy & fun.",
  applicationName: "Sohoj Academy",
  icons: {
    icon: [
      { url: "/favicons/favicon.ico", sizes: "any" },
      { url: "/favicons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/favicons/apple-touch-icon.png" }],
  },
  manifest: "/favicons/site.webmanifest",
  openGraph: { type: "website", siteName: "Sohoj Academy", title: "Sohoj Academy",
    description: "Learning made easy & fun",
    images: [{ url: "/branding/sohoj-academy-logo.webp", width: 192, height: 192, alt: "Sohoj Academy" }],
  },
};
export const viewport: Viewport = { themeColor: "#071a45" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className="dark" suppressHydrationWarning>
    <body className={`${montserrat.variable} ${bengali.variable} font-sans antialiased`}>
      <LanguageProvider>{children}</LanguageProvider>
    </body>
  </html>;
}
