// 明細行データから、各セルの表示値を取り出す。
//
// 計算はここで行わない。行別の消費税は WorkEstimatePDF の lineTaxForDisplay を、
// 合計は workItemEstimate.ts の computeEstimateTotals をそれぞれ参照する。
// 同じ計算を二重に実装しないこと。
//
// 施工箇所と備考は「1つのフィールドに対応しない複合セル」である:
//   施工箇所 … location1 と location2 の2つの値を持つ
//   備考     … ユーザー入力の note と、自動表示の税区分マークを分けて持つ
// 税区分マークは note へ書き込まない（保存データを汚さない）。

import {
  lineTaxForDisplay,
  type SellingLine,
} from "@/components/pdf/WorkEstimatePDF";
import {
  taxTypeLabel,
  normalizeTaxType,
  normalizeTaxRate,
} from "@/app/utils/taxCalculation";

/** 施工箇所セルが持つ2つの値 */
export type LocationCellValue = {
  location1: string;
  location2: string;
};

/** 備考セルが持つ2つの値。mark は自動表示で編集不可。 */
export type NoteCellValue = {
  /** ユーザーが入力した備考 */
  note: string;
  /** 税区分の自動表示（課税10%は既定のため空文字） */
  mark: string;
};

/** 備考へ添える税区分マーク（課税10%は既定のため付けない） */
export function taxMarkOf(line: SellingLine): string {
  const type = normalizeTaxType(line.taxType);
  const rate = normalizeTaxRate(line.taxRate);
  if (type === "taxable" && rate === 10) return "";
  if (type === "taxable") return `課税${rate}%`;
  return taxTypeLabel(type);
}

export function locationCell(line: SellingLine): LocationCellValue {
  return { location1: line.location1 ?? "", location2: line.location2 ?? "" };
}

export function noteCell(line: SellingLine): NoteCellValue {
  return { note: line.note ?? "", mark: taxMarkOf(line) };
}

/**
 * 単一値のセルを列IDで取り出す。
 * 複合セル（location / note）はここでは扱わず、専用の関数を使う。
 */
export function estimateCellValue(line: SellingLine, columnId: string): string | number {
  switch (columnId) {
    case "category":        return line.category ?? "";
    case "workName":        return line.workName ?? "";
    case "workDescription": return line.workDescription ?? "";
    case "quantity":        return line.quantity;
    case "unit":            return line.unit ?? "";
    case "unitPrice":       return line.sellingUnitPrice;
    case "subtotal":        return line.sellingAmount;
    case "tax":             return lineTaxForDisplay(line); // 既存関数を参照（重複実装しない）
    default:
      throw new Error(`単一値では扱えない列です: ${columnId}`);
  }
}
