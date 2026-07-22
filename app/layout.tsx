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
    description: "在浏览器中识别五线谱照片，校对音高与节奏，查看降 B 调单簧管 E3-A6 完整指法并试听实际音高。",
    openGraph: {
      title: "音乐助教",
      description: "浏览器智能识谱 · 42 音完整指法 · 逐拍试听",
      type: "website",
      images: [{ url: "/og.png", width: 1680, height: 945, alt: "音乐助教单簧管学习平台" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "音乐助教",
      description: "浏览器智能识谱 · 42 音完整指法 · 逐拍试听",
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
