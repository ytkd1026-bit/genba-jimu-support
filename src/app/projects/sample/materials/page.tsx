"use client";

import Link from "next/link";
import { useState } from "react";

// ─── 型定義 ──────────────────────────────────────────────────
type MaterialRow = {
  id: number;
  koujiType: string;
  location1: string;
  location2: string;
  qty: string;
  unit: string;
  lossRate: string;
  unitPrice: string;
  itemName: string;
  orderNote: string;
  // 発注管理
  supplier: string;
  isSupplied: boolean;
  isOrdered: boolean;
  orderDate: string;
  deliveryDate: string;
  deliveryNote: string;
};

// ─── 定数 ────────────────────────────────────────────────────
const KOUJI_TYPES = ["クロス", "クッションフロア", "フロアタイル", "長尺シート", "タイルカーペット", "副資材", "その他"];
const LOCATION2_OPTIONS = ["天井", "壁", "床", "共通"];
const UNITS = ["m", "㎡", "枚", "式", "ケース", "本"];
const FLOOR_TYPES = new Set(["クッションフロア", "フロアタイル", "長尺シート", "タイルカーペット"]);

// ─── 初期データ ───────────────────────────────────────────────
const initialRows: MaterialRow[] = [
  {
    id: 1, koujiType: "クロス", location1: "洋室", location2: "壁",
    qty: "50", unit: "m", lossRate: "10", unitPrice: "300",
    itemName: "量産クロス SP-0000", orderNote: "予備分を含めて発注",
    supplier: "〇〇商店", isSupplied: false, isOrdered: false,
    orderDate: "", deliveryDate: "", deliveryNote: "午前着希望",
  },
  {
    id: 2, koujiType: "クッションフロア", location1: "洗面所", location2: "床",
    qty: "8", unit: "㎡", lossRate: "10", unitPrice: "1200",
    itemName: "CFシート HM-0000", orderNote: "巾方向・ジョイント位置確認",
    supplier: "〇〇商店", isSupplied: false, isOrdered: false,
    orderDate: "", deliveryDate: "", deliveryNote: "巾方向確認後に発注",
  },
  {
    id: 3, koujiType: "副資材", location1: "現場全体", location2: "共通",
    qty: "1", unit: "式", lossRate: "0", unitPrice: "3000",
    itemName: "糊・パテ・接着剤など", orderNote: "現場共通副資材",
    supplier: "自社在庫", isSupplied: false, isOrdered: true,
    orderDate: "2026-05-30", deliveryDate: "2026-06-03", deliveryNote: "在庫確認済み",
  },
];

function emptyRow(id: number): MaterialRow {
  return {
    id, koujiType: "その他", location1: "", location2: "壁",
    qty: "1", unit: "m", lossRate: "10", unitPrice: "0",
    itemName: "", orderNote: "",
    supplier: "", isSupplied: false, isOrdered: false,
    orderDate: "", deliveryDate: "", deliveryNote: "",
  };
}

