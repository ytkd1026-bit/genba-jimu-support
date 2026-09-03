// 新UI（/new）のテーマカラー定義。
// アクセント色のみを差し替える軽量テーマ。中立色（白基調）は共通。
// 保持は localStorage の専用キーのみ（既存の localStorage 設計には触れない）。

export type ThemeId = "teal" | "navy" | "green" | "gray";

export const THEME_STORAGE_KEY = "genba_nu_theme_v1";

export const DEFAULT_THEME: ThemeId = "teal";

export type ThemeOption = {
  id: ThemeId;
  label: string;
  description: string;
  // プレビュー用スウォッチ（globals.css の変数と一致させる）
  swatch: { primary: string; primaryDk: string; bg: string };
};

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "teal",
    label: "青緑（標準）",
    description: "落ち着いた現場向けの標準色",
    swatch: { primary: "#0d9488", primaryDk: "#0f766e", bg: "#e6f4f2" },
  },
  {
    id: "navy",
    label: "ネイビー",
    description: "信頼感のある濃い青",
    swatch: { primary: "#2563eb", primaryDk: "#1d4ed8", bg: "#e7eefc" },
  },
  {
    id: "green",
    label: "グリーン",
    description: "明るい緑系",
    swatch: { primary: "#16a34a", primaryDk: "#15803d", bg: "#e6f5ec" },
  },
  {
    id: "gray",
    label: "グレー",
    description: "モノトーン寄りの控えめな配色",
    swatch: { primary: "#475569", primaryDk: "#334155", bg: "#eef1f5" },
  },
];

export function isThemeId(v: unknown): v is ThemeId {
  return v === "teal" || v === "navy" || v === "green" || v === "gray";
}
