import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Authorized Staff Sign-In" };

export default function StaffSignInLayout({ children }: { children: React.ReactNode }) {
  return children;
}
