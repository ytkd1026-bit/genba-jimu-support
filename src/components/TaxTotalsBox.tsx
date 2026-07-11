"use client";

// 提出用の税込合計を画面表示する共通ボックス。
// 税率が1種類だけなら「売価小計／消費税／税込合計」、複数あれば税率別内訳を出す。
// 0円の区分は表示しない。PDFの PdfTaxBreakdownSummary と同じ集計結果を使う。

import { isMultiTax, type TaxBreakdown } from "@/app/utils/taxCalculation";

function fmtYen(n: number): string {
  return "¥" + n.toLocaleString("ja-JP");
}

export function TaxTotalsBox({
  breakdown,
  title = "提出用合計",
  totalLabel = "税込合計",
}: {
  breakdown: TaxBreakdown;
  title?: string;
  totalLabel?: string;
}) {
  const b = breakdown;
  const rows: Array<{ label: string; amount: number; strong?: boolean }> = [];

  if (!isMultiTax(b)) {
    rows.push({ label: "売価小計", amount: b.subtotal });
    rows.push({ label: "消費税", amount: b.taxTotal });
  } else {
    if (b.taxable10Subtotal > 0) {
      rows.push({ label: "10%対象額", amount: b.taxable10Subtotal });
      rows.push({ label: "消費税10%", amount: b.taxable10Tax });
    }
    if (b.taxable8Subtotal > 0) {
      rows.push({ label: "8%対象額", amount: b.taxable8Subtotal });
      rows.push({ label: "消費税8%", amount: b.taxable8Tax });
    }
    if (b.zeroRateSubtotal > 0) rows.push({ label: "0%対象額", amount: b.zeroRateSubtotal });
    if (b.nonTaxableSubtotal > 0) rows.push({ label: "非課税額", amount: b.nonTaxableSubtotal });
    if (b.taxExemptSubtotal > 0) rows.push({ label: "不課税額", amount: b.taxExemptSubtotal });
  }

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
      <h3 className="mb-2 text-xs font-bold text-stone-500">{title}</h3>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between text-sm">
            <span className="text-stone-500">{r.label}</span>
            <span className="font-bold text-stone-800">{fmtYen(r.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-stone-100 pt-1 text-sm">
          <span className="font-bold text-[#8B4A3C]">{totalLabel}</span>
          <span className="text-base font-bold text-[#8B4A3C]">{fmtYen(b.total)}</span>
        </div>
      </div>
    </div>
  );
}
