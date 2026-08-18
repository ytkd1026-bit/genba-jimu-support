// 数値入力の全角・半角正規化ユーティリティ（共通）
//
// 現場では全角数字での入力が頻繁に起きる（「１２」「２５０」「１，２００」）。
// これらを数値として正しく認識できるよう、正規化処理をここへ集約する。
// 画面ごとに独自実装しないこと。数量・単価・金額・粗利率など全数値入力欄で使う。
//
//   １２       → 12
//   ２５０      → 250
//   １２．５     → 12.5
//   １，２００    → 1200   （全角カンマ＝桁区切り）
//   １,２００    → 1200   （半角カンマ＝桁区切り）
//   ¥1,200-    → 1200   （通貨記号・ハイフン等の装飾は無視）
//
// 半角・全角が混在しても正しく数値化できるようにする。

/**
 * 入力文字列を「半角数字・小数点・マイナスのみ」へ正規化する。
 * - 全角数字（０-９）→ 半角（0-9）
 * - 全角ピリオド（．）→ 半角（.）
 * - 全角/半角カンマ（，,）→ 桁区切りとして除去
 * - 全角マイナス（−ー－）→ 半角（-）。先頭のマイナスのみ有効。
 * - 通貨記号・空白・その他の非数値文字は除去する
 *
 * 計算に使う値は parseNumericInput を推奨。表示欄の整形（onBlur 等）にはこの関数を使う。
 */
export function normalizeNumericString(input: string): string {
  if (input == null) return "";

  // 全角英数記号を半角へ（U+FF01–FF5E → U+0021–007E）
  let s = String(input).replace(/[！-～]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );

  // 各種マイナス記号を半角ハイフンへ統一
  s = s.replace(/[−ー－‐-―]/g, "-");

  // 桁区切りカンマ・空白（全角空白含む）を除去
  s = s.replace(/[,\s　]/g, "");

  // 数字・小数点・マイナス以外を除去（¥ や 円 などの装飾を落とす）
  s = s.replace(/[^0-9.\-]/g, "");

  // マイナスは先頭の1つだけ有効にする
  const negative = s.startsWith("-");
  s = s.replace(/-/g, "");
  if (negative) s = "-" + s;

  // 小数点は最初の1つだけ有効にする（以降の "." は除去）
  const firstDot = s.indexOf(".");
  if (firstDot >= 0) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }

  return s;
}

/**
 * 入力文字列を数値へ変換する。全角入力・桁区切り・装飾を吸収する。
 * 数値として解釈できない場合は fallback（既定 0）を返す。
 */
export function parseNumericInput(input: string, fallback = 0): number {
  const s = normalizeNumericString(input);
  if (s === "" || s === "-" || s === ".") return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}
