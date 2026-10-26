import type { Metadata } from "next";
import { Montserrat, Noto_Sans_Bengali } from "next/font/google";
import { LanguageProvider } from "@/components/providers/language-provider";
import "./globals.css";

const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-en", display: "swap" });
const bengali = Noto_Sans_Bengali({ subsets: ["bengali"], variable: "--font-bn", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Sohoj Academy", template: "%s | Sohoj Academy" },
  description: "Learning made easy & fun",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${montserrat.variable} ${bengali.variable} font-sans antialiased dark`}>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
