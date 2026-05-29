"use client";

import Link from "next/link";
import { useState } from "react";

// ─── 型定義 ──────────────────────────────────────────────────
type LineItem = {
  id: number;
  category: string;
  koujiName: string;
  koujiContent: string;
  location1: string;
  location2: string;
  qty: string;
  unit: string;
  unitPrice: string;
  note: string;
};

type CostItem = {
  id: number;
  costCategory: string;
  targetCategory: string;
  targetKouji: string;
  content: string;
  qty: string;
  unit: string;
  costUnitPrice: string;
  note: string;
};

// ─── 定数 ────────────────────────────────────────────────────
const UNITS = ["m", "㎡", "枚", "式", "人工", "箇所", "本", "ケース", "台"];
const LOCATION2_OPTIONS = ["天井", "壁", "床", "共通"];
const COST_CATEGORIES = [
  "材料費", "副資材", "施工費", "外注費", "諸経費", "設備機器代", "その他",
];

// ─── 初期データ ───────────────────────────────────────────────
const initialLines: LineItem[] = [
  {
    id: 1, category: "内装工事", koujiName: "クロス貼替",
    koujiContent: "既存クロスめくり・下地処理・新規クロス貼り",
    location1: "洋室", location2: "壁", qty: "50", unit: "m", unitPrice: "1200", note: "",
  },
  {
    id: 2, category: "床工事", koujiName: "CF貼替",
    koujiContent: "既存CF撤去・下地調整・新規CF貼り",
    location1: "洗面所", location2: "床", qty: "8", unit: "㎡", unitPrice: "3500", note: "",
  },
  {
    id: 3, category: "諸経費", koujiName: "諸経費",
    koujiContent: "駐車場代・交通費・廃材処分費",
    location1: "現場全体", location2: "共通", qty: "1", unit: "式", unitPrice: "8000", note: "",
  },
];

const initialCosts: CostItem[] = [
  {
    id: 1, costCategory: "材料費", targetCategory: "内装工事", targetKouji: "クロス貼替",
    content: "クロス材料", qty: "50", unit: "m", costUnitPrice: "300", note: "材料仕入れ想定",
  },
  {
    id: 2, costCategory: "副資材", targetCategory: "内装工事", targetKouji: "クロス貼替",
    content: "糊・パテ・副資材", qty: "1", unit: "式", costUnitPrice: "3000", note: "副資材一式",
  },
  {
    id: 3, costCategory: "施工費", targetCategory: "共通", targetKouji: "共通",
    content: "施工人工", qty: "1", unit: "人工", costUnitPrice: "28000", note: "自社人工または外注人工",
  },
  {
    id: 4, costCategory: "材料費", targetCategory: "床工事", targetKouji: "CF貼替",
    content: "CF材料", qty: "8", unit: "㎡", costUnitPrice: "1200", note: "材料仕入れ想定",
  },
  {
    id: 5, costCategory: "諸経費", targetCategory: "共通", targetKouji: "共通",
    content: "駐車場・交通費・廃材処分", qty: "1", unit: "式", costUnitPrice: "8000", note: "現場共通経費",
  },
];

// ─── 空行テンプレート ─────────────────────────────────────────
function emptyLine(id: number): LineItem {
  return { id, category: "未分類", koujiName: "", koujiContent: "", location1: "", location2: "壁", qty: "1", unit: "式", unitPrice: "0", note: "" };
}
function emptyCost(id: number): CostItem {
  return { id, costCategory: "材料費", targetCategory: "", targetKouji: "", content: "", qty: "1", unit: "式", costUnitPrice: "0", note: "" };
}

