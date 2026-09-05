// クロス見積の確定3方式（REVO確定仕様）
//
// クロスの見積は職人が案件ごとに方式を選ぶ。REVO側で自動判別しない。
// DB schema は変更しない：3方式はいずれも既存 WorkItem の行の組み合わせだけで表現する。
//   方式1 = 1行（施工のみ）
//   方式2 = 2行（材料費 + 施工費）
//   方式3 = 2行（材料費 + 施工人工費）
// 見積画面の「工事項目を追加」と、拾い出しからの見積反映の両方から使う。

export type CrossMethodId = "method1" | "method2" | "method3";

/** 方式ごとに作る明細行のひな形（単価は職人が入力する前提で 0） */
export type CrossRowTemplate = {
  category: string;
  workName: string;
  unit: string;
  /** true の行だけ拾い出しのm数を数量として引き継ぐ（人工行は引き継がない） */
  usesLengthQuantity: boolean;
};

export type CrossMethod = {
  id: CrossMethodId;
  label: string;
  formula: string;
  rows: CrossRowTemplate[];
};

export const CROSS_CATEGORY = "クロス工事";

export const CROSS_METHODS: CrossMethod[] = [
  {
    id: "method1",
    label: "方式1　クロス施工のみ",
    formula: "数量m × 施工単価",
    rows: [
      { category: CROSS_CATEGORY, workName: "クロス施工", unit: "m", usesLengthQuantity: true },
    ],
  },
  {
    id: "method2",
    label: "方式2　材料費 ＋ 施工費",
    formula: "数量m × 材料単価　＋　数量m × 施工単価",
    rows: [
      { category: CROSS_CATEGORY, workName: "クロス材料費", unit: "m", usesLengthQuantity: true },
      { category: CROSS_CATEGORY, workName: "クロス施工費", unit: "m", usesLengthQuantity: true },
    ],
  },
  {
    id: "method3",
    label: "方式3　材料費 ＋ 施工人工費",
    formula: "数量m × 材料単価　＋　人工数 × 人工単価",
    rows: [
      { category: CROSS_CATEGORY, workName: "クロス材料費", unit: "m", usesLengthQuantity: true },
      { category: CROSS_CATEGORY, workName: "クロス施工人工費", unit: "人工", usesLengthQuantity: false },
    ],
  },
];

export function crossMethodById(id: CrossMethodId): CrossMethod {
  const found = CROSS_METHODS.find((m) => m.id === id);
  if (!found) throw new Error(`unknown cross method: ${id}`);
  return found;
}

/** 人工行の既定数量（職人が見積画面で実数へ直す前提の初期値） */
export const DEFAULT_LABOR_QUANTITY = 1;
