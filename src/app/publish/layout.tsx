import type { Metadata } from "next";

export const metadata: Metadata = { title: "发布中心" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
