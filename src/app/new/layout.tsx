// 新UI（/new）共通レイアウト。
// 既存の RootLayout（src/app/layout.tsx）の内側に入り、フォント等は共通のまま、
// ここで新UIの背景・最大幅・下部ナビ（Safe Area 対応）を付与する。
// 旧UIには一切影響しない。
//
// テーマ: Cookie をサーバーで読み、初期テーマとして ThemeProvider へ渡す。
// これにより SSR の HTML に最初から正しいテーマが乗る（チラつき・mismatch なし）。
// nu-root の div は ThemeProvider（クライアント）が描画し、React が属性を所有する。
// 色そのものは globals.css の CSS 変数（--nu-*）で定義する。

import type { Metadata } from "next";
import { cookies } from "next/headers";
import BottomNav from "./_components/BottomNav";
import ThemeProvider from "./_components/ThemeProvider";
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  isThemeId,
  type ThemeId,
} from "./_lib/themeColors";

export const metadata: Metadata = {
  title: "現場の事務サポ（新UI）",
  description: "現場の連絡から入金まで、片手でつなぐ現場業務アプリ",
};

export default async function NewUiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = await cookies();
  const saved = store.get(THEME_STORAGE_KEY)?.value;
  const initialTheme: ThemeId = isThemeId(saved) ? saved : DEFAULT_THEME;

  return (
    <ThemeProvider initialTheme={initialTheme}>
      {/* 下部ナビの高さ分（約72px）＋Safe Area を確保 */}
      <div
        className="nu-shell mx-auto w-full"
        style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom))" }}
      >
        {children}
      </div>
      <BottomNav />
    </ThemeProvider>
  );
}
