import type { Metadata } from "next";

export const metadata: Metadata = { title: "素材库" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
