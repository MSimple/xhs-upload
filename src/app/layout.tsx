import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: {
    default: "薯光工坊 · 小红书灵感工作台",
    template: "%s · 薯光工坊",
  },
  description: "把相册里的生活，变成一篇篇小红书笔记。AI 识别图片、智能成稿、排期发布。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
