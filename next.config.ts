import type { NextConfig } from "next";

// 開発サーバーは Turbopack を使わず Webpack で起動する（package.json の "next dev --webpack"）。
// Turbopack のキャッシュ破損（.next/dev/cache/turbopack の ENOENT・manifest 欠落）による
// 実機開発時の 500 エラーを避けるため。build 設定（本番）は変更しない。

// Mac と iPhone を同一 Wi-Fi でつないで実機確認するとき、
// Next.js は dev サーバーの LAN オリジンからのリクエストをデフォルトで警告/ブロックする。
// 開発環境に限り、許可するオリジンを明示する。
// ・固定 LAN IP を本番設定に埋め込まないよう、production では一切追加しない。
// ・他の開発者の LAN IP は NEXT_DEV_ORIGINS（カンマ区切り）で上書き追加できる。
const isDev = process.env.NODE_ENV !== "production";

const extraDevOrigins = (process.env.NEXT_DEV_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const devOrigins = [
  "localhost",
  "127.0.0.1",
  "192.168.3.2",
  ...extraDevOrigins,
];

const nextConfig: NextConfig = {
  // allowedDevOrigins は開発時のみ有効な設定。production ビルドには含めない。
  ...(isDev ? { allowedDevOrigins: devOrigins } : {}),
};

export default nextConfig;