// ─── ユーティリティ ───────────────────────────────────────────
function toNum(v: string): number { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function formatYen(n: number): string { return "¥" + n.toLocaleString("ja-JP"); }

// ─── スタイル定数 ─────────────────────────────────────────────
// 提出用（白エリア）
const fldInput = "w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#8B4A3C]/30";
const fldSelect = "w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 focus:border-[#8B4A3C] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#8B4A3C]/30";
const lbl = "mb-0.5 block text-xs text-stone-400";
// 内部管理（黄エリア）
const costInput = "w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-300 focus:border-amber-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-300/50";
const costSelect = "w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-stone-800 focus:border-amber-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-300/50";
const costLbl = "mb-0.5 block text-xs text-amber-700";

// ─── 見積明細カード（白） ─────────────────────────────────────
function LineCard({ line, index, canDelete, onUpdate, onDelete, onDuplicate }: {
  line: LineItem; index: number; canDelete: boolean;
  onUpdate: (field: keyof LineItem, value: string) => void;
  onDelete: () => void; onDuplicate: () => void;
}) {
  const subtotal = toNum(line.qty) * toNum(line.unitPrice);
  const lineTax = Math.floor(subtotal * 0.1);
  const taxIncluded = subtotal + lineTax;
  const pdfLocation = line.location1 && line.location2
    ? `${line.location1} / ${line.location2}`
    : line.location1 || line.location2 || "—";

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-stone-100">
      {/* ヘッダー */}
      <div className="flex items-center justify-between border-b border-stone-100 bg-white px-4 py-2.5">
        <span className="text-xs font-bold text-stone-600">明細 {index + 1}</span>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onDuplicate} className="text-xs text-stone-400 active:text-stone-600">複製</button>
          <button type="button" onClick={() => { if (!canDelete) { alert("明細は最低1行必要です。"); return; } onDelete(); }} className="text-xs text-stone-400 active:text-red-500">削除</button>
        </div>
      </div>

      <div className="space-y-3 p-3">
        <div className="grid grid-cols-2 gap-2">
          <div><label className={lbl}>項目</label><input type="text" value={line.category} onChange={(e) => onUpdate("category", e.target.value)} placeholder="内装工事" className={fldInput} /></div>
          <div><label className={lbl}>工事名</label><input type="text" value={line.koujiName} onChange={(e) => onUpdate("koujiName", e.target.value)} placeholder="クロス貼替" className={fldInput} /></div>
        </div>
        <div><label className={lbl}>工事内容</label><input type="text" value={line.koujiContent} onChange={(e) => onUpdate("koujiContent", e.target.value)} placeholder="既存クロスめくり・下地処理・新規クロス貼り" className={fldInput} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={lbl}>施工箇所1</label><input type="text" value={line.location1} onChange={(e) => onUpdate("location1", e.target.value)} placeholder="洋室、洗面所" className={fldInput} /></div>
          <div>
            <label className={lbl}>施工箇所2</label>
            <select value={line.location2} onChange={(e) => onUpdate("location2", e.target.value)} className={fldSelect}>
              {LOCATION2_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <p className="text-[11px] text-stone-400">PDF表示：<span className="font-medium text-stone-600">{pdfLocation}</span></p>
        <div className="grid grid-cols-3 gap-2">
          <div><label className={lbl}>数量</label><input type="number" inputMode="decimal" value={line.qty} onChange={(e) => onUpdate("qty", e.target.value)} placeholder="50" className={fldInput} /></div>
          <div>
            <label className={lbl}>単位</label>
            <select value={line.unit} onChange={(e) => onUpdate("unit", e.target.value)} className={fldSelect}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div><label className={lbl}>単価</label><input type="number" inputMode="numeric" value={line.unitPrice} onChange={(e) => onUpdate("unitPrice", e.target.value)} placeholder="1200" className={fldInput} /></div>
        </div>
        <div><label className={lbl}>備考</label><input type="text" value={line.note} onChange={(e) => onUpdate("note", e.target.value)} placeholder="色番号、施主支給など" className={fldInput} /></div>
        {/* 金額（書類風） */}
        <div className="divide-y divide-stone-100 rounded-xl border border-stone-100">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs text-stone-500">小計</span>
            <span className="text-sm font-bold text-stone-800">{formatYen(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs text-stone-500">消費税（10%）</span>
            <span className="text-sm font-medium text-stone-600">{formatYen(lineTax)}</span>
          </div>
          <div className="flex items-center justify-between rounded-b-xl bg-[#fdf0ec] px-3 py-2.5">
            <span className="text-xs font-bold text-[#8B4A3C]">税込小計</span>
            <span className="text-base font-bold text-[#8B4A3C]">{formatYen(taxIncluded)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 原価行カード（黄） ───────────────────────────────────────
function CostCard({ cost, index, canDelete, onUpdate, onDelete, onDuplicate }: {
  cost: CostItem; index: number; canDelete: boolean;
  onUpdate: (field: keyof CostItem, value: string) => void;
  onDelete: () => void; onDuplicate: () => void;
}) {
  const costSubtotal = toNum(cost.qty) * toNum(cost.costUnitPrice);
  return (
    <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50">
      <div className="flex items-center justify-between border-b border-amber-200 px-3 py-2">
        <span className="text-xs font-bold text-amber-800">原価行 {index + 1}</span>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onDuplicate} className="text-xs text-amber-500 active:text-amber-700">複製</button>
          <button type="button" onClick={() => { if (!canDelete) { alert("原価行は最低1行必要です。"); return; } onDelete(); }} className="text-xs text-amber-400 active:text-red-500">削除</button>
        </div>
      </div>
      <div className="space-y-2.5 p-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={costLbl}>原価区分</label>
            <select value={cost.costCategory} onChange={(e) => onUpdate("costCategory", e.target.value)} className={costSelect}>
              {COST_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><label className={costLbl}>対象項目</label><input type="text" value={cost.targetCategory} onChange={(e) => onUpdate("targetCategory", e.target.value)} placeholder="内装工事、共通" className={costInput} /></div>
        </div>
        <div><label className={costLbl}>対象工事名</label><input type="text" value={cost.targetKouji} onChange={(e) => onUpdate("targetKouji", e.target.value)} placeholder="クロス貼替、共通" className={costInput} /></div>
        <div><label className={costLbl}>内容</label><input type="text" value={cost.content} onChange={(e) => onUpdate("content", e.target.value)} placeholder="クロス材料、施工人工" className={costInput} /></div>
        <div className="grid grid-cols-3 gap-2">
          <div><label className={costLbl}>数量</label><input type="number" inputMode="decimal" value={cost.qty} onChange={(e) => onUpdate("qty", e.target.value)} placeholder="1" className={costInput} /></div>
          <div>
            <label className={costLbl}>単位</label>
            <select value={cost.unit} onChange={(e) => onUpdate("unit", e.target.value)} className={costSelect}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div><label className={costLbl}>原価単価</label><input type="number" inputMode="numeric" value={cost.costUnitPrice} onChange={(e) => onUpdate("costUnitPrice", e.target.value)} placeholder="0" className={costInput} /></div>
        </div>
        <div><label className={costLbl}>備考</label><input type="text" value={cost.note} onChange={(e) => onUpdate("note", e.target.value)} placeholder="仕入れ単価、外注単価" className={costInput} /></div>
        <div className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-100 px-3 py-2">
          <span className="text-xs font-bold text-amber-800">原価小計</span>
          <span className="text-sm font-bold text-amber-800">{formatYen(costSubtotal)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── メインページ ─────────────────────────────────────────────
export default function EstimatePage() {
  const [lines, setLines] = useState<LineItem[]>(initialLines);
  const [nextLineId, setNextLineId] = useState(4);
  const [costs, setCosts] = useState<CostItem[]>(initialCosts);
  const [nextCostId, setNextCostId] = useState(6);
  const [costSectionOpen, setCostSectionOpen] = useState(false);
  const [summaryInternalOpen, setSummaryInternalOpen] = useState(false);
  // null = 生成中なし / 'estimate' = 見積書 / 'order' = 見積書兼注文書 / 'storage' = 保存用
  const [pdfLoading, setPdfLoading] = useState<null | 'estimate' | 'order' | 'storage'>(null);

  function updateLine(id: number, field: keyof LineItem, value: string) { setLines((p) => p.map((l) => l.id === id ? { ...l, [field]: value } : l)); }
  function addLine() { setLines((p) => [...p, emptyLine(nextLineId)]); setNextLineId((n) => n + 1); }
  function removeLine(id: number) { setLines((p) => p.filter((l) => l.id !== id)); }
  function duplicateLine(id: number) {
    const src = lines.find((l) => l.id === id); if (!src) return;
    const idx = lines.findIndex((l) => l.id === id);
    const dup = { ...src, id: nextLineId };
    setLines((p) => [...p.slice(0, idx + 1), dup, ...p.slice(idx + 1)]);
    setNextLineId((n) => n + 1);
  }

  function updateCost(id: number, field: keyof CostItem, value: string) { setCosts((p) => p.map((c) => c.id === id ? { ...c, [field]: value } : c)); }
  function addCost() { setCosts((p) => [...p, emptyCost(nextCostId)]); setNextCostId((n) => n + 1); setCostSectionOpen(true); }
  function removeCost(id: number) { setCosts((p) => p.filter((c) => c.id !== id)); }
  function duplicateCost(id: number) {
    const src = costs.find((c) => c.id === id); if (!src) return;
    const idx = costs.findIndex((c) => c.id === id);
    const dup = { ...src, id: nextCostId };
    setCosts((p) => [...p.slice(0, idx + 1), dup, ...p.slice(idx + 1)]);
    setNextCostId((n) => n + 1);
  }

  const subtotalSum = lines.reduce((acc, l) => acc + toNum(l.qty) * toNum(l.unitPrice), 0);
  const taxSum = Math.floor(subtotalSum * 0.1);
  const totalWithTax = subtotalSum + taxSum;
  const costSum = costs.reduce((acc, c) => acc + toNum(c.qty) * toNum(c.costUnitPrice), 0);
  const grossProfit = subtotalSum - costSum;
  const grossMarginRate = subtotalSum > 0 ? (grossProfit / subtotalSum) * 100 : 0;

  // ── PDF ダウンロード共通処理 ──────────────────────────────────
  async function downloadPdf(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── 見積書PDF 生成（提出用のみ・原価非表示） ──────────────────
  async function handleEstimatePDF() {
    if (pdfLoading) return;
    setPdfLoading('estimate');
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { makeEstimatePDF } = await import('./EstimatePDF');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const element: any = makeEstimatePDF({ lines, subtotalSum, taxSum, totalWithTax });
      const blob = await pdf(element).toBlob();
      await downloadPdf(blob, 'estimate_EST-0001.pdf');
    } catch (err) {
      console.error('PDF生成エラー:', err);
      alert('PDFの生成に失敗しました。ネットワーク接続を確認してから再試行してください。');
    } finally {
      setPdfLoading(null);
    }
  }

  // ── 保存用PDF 生成（原価・粗利・粗利率を含む自分用控え） ────────
  async function handleStoragePDF() {
    if (pdfLoading) return;
    setPdfLoading('storage');
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { makeStoragePDF } = await import('./EstimatePDF');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const element: any = makeStoragePDF({
        lines,
        subtotalSum,
        taxSum,
        totalWithTax,
        costs,
        costSum,
        grossProfit,
        grossMarginRate,
      });
      const blob = await pdf(element).toBlob();
      await downloadPdf(blob, 'estimate_internal_EST-0001.pdf');
    } catch (err) {
      console.error('PDF生成エラー:', err);
      alert('PDFの生成に失敗しました。ネットワーク接続を確認してから再試行してください。');
    } finally {
      setPdfLoading(null);
    }
  }

  // ── 見積書兼注文書PDF 生成（提出用のみ・原価非表示） ───────────
  async function handleEstimateOrderPDF() {
    if (pdfLoading) return;
    setPdfLoading('order');
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { makeEstimateOrderPDF } = await import('./EstimatePDF');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const element: any = makeEstimateOrderPDF({ lines, subtotalSum, taxSum, totalWithTax });
      const blob = await pdf(element).toBlob();
      await downloadPdf(blob, 'estimate_order_EST-0001.pdf');
    } catch (err) {
      console.error('PDF生成エラー:', err);
      alert('PDFの生成に失敗しました。ネットワーク接続を確認してから再試行してください。');
    } finally {
      setPdfLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg lg:max-w-4xl">

        {/* ページヘッダー */}
        <header className="mb-4">
          <Link href="/projects/sample" className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← 案件詳細へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">見積明細書</h1>
          <p className="mt-1 text-sm text-stone-500">
            白い部分は提出用、黄色い部分は保存用の内部管理です。
          </p>
        </header>

        {/* 書類風 案件情報 */}
        <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-base font-bold text-stone-800">見積明細書</span>
            <span className="text-xs text-stone-400">EST-0001</span>
          </div>
          <div className="mb-3 border-b border-stone-100 pb-3">
            <p className="text-xs text-stone-400">作成日</p>
            <p className="text-sm font-medium text-stone-700">2026/05/30</p>
          </div>
          <ul className="space-y-2">
            {[
              { label: "提出先", value: "△△工務店 御中", bold: true },
              { label: "案件名", value: "〇〇マンション クロス貼替", bold: false },
              { label: "現場住所", value: "大阪府堺市〇〇区", bold: false },
            ].map((item) => (
              <li key={item.label} className="flex items-start gap-3 text-sm">
                <span className="w-16 shrink-0 pt-0.5 text-xs text-stone-400">{item.label}</span>
                <span className={item.bold ? "font-bold text-stone-800" : "text-stone-700"}>{item.value}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 凡例 */}
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-stone-100 bg-white px-4 py-3 shadow-sm">
          <span className="text-xs font-bold text-stone-600">凡例</span>
          <span className="flex items-center gap-1.5 text-xs text-stone-600">
            <span className="inline-block h-3.5 w-3.5 rounded-sm border border-stone-200 bg-white" />
            白：提出用PDFに表示
          </span>
          <span className="flex items-center gap-1.5 text-xs text-amber-700">
            <span className="inline-block h-3.5 w-3.5 rounded-sm border border-amber-300 bg-amber-100" />
            黄：保存用PDFにのみ表示
          </span>
        </div>

        {/* 説明文 */}
        <p className="mb-4 rounded-xl bg-stone-50 px-4 py-3 text-xs text-stone-500">
          提出用の見積明細と、保存用の原価管理は分けて管理します。原価・粗利・利益率は提出用PDFには出しません。
        </p>

        {/* ── PC：2カラム / スマホ：1カラム ── */}
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">

          {/* ──── 左列：提出用見積明細（白） ──── */}
          <section className="mb-4 lg:mb-0">
            {/* セクションヘッダー */}
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-stone-700">提出用見積明細</h2>
                <span className="rounded bg-[#8B4A3C]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#8B4A3C]">
                  提出用PDFに表示
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {lines.map((line, index) => (
                <LineCard
                  key={line.id} line={line} index={index} canDelete={lines.length > 1}
                  onUpdate={(field, value) => updateLine(line.id, field, value)}
                  onDelete={() => removeLine(line.id)}
                  onDuplicate={() => duplicateLine(line.id)}
                />
              ))}
              <button type="button" onClick={addLine}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-200 py-3 text-sm font-bold text-stone-500 active:opacity-75">
                <span className="text-base leading-none">＋</span>
                明細行を追加
              </button>
            </div>

            {/* 提出用合計（スマホでは左列の下、PCでも左列の下） */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
                <h2 className="text-sm font-bold text-stone-700">提出用合計</h2>
                <span className="rounded bg-[#8B4A3C]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#8B4A3C]">
                  提出用PDFに表示
                </span>
              </div>
              <div className="divide-y divide-stone-100">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-stone-500">小計合計</span>
                  <span className="text-sm font-medium text-stone-800">{formatYen(subtotalSum)}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-stone-500">消費税（10%）</span>
                  <span className="text-sm font-medium text-stone-700">{formatYen(taxSum)}</span>
                </div>
                <div className="flex items-center justify-between bg-[#fdf0ec] px-4 py-3">
                  <span className="font-bold text-[#8B4A3C]">税込合計</span>
                  <span className="text-lg font-bold text-[#8B4A3C]">{formatYen(totalWithTax)}</span>
                </div>
              </div>
            </div>
          </section>

          {/* ──── 右列：内部管理（黄） ──── */}
          <section className="mb-4 lg:mb-0">
            {/* セクションヘッダー */}
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-amber-800">内部管理</h2>
                <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                  保存用PDFにのみ表示
                </span>
              </div>
            </div>

            {/* 原価管理（折りたたみ） */}
            <div className="overflow-hidden rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50">
              {/* 閉じている時 */}
              {!costSectionOpen && (
                <div className="px-4 py-4 space-y-2">
                  <p className="text-xs text-amber-700">
                    原価は提出用明細とは別で管理します。<br />
                    材料費・副資材・施工費・外注費・諸経費をまとめて確認できます。
                  </p>
                  <p className="rounded-lg bg-amber-100 px-3 py-2 text-[11px] text-amber-700">
                    見積書PDF・見積書兼注文書PDFには表示しません。保存用PDFにのみ表示します。
                  </p>
                  <button type="button" onClick={() => setCostSectionOpen(true)}
                    className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-white py-3 text-sm font-bold text-amber-700 active:opacity-75">
                    <span>原価管理を開く</span>
                    <span className="text-amber-400">▼</span>
                  </button>
                </div>
              )}

              {/* 開いている時 */}
              {costSectionOpen && (
                <div className="space-y-3 px-4 pb-4 pt-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-amber-700">原価管理（内部管理）</p>
                    <button type="button" onClick={() => setCostSectionOpen(false)}
                      className="flex items-center gap-1 text-xs font-bold text-amber-600 active:opacity-75">
                      <span>閉じる</span>
                      <span className="text-amber-400">▲</span>
                    </button>
                  </div>

                  {costs.map((cost, index) => (
                    <CostCard
                      key={cost.id} cost={cost} index={index} canDelete={costs.length > 1}
                      onUpdate={(field, value) => updateCost(cost.id, field, value)}
                      onDelete={() => removeCost(cost.id)}
                      onDuplicate={() => duplicateCost(cost.id)}
                    />
                  ))}

                  <button type="button" onClick={addCost}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-300 py-3 text-sm font-bold text-amber-600 active:opacity-75">
                    <span className="text-base leading-none">＋</span>
                    原価行を追加
                  </button>

                  <p className="rounded-lg bg-amber-100 px-3 py-2 text-[11px] text-amber-700">
                    この原価管理は保存用PDFにのみ表示します。見積書PDF・見積書兼注文書PDFには表示しません。
                  </p>
                </div>
              )}
            </div>

            {/* 保存用内部管理（折りたたみ） */}
            <div className="mt-4 overflow-hidden rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50">
              <button type="button" onClick={() => setSummaryInternalOpen((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-left active:opacity-75">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-amber-800">
                    {summaryInternalOpen ? "保存用内部管理を閉じる" : "保存用内部管理を開く"}
                  </span>
                  <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                    保存用PDFにのみ表示
                  </span>
                </div>
                <span className="text-amber-400">{summaryInternalOpen ? "▲" : "▼"}</span>
              </button>

              {summaryInternalOpen && (
                <div className="border-t border-amber-200 px-4 pb-4 pt-3 space-y-3">
                  <div className="divide-y divide-amber-100 rounded-xl border border-amber-200 bg-white">
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <span className="text-sm text-amber-700">原価合計</span>
                      <span className="text-sm font-medium text-stone-700">{formatYen(costSum)}</span>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <span className="text-sm text-amber-700">粗利</span>
                      <span className="text-sm font-bold text-stone-700">{formatYen(grossProfit)}</span>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <span className="text-sm text-amber-700">粗利率</span>
                      <span className="text-sm font-bold text-amber-700">{grossMarginRate.toFixed(1)}%</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-amber-600">
                    原価・粗利・粗利率は保存用PDFにのみ表示します。見積書PDF・見積書兼注文書PDFには表示しません。
                  </p>
                </div>
              )}
            </div>
          </section>

        </div>{/* end 2col grid */}

        {/* ── PDF出力エリア ── */}
        <div className="mt-4 space-y-3 pb-8">

          {/* PDF出力の種類 説明カード */}
          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-bold text-stone-700">PDF出力の種類</h3>
            <ul className="space-y-2 text-xs text-stone-600">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 rounded bg-stone-100 px-1.5 py-0.5 font-bold text-stone-600">見積書</span>
                <span>原価を出さず、元請け・施主へ提出する書類です。</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 rounded bg-[#8B4A3C] px-1.5 py-0.5 font-bold text-white">兼注文書</span>
                <span>署名または押印をもらって発注確認に使います。</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 rounded bg-amber-200 px-1.5 py-0.5 font-bold text-amber-800">保存用</span>
                <span>原価・粗利・利益率を含めた自分用控えです。</span>
              </li>
            </ul>
          </div>

          {/* PDF出力ルール */}
          <div className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-3">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-stone-400">出力ルール</p>
            <ul className="space-y-1 text-[11px] text-stone-500">
              <li className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 shrink-0 rounded-sm border border-stone-200 bg-white" />
                白い部分：提出用PDFに表示
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 shrink-0 rounded-sm border border-amber-300 bg-amber-100" />
                黄色い部分：保存用PDFにのみ表示
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 shrink-0 rounded-sm border border-red-200 bg-red-50" />
                原価・粗利・利益率：提出用PDFには表示しない
              </li>
            </ul>
          </div>

          {/* 見積書PDF：白背景＋赤茶枠 */}
          <button
            type="button"
            onClick={handleEstimatePDF}
            disabled={pdfLoading !== null}
            className="w-full rounded-2xl border-2 border-[#8B4A3C] bg-white py-3.5 text-[#8B4A3C] shadow-sm active:opacity-80 disabled:opacity-50"
          >
            <span className="block text-base font-bold">
              {pdfLoading === 'estimate' ? '生成中...' : '見積書PDFを作る'}
            </span>
            <span className="block mt-0.5 text-xs font-normal text-[#8B4A3C]/60">
              {pdfLoading === 'estimate' ? 'フォント読み込み中（初回のみ時間がかかります）' : '金額確認用・原価なし'}
            </span>
          </button>

          {/* 見積書兼注文書PDF：赤茶背景＋白文字 */}
          <button
            type="button"
            onClick={handleEstimateOrderPDF}
            disabled={pdfLoading !== null}
            className="w-full rounded-2xl bg-[#8B4A3C] py-3.5 text-white shadow-sm active:opacity-80 disabled:opacity-50"
          >
            <span className="block text-base font-bold">
              {pdfLoading === 'order' ? '生成中...' : '見積書兼注文書PDFを作る'}
            </span>
            <span className="block mt-0.5 text-xs font-normal text-stone-200">
              {pdfLoading === 'order' ? 'フォント読み込み中（初回のみ時間がかかります）' : '署名返送で発注確認'}
            </span>
          </button>

          {/* 保存用PDF：薄い黄色背景＋黄色枠 */}
          <button
            type="button"
            onClick={handleStoragePDF}
            disabled={pdfLoading !== null}
            className="w-full rounded-2xl border-2 border-amber-400 bg-amber-50 py-3.5 text-amber-700 shadow-sm active:opacity-80 disabled:opacity-50"
          >
            <span className="block text-base font-bold">
              {pdfLoading === 'storage' ? '生成中...' : '保存用PDFを作る'}
            </span>
            <span className="block mt-0.5 text-xs font-normal text-amber-500">
              {pdfLoading === 'storage' ? 'フォント読み込み中（初回のみ時間がかかります）' : '原価あり・自分用控え'}
            </span>
          </button>

          {/* 仮保存・戻る */}
          <button
            type="button"
            onClick={() => alert("見積を仮保存しました。次工程で保存・PDF出力を追加します。")}
            className="w-full rounded-2xl border border-stone-300 bg-white py-4 text-base font-bold text-stone-600 shadow-sm active:opacity-80"
          >
            仮保存
          </button>
          <Link
            href="/projects/sample"
            className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-4 text-base font-bold text-stone-500 shadow-sm active:opacity-80"
          >
            案件詳細へ戻る
          </Link>
        </div>

      </div>
    </div>
  );
}
