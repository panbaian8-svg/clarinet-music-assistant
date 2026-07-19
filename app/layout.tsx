import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    metadataBase,
    title: "音乐助教｜单簧管新手识谱与指法练习",
    description: "上传五线谱照片，查看降 B 调单簧管指法、节奏提示并试听实际音高。",
    openGraph: {
      title: "音乐助教",
      description: "看得懂 · 按得对 · 听得见",
      type: "website",
      images: [{ url: "/og.png", width: 1680, height: 945, alt: "音乐助教单簧管学习平台" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "音乐助教",
      description: "看得懂 · 按得对 · 听得见",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
