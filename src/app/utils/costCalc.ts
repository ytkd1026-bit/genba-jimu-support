// 原価・売価・粗利の共通計算（単価マスタ方式）
//
// 重要方針（仕様9）: 計算式は帳票・画面ごとに実装しない。ここへ集約する。
//   原価単価   = 材料原価単価 + 労務原価単価 + 外注原価単価 + その他原価単価
//   原価金額   = 原価単価 × 数量
//   参考売上単価 = 原価単価 ÷ (1 - 目標粗利率)   （円未満は四捨五入で表示）
//   見積金額   = 採用売上単価 × 数量
//   粗利額     = 見積金額 - 原価金額
//   実粗利率   = 粗利額 ÷ 見積金額
//
// 諸経費(expenseCost)は原価単価の構成に含めない（仕様9）。既存データの
// 諸経費は WorkItem 側の金額計算（computeWorkItemAmounts）でのみ加算され、
// 後方互換のために残す。

/** 円未満の丸め（表示・参考単価算出で使う共通ルール＝四捨五入） */
export function roundYen(n: number): number {
  return Math.round(n);
}

export type UnitCostParts = {
  materialUnitCost: number;
  laborUnitCost: number;
  subcontractUnitCost: number;
  otherUnitCost: number;
};

/** 原価単価 = 材料 + 労務 + 外注 + その他（単価どうしの合計） */
export function unitCostTotal(p: UnitCostParts): number {
  return (
    (p.materialUnitCost || 0) +
    (p.laborUnitCost || 0) +
    (p.subcontractUnitCost || 0) +
    (p.otherUnitCost || 0)
  );
}

/** 原価金額 = 原価単価 × 数量 */
export function costAmountOf(unitCost: number, quantity: number): number {
  return unitCost * quantity;
}

/**
 * 参考売上単価 = 原価単価 ÷ (1 - 目標粗利率)。円未満は四捨五入。
 * 目標粗利率は 0〜1 で渡す（25% なら 0.25）。
 * 粗利率が 0 以下なら原価単価そのまま、1 以上（不正）なら 0 を返す（ゼロ除算回避）。
 */
export function referenceSellingUnitPrice(
  unitCost: number,
  targetProfitRate: number,
): number {
  if (targetProfitRate >= 1) return 0;
  if (targetProfitRate <= 0) return roundYen(unitCost);
  return roundYen(unitCost / (1 - targetProfitRate));
}

/** 見積金額 = 採用売上単価 × 数量 */
export function sellingAmountOf(sellingUnitPrice: number, quantity: number): number {
  return sellingUnitPrice * quantity;
}

/** 粗利額 = 見積金額 - 原価金額 */
export function grossProfitOf(sellingAmount: number, costAmount: number): number {
  return sellingAmount - costAmount;
}

/** 実粗利率 = 粗利額 ÷ 見積金額（0〜1。見積0なら0） */
export function grossProfitRateOf(grossProfit: number, sellingAmount: number): number {
  return sellingAmount > 0 ? grossProfit / sellingAmount : 0;
}

// ─── 粗利警告（仕様13。閾値は後から変更できる構造） ───────────────
export type ProfitLevel = "ok" | "caution" | "warning";

/**
 * 粗利率の判定閾値（0〜1）。
 *   ok      : okMin 以上 → 正常
 *   caution : cautionMin 以上 okMin 未満 → 注意
 *   warning : cautionMin 未満 → 警告
 * 数値ロジックは後から差し替え可能なよう、ここを1か所で管理する。
 */
export type ProfitThresholds = { cautionMin: number; okMin: number };

export const DEFAULT_PROFIT_THRESHOLDS: ProfitThresholds = {
  cautionMin: 0.2, // 20%
  okMin: 0.25, // 25%
};

/** 粗利率（0〜1）から警告レベルを返す。売価入力自体は禁止しない（表示のみ）。 */
export function profitLevel(
  rate: number,
  thresholds: ProfitThresholds = DEFAULT_PROFIT_THRESHOLDS,
): ProfitLevel {
  if (rate >= thresholds.okMin) return "ok";
  if (rate >= thresholds.cautionMin) return "caution";
  return "warning";
}