// ─── ユーティリティ ───────────────────────────────────────────
function toNum(v: string): number { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

function calcOrderQty(qty: string, lossRate: string): number {
  return toNum(qty) * (1 + toNum(lossRate) / 100);
}

function fmtQty(n: number, unit: string): string {
  return (unit === 'm' || unit === '㎡') ? n.toFixed(2) : Math.ceil(n).toString();
}

function fmtYen(n: number): string { return "¥" + Math.floor(n).toLocaleString("ja-JP"); }

// ─── スタイル定数 ─────────────────────────────────────────────
const fi = "w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-300 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-400/40";
const fs = "w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-400/40";
const lbl = "mb-0.5 block text-xs text-stone-400";

// ─── 材料行カード ─────────────────────────────────────────────
function MaterialCard({
  row, index, canDelete, onUpdate, onDelete, onDuplicate,
}: {
  row: MaterialRow; index: number; canDelete: boolean;
  onUpdate: (updates: Partial<MaterialRow>) => void;
  onDelete: () => void; onDuplicate: () => void;
}) {
  const orderQty = calcOrderQty(row.qty, row.lossRate);
  const refCost = orderQty * toNum(row.unitPrice);
  const effectiveCost = row.isSupplied ? 0 : refCost;

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-teal-100">
      {/* カードヘッダー */}
      <div className="flex items-center justify-between border-b border-teal-50 bg-teal-50 px-4 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-teal-700">材料行 {index + 1}</span>
          <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-700">
            {row.koujiType || '未設定'}
          </span>
          {/* 発注ステータスバッジ */}
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
            row.isOrdered
              ? "bg-green-100 text-green-700"
              : "bg-amber-100 text-amber-700"
          }`}>
            {row.isOrdered ? "発注済み" : "未発注"}
          </span>
          {row.isSupplied && (
            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-500">
              支給材
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button type="button" onClick={onDuplicate} className="text-xs text-stone-400 active:text-stone-600">複製</button>
          <button
            type="button"
            onClick={() => { if (!canDelete) { alert("材料行は最低1行必要です。"); return; } onDelete(); }}
            className="text-xs text-stone-400 active:text-red-500"
          >削除</button>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {/* 工種・施工箇所 */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>工種</label>
            <select value={row.koujiType} onChange={(e) => onUpdate({ koujiType: e.target.value })} className={fs}>
              {KOUJI_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>施工箇所1</label>
            <input type="text" value={row.location1} onChange={(e) => onUpdate({ location1: e.target.value })} placeholder="例：洋室" className={fi} />
          </div>
        </div>
        <div>
          <label className={lbl}>施工箇所2</label>
          <select value={row.location2} onChange={(e) => onUpdate({ location2: e.target.value })} className={fs}>
            {LOCATION2_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        {/* 数量・ロス率 */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={lbl}>見積数量</label>
            <input type="number" inputMode="decimal" value={row.qty} onChange={(e) => onUpdate({ qty: e.target.value })} placeholder="50" className={fi} />
          </div>
          <div>
            <label className={lbl}>単位</label>
            <select value={row.unit} onChange={(e) => onUpdate({ unit: e.target.value })} className={fs}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>ロス率（%）</label>
            <input type="number" inputMode="decimal" value={row.lossRate} onChange={(e) => onUpdate({ lossRate: e.target.value })} placeholder="10" className={fi} />
          </div>
        </div>

        {/* 発注数量（自動計算） */}
        <div className="flex items-center justify-between rounded-xl bg-teal-50 px-3 py-2.5">
          <span className="text-xs font-bold text-teal-700">発注数量</span>
          <span className="text-base font-bold text-teal-700">
            {fmtQty(orderQty, row.unit)} {row.unit}
          </span>
        </div>

        {/* 材料単価 */}
        <div>
          <label className={lbl}>材料単価（円）</label>
          <input type="number" inputMode="numeric" value={row.unitPrice} onChange={(e) => onUpdate({ unitPrice: e.target.value })} placeholder="300" className={fi} />
        </div>

        {/* 材料費 / 参考材料費 */}
        {row.isSupplied ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-xl bg-stone-100 px-3 py-2.5">
              <span className="text-xs font-bold text-stone-500">参考材料費</span>
              <span className="text-base font-bold text-stone-500">{fmtYen(refCost)}</span>
            </div>
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
              支給材のため、材料費合計には含めません。
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-xl bg-[#fdf0ec] px-3 py-2.5">
            <span className="text-xs font-bold text-[#8B4A3C]">材料費</span>
            <span className="text-base font-bold text-[#8B4A3C]">{fmtYen(effectiveCost)}</span>
          </div>
        )}

        {/* 品番・材料名 */}
        <div>
          <label className={lbl}>品番・材料名</label>
          <input type="text" value={row.itemName} onChange={(e) => onUpdate({ itemName: e.target.value })} placeholder="例：量産クロス SP-0000" className={fi} />
        </div>

        {/* 仕入先 */}
        <div>
          <label className={lbl}>仕入先</label>
          <input type="text" value={row.supplier} onChange={(e) => onUpdate({ supplier: e.target.value })} placeholder="例：〇〇商店、サンゲツ、元請け支給など" className={fi} />
        </div>

        {/* ─── 発注管理エリア ─── */}
        <div className="rounded-xl border border-stone-100 bg-stone-50 p-3 space-y-3">
          <p className="text-xs font-bold text-stone-500">発注管理</p>

          {/* チェックボックス行 */}
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={row.isSupplied}
                onChange={(e) => onUpdate({ isSupplied: e.target.checked })}
                className="h-4 w-4 rounded border-stone-300 accent-amber-500"
              />
              <span className="text-sm text-stone-700">支給材</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={row.isOrdered}
                onChange={(e) => onUpdate({ isOrdered: e.target.checked })}
                className="h-4 w-4 rounded border-stone-300 accent-green-600"
              />
              <span className="text-sm text-stone-700">発注済み</span>
            </label>
          </div>

          {/* 発注日・搬入予定日 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>発注日</label>
              <input type="date" value={row.orderDate} onChange={(e) => onUpdate({ orderDate: e.target.value })} className={fi} />
            </div>
            <div>
              <label className={lbl}>搬入予定日</label>
              <input type="date" value={row.deliveryDate} onChange={(e) => onUpdate({ deliveryDate: e.target.value })} className={fi} />
            </div>
          </div>

          {/* 納期メモ */}
          <div>
            <label className={lbl}>納期メモ</label>
            <input type="text" value={row.deliveryNote} onChange={(e) => onUpdate({ deliveryNote: e.target.value })} placeholder="例：午前着、分納、欠品注意、現場直送など" className={fi} />
          </div>
        </div>

        {/* 発注メモ */}
        <div>
          <label className={lbl}>発注メモ</label>
          <textarea
            value={row.orderNote}
            onChange={(e) => onUpdate({ orderNote: e.target.value })}
            placeholder="例：予備分を含めて発注"
            rows={2}
            className={fi + " resize-none"}
          />
        </div>
      </div>
    </div>
  );
}

// ─── メインページ ─────────────────────────────────────────────
export default function MaterialsPage() {
  const [rows, setRows] = useState<MaterialRow[]>(initialRows);
  const [nextId, setNextId] = useState(4);

  function updateRow(id: number, updates: Partial<MaterialRow>) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...updates } : r));
  }
  function addRow() {
    setRows((prev) => [...prev, emptyRow(nextId)]);
    setNextId((n) => n + 1);
  }
  function removeRow(id: number) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }
  function duplicateRow(id: number) {
    const src = rows.find((r) => r.id === id);
    if (!src) return;
    const idx = rows.findIndex((r) => r.id === id);
    setRows((prev) => [...prev.slice(0, idx + 1), { ...src, id: nextId }, ...prev.slice(idx + 1)]);
    setNextId((n) => n + 1);
  }

  // ── 集計 ──────────────────────────────────────────────────────
  function rowCost(r: MaterialRow): number {
    return r.isSupplied ? 0 : calcOrderQty(r.qty, r.lossRate) * toNum(r.unitPrice);
  }
  function rowRefCost(r: MaterialRow): number {
    return calcOrderQty(r.qty, r.lossRate) * toNum(r.unitPrice);
  }

  const totalMaterialCost = rows.reduce((acc, r) => acc + rowCost(r), 0);
  const refMaterialCost = rows.reduce((acc, r) => acc + rowRefCost(r), 0);
  const crossCost = rows.filter((r) => r.koujiType === "クロス").reduce((acc, r) => acc + rowCost(r), 0);
  const floorCost = rows.filter((r) => FLOOR_TYPES.has(r.koujiType)).reduce((acc, r) => acc + rowCost(r), 0);
  const subMaterialCost = rows.filter((r) => r.koujiType === "副資材").reduce((acc, r) => acc + rowCost(r), 0);
  const orderedCount = rows.filter((r) => r.isOrdered).length;
  const unorderedCount = rows.filter((r) => !r.isOrdered).length;
  const suppliedCount = rows.filter((r) => r.isSupplied).length;

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        {/* ヘッダー */}
        <header className="mb-4">
          <Link href="/projects/sample" className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← 案件詳細へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">材料計算</h1>
          <p className="mt-1 text-sm text-stone-500">
            見積数量から、ロス率を含めた発注数量と材料費を確認します。
          </p>
        </header>

        {/* 案件情報カード */}
        <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold text-stone-800">案件情報</span>
            <span className="text-xs text-stone-400">EST-0001</span>
          </div>
          <ul className="space-y-1.5">
            {[
              { label: "案件名", value: "〇〇マンション クロス貼替" },
              { label: "現場住所", value: "大阪府堺市〇〇区" },
              { label: "工事種別", value: "クロス・床" },
            ].map((item) => (
              <li key={item.label} className="flex items-start gap-2 text-sm">
                <span className="w-20 shrink-0 text-stone-400">{item.label}</span>
                <span className="font-medium text-stone-800">{item.value}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 材料発注チェック 注意カード */}
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-1.5 text-sm font-bold text-amber-800">材料発注チェック</p>
          <p className="text-xs text-amber-700 leading-relaxed">
            発注数量だけでなく、発注済み・搬入予定日・支給材も確認してください。<br />
            支給材は材料費合計には含めません。
          </p>
        </div>

        {/* 材料行リスト */}
        <section className="mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-stone-700">材料一覧</h2>
            <div className="flex items-center gap-1.5">
              {unorderedCount > 0 && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                  未発注 {unorderedCount}件
                </span>
              )}
              <span className="rounded bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-700">
                全{rows.length}行
              </span>
            </div>
          </div>

          {rows.map((row, index) => (
            <MaterialCard
              key={row.id} row={row} index={index} canDelete={rows.length > 1}
              onUpdate={(updates) => updateRow(row.id, updates)}
              onDelete={() => removeRow(row.id)}
              onDuplicate={() => duplicateRow(row.id)}
            />
          ))}

          <button
            type="button"
            onClick={addRow}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-teal-200 py-3.5 text-sm font-bold text-teal-600 active:opacity-75"
          >
            <span className="text-base leading-none">＋</span>
            材料行を追加
          </button>
        </section>

        {/* 集計カード */}
        <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">集計</h2>
          <ul className="space-y-2">
            {/* メイン合計 */}
            <li className="flex items-center justify-between">
              <span className="text-sm font-bold text-stone-800">材料費合計（支給材除く）</span>
              <span className="text-lg font-bold text-[#8B4A3C]">{fmtYen(totalMaterialCost)}</span>
            </li>
            <li className="flex items-center justify-between border-t border-stone-50 pt-2 text-sm">
              <span className="text-stone-500">参考材料費合計（全行）</span>
              <span className="font-medium text-stone-600">{fmtYen(refMaterialCost)}</span>
            </li>
            {/* 内訳 */}
            <li className="flex items-center justify-between text-sm">
              <span className="text-stone-500">クロス材料費</span>
              <span className="font-medium text-stone-800">{fmtYen(crossCost)}</span>
            </li>
            <li className="flex items-center justify-between text-sm">
              <span className="text-stone-500">床材材料費</span>
              <span className="font-medium text-stone-800">{fmtYen(floorCost)}</span>
            </li>
            <li className="flex items-center justify-between text-sm">
              <span className="text-stone-500">副資材費</span>
              <span className="font-medium text-stone-800">{fmtYen(subMaterialCost)}</span>
            </li>
            {/* 発注状況 */}
            <li className="mt-1 border-t border-stone-100 pt-2 flex items-center justify-between text-sm">
              <span className="text-stone-500">発注行数</span>
              <span className="font-medium text-stone-800">{rows.length}行</span>
            </li>
            <li className="flex items-center justify-between text-sm">
              <span className="font-bold text-amber-700">未発注件数</span>
              <span className={`font-bold ${unorderedCount > 0 ? "text-amber-700" : "text-stone-400"}`}>
                {unorderedCount}件
              </span>
            </li>
            <li className="flex items-center justify-between text-sm">
              <span className="text-green-700">発注済み件数</span>
              <span className="font-bold text-green-700">{orderedCount}件</span>
            </li>
            {suppliedCount > 0 && (
              <li className="flex items-center justify-between text-sm">
                <span className="text-stone-500">支給材件数</span>
                <span className="font-medium text-stone-500">{suppliedCount}件</span>
              </li>
            )}
          </ul>
        </div>

        {/* ボタン群 */}
        <div className="space-y-3 pb-8">
          <button
            type="button"
            onClick={() => alert("材料計算を仮保存しました。次工程で保存機能を追加します。")}
            className="w-full rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80"
          >
            仮保存
          </button>
          <Link
            href="/projects/sample"
            className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-4 text-base font-bold text-stone-600 shadow-sm active:opacity-80"
          >
            案件詳細へ戻る
          </Link>
        </div>

      </div>
    </div>
  );
}
