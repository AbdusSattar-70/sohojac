import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "One-time owner setup",
  robots: { index: false, follow: false },
};

export default function SetupOwnerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
