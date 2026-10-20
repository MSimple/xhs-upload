import type { Metadata } from "next";

export const metadata: Metadata = { title: "临时活动" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
