// 見積明細表の列定義（画面とPDFの単一の基準）
//
// このファイルは「どの列を、どの幅で、どう揃えて、どんな種別として出すか」だけを持つ。
// 次のものはここへ書かない:
//   - 計算ロジック（小計・消費税・合計）→ workItemEstimate.ts の既存関数を使う
//   - 値の取り出し           → estimateCellAccessors.ts
//   - 選択肢の実体           → sheetOptions.ts（ここは参照キーだけ持つ）
//
// 幅の合計は 100%。react-pdf は CSS を解さないため、幅は文字列の % で持つ。

/** 表示の揃え。react-pdf / DOM の双方で同じ意味を持たせる。 */
export type ColumnAlign = "left" | "center" | "right";

/**
 * 値の性質。PDF と DOM の両方が参照する。
 *
 * unit は「画面とPDFで表示が変わる」ことを型として明示するための種別。
 * 画面は職人に自然な ㎡ ㎥ ㎏ を出し、PDFは safePdfUnit() で m2 m3 kg へ変換する。
 * これはフォントが合字グリフを持たないための意図的な仕様差である。
 */
export type CellValue = "text" | "number" | "currency" | "unit";

/**
 * 編集時の入力部品。DOM のみが参照する。
 * PDF はこの値を一切読まない（入力部品を増やしてもPDFの見た目に影響しない）。
 *
 * dropdown-free は自由入力も可能なコンボボックス。
 * HTML の datalist は使わず、独自実装とする。
 */
export type CellControl =
  | "readonly"
  | "text"
  | "textarea"
  | "number"
  | "dropdown"
  | "dropdown-free";

export type EstimateColumn = {
  /** 列の識別子。行データのフィールド名とは独立に持つ（複合セルがあるため） */
  id: string;
  /** 帳票の列見出し */
  label: string;
  /** 列幅（% 文字列。合計100%） */
  width: string;
  align: ColumnAlign;
  value: CellValue;
  control: CellControl;
  /** 選択肢の参照キー。実体は sheetOptions.ts。DOM のみが解決する。 */
  optionsKey?: string;
};

/**
 * 見積明細表の10列。
 *
 * 並び・幅・見出しは、改修前の WorkEstimatePDF.tsx と sample 側 EstimatePDF.tsx で
 * 完全に一致していたものをそのまま採用している。
 * 変更すると既存帳票の見た目が変わるため、変更時はPDFの画像差分確認を必須とする。
 */
export const ESTIMATE_COLUMNS: readonly EstimateColumn[] = [
  { id: "category",        label: "項目",     width: "9%",  align: "left",   value: "text",     control: "dropdown",      optionsKey: "workCategory" },
  { id: "workName",        label: "工事名",   width: "11%", align: "left",   value: "text",     control: "dropdown-free", optionsKey: "workName" },
  { id: "workDescription", label: "工事内容", width: "24%", align: "left",   value: "text",     control: "textarea" },
  { id: "location",        label: "施工箇所", width: "11%", align: "left",   value: "text",     control: "dropdown-free", optionsKey: "location2" },
  { id: "quantity",        label: "数量",     width: "5%",  align: "right",  value: "number",   control: "number" },
  { id: "unit",            label: "単位",     width: "5%",  align: "center", value: "unit",     control: "dropdown",      optionsKey: "unit" },
  { id: "unitPrice",       label: "単価",     width: "9%",  align: "right",  value: "currency", control: "number" },
  { id: "subtotal",        label: "小計",     width: "9%",  align: "right",  value: "currency", control: "readonly" },
  { id: "tax",             label: "消費税",   width: "9%",  align: "right",  value: "currency", control: "readonly" },
  { id: "note",            label: "備考",     width: "8%",  align: "left",   value: "text",     control: "text" },
] as const;

/** 列IDから定義を引く（存在しないIDは開発時に気づけるよう例外にする） */
export function estimateColumn(id: string): EstimateColumn {
  const found = ESTIMATE_COLUMNS.find((c) => c.id === id);
  if (!found) throw new Error(`未定義の見積列: ${id}`);
  return found;
}
