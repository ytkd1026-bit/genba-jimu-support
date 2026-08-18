// セル値の「画面用」表示書式。
//
// PDF用の書式（fmtYen / safePdfUnit）は PdfCommon.tsx にあり、そちらは変更しない。
// 画面とPDFで意図的に異なるのは unit だけ:
//   画面 … ㎡ ㎥ ㎏ をそのまま出す（職人に自然な表記）
//   PDF  … safePdfUnit() が m2 m3 kg へ変換する（フォントに合字グリフがないため）
//
// 金額と数量の書式は PDF と同一になるよう揃える。

import type { CellValue } from "./estimateSheetColumns";

/** 画面用の金額表記。PdfCommon.fmtYen と同じ結果になるよう合わせている。 */
export function screenYen(n: number): string {
  return "¥" + n.toLocaleString("ja-JP");
}

/**
 * 画面用のセル表示文字列。
 * unit は変換せずそのまま返すのが PDF との唯一の意図的な差。
 */
export function formatForScreen(value: string | number, kind: CellValue): string {
  switch (kind) {
    case "currency":
      return screenYen(typeof value === "number" ? value : Number(value) || 0);
    case "number":
      return String(value ?? "");
    case "unit":
      return String(value ?? ""); // 変換しない（PDF側のみ safePdfUnit を適用）
    case "text":
    default:
      return String(value ?? "");
  }
}
