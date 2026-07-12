// 税区分・税率と税額計算の共通ユーティリティ
//
// 重要方針: 税計算は帳票ごとに実装しない。WorkItem に保持した税区分・税率を
// この共通関数で集計し、見積・請求・PDF すべてで同じ結果を再利用する。
//
// 端数処理: 税率ごとに課税対象額を「合計してから」税額を計算し、Math.floor で
// 切り捨てる（明細ごとに切り捨てて合算しない）。アプリ内で計算方法は1つに統一する。

export type TaxType =
  | "taxable" // 課税
  | "non_taxable" // 非課税
  | "tax_exempt"; // 不課税・課税対象外

export type TaxRate = 0 | 8 | 10;

export type TaxBreakdown = {
  taxable10Subtotal: number; // 10%課税対象額
  taxable10Tax: number; // 10%消費税
  taxable8Subtotal: number; // 8%課税対象額
  taxable8Tax: number; // 8%消費税
  zeroRateSubtotal: number; // 課税だが税率0%（軽減対象外の0%等）
  nonTaxableSubtotal: number; // 非課税額
  taxExemptSubtotal: number; // 不課税・対象外額
  subtotal: number; // 税抜合計（全区分の課税対象額＋非課税＋不課税）
  taxTotal: number; // 消費税合計
  total: number; // 税込合計
};

export type TaxableLine = {
  amount: number;
  taxType: TaxType;
  taxRate: TaxRate;
};

// ─── 日本語ラベル ─────────────────────────────────────────────
export const TAX_TYPE_LABELS: Record<TaxType, string> = {
  taxable: "課税",
  non_taxable: "非課税",
  tax_exempt: "不課税・対象外",
};

/** 税区分を安全に正規化する（既存データに項目が無い場合は課税とみなす） */
export function normalizeTaxType(v: unknown): TaxType {
  return v === "non_taxable" || v === "tax_exempt" ? v : "taxable";
}

/** 税率を安全に正規化する（既存データに項目が無い場合は10%とみなす） */
export function normalizeTaxRate(v: unknown): TaxRate {
  return v === 0 || v === 8 ? v : 10;
}

export function taxTypeLabel(v: unknown): string {
  return TAX_TYPE_LABELS[normalizeTaxType(v)];
}

export function taxRateLabel(v: unknown): string {
  return `${normalizeTaxRate(v)}%`;
}

/**
 * 明細ごとの税区分に応じて、税率別に課税対象額と税額を集計する。
 * 税率ごとに合計してから Math.floor で切り捨てる。
 */
export function calculateTaxBreakdown(lines: TaxableLine[]): TaxBreakdown {
  let t10 = 0;
  let t8 = 0;
  let zero = 0;
  let nonTax = 0;
  let exempt = 0;

  for (const line of lines) {
    const type = normalizeTaxType(line.taxType);
    const amount = line.amount;
    if (type === "non_taxable") {
      nonTax += amount;
      continue;
    }
    if (type === "tax_exempt") {
      exempt += amount;
      continue;
    }
    // taxable
    const rate = normalizeTaxRate(line.taxRate);
    if (rate === 10) t10 += amount;
    else if (rate === 8) t8 += amount;
    else zero += amount;
  }

  // 税率ごとに合算後に切り捨てる
  const taxable10Tax = Math.floor(t10 * 0.1);
  const taxable8Tax = Math.floor(t8 * 0.08);

  const subtotal = t10 + t8 + zero + nonTax + exempt;
  const taxTotal = taxable10Tax + taxable8Tax;

  return {
    taxable10Subtotal: t10,
    taxable10Tax,
    taxable8Subtotal: t8,
    taxable8Tax,
    zeroRateSubtotal: zero,
    nonTaxableSubtotal: nonTax,
    taxExemptSubtotal: exempt,
    subtotal,
    taxTotal,
    total: subtotal + taxTotal,
  };
}

/** 税率が複数種類（10%と8%が両方）または非課税/不課税が混在するか */
export function isMultiTax(b: TaxBreakdown): boolean {
  const buckets = [
    b.taxable10Subtotal > 0,
    b.taxable8Subtotal > 0,
    b.zeroRateSubtotal > 0,
    b.nonTaxableSubtotal > 0,
    b.taxExemptSubtotal > 0,
  ].filter(Boolean).length;
  return buckets > 1;
}
