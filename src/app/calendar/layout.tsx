import type { Metadata } from "next";

export const metadata: Metadata = { title: "发布日历" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
