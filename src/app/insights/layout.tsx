import type { Metadata } from "next";

export const metadata: Metadata = { title: "数据看板" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
