// 新UI（/new）共通レイアウト。
// 既存の RootLayout（src/app/layout.tsx）の内側に入り、フォント等は共通のまま、
// ここで新UIの背景・最大幅・下部ナビ（Safe Area 対応）を付与する。
// 旧UIには一切影響しない。

import type { Metadata } from "next";
import BottomNav from "./_components/BottomNav";

export const metadata: Metadata = {
  title: "現場の事務サポ（新UI）",
  description: "現場の連絡から入金まで、片手でつなぐ現場業務アプリ",
};

export default function NewUiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f6f8f8] text-[#1f2a2e]">
      {/* 下部ナビの高さ分（約64px）＋Safe Area を確保 */}
      <div
        className="mx-auto max-w-md"
        style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom))" }}
      >
        {children}
      </div>
      <BottomNav />
    </div>
  );
}
