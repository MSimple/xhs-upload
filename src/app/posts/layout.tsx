import type { Metadata } from "next";

export const metadata: Metadata = { title: "作品库" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
