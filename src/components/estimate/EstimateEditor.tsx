"use client";

// 見積・原価入力の共有エディタ（表＋内部管理パネル）
//
// 既存案件の見積画面（/projects/[id]/work-items）と新規見積フロー（/estimate/new）で
// 同じUI・同じ計算を使うための制御コンポーネント。行データは親が useState で持ち、
// 変更は onRowsChange で通知する（保存・自動下書き・ヘッダ・集計は親が担当）。
//
// 入力（数量・採用売価）と自動計算欄を視覚的に区別する。採用売価のみ編集可。
// 工種・項目名・材料名・施工場所・単位は「候補選択＋自由入力」。Safari では native datalist の
// 候補が白背景＋薄字で読めないため、独自の暗色ドロップダウン（Combo）で表示する（仕様A）。

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  applyMasterPatch,
  emptyEditableRow,
  itemNamesOf,
  materialsOf,
  resolveMaster,
  resolveMasterByUnit,
  unitOptionsOf,
  rowMetrics,
  taxComboValue,
  workCategoryOptions,
  fmtYen,
  fmtPct,
  LOCATION_PRESETS,
  TAX_COMBO,
  LEVEL_TEXT,
  LEVEL_LABEL,
  type EditableWorkItem,
  type RowMetrics,
} from "@/app/utils/estimateRows";
import { normalizeNumericString } from "@/app/utils/numberInput";
import { TAX_TYPE_LABELS } from "@/app/utils/taxCalculation";
import type { UnitPriceMasterItem } from "@/app/utils/unitPriceMaster";

export type EstimateEditorProps = {
  rows: EditableWorkItem[];
  onRowsChange: (rows: EditableWorkItem[]) => void;
  selectedId: string | null;
  onSelectedIdChange: (id: string | null) => void;
  masters: UnitPriceMasterItem[];
  /** 新しい行のID発行（案件スコープの W-xxx、または新規フローの一時ID） */
  issueRowId: () => string;
  damageOptions?: Array<{ id: string; caption: string }>;
  showDetail: boolean;
  onToggleDetail: () => void;
};

export function EstimateEditor({
  rows,
  onRowsChange,
  selectedId,
  onSelectedIdChange,
  masters,
  issueRowId,
  damageOptions = [],
  showDetail,
  onToggleDetail,
}: EstimateEditorProps) {
  const listBaseId = useId();

  function updateRow(id: string, patch: Partial<EditableWorkItem>) {
    onRowsChange(rows.map((r) => (r.workItemId === id ? { ...r, ...patch } : r)));
  }

  function applyMaster(id: string, master: UnitPriceMasterItem, currentQty: string) {
    updateRow(id, applyMasterPatch(master, currentQty));
  }

  function handleCategoryChange(row: EditableWorkItem, category: string) {
    // 工種を変えたら項目・材料・単価はリセット（別工種の単価を残さない）
    updateRow(row.workItemId, {
      category,
      workName: "",
      materialName: "",
      unit: "",
      materialUnitCost: 0,
      laborUnitCost: 0,
      subcontractUnitCost: 0,
      otherUnitCost: 0,
      targetProfitRate: 0,
      masterId: "",
    });
  }
  function handleItemChange(row: EditableWorkItem, itemName: string) {
    const mats = materialsOf(masters, row.category, itemName);
    const m = resolveMaster(masters, row.category, itemName, mats[0] ?? "");
    if (m) applyMaster(row.workItemId, m, row.quantity);
    else updateRow(row.workItemId, { workName: itemName, masterId: "" });
  }
  function handleMaterialChange(row: EditableWorkItem, materialName: string) {
    const m = resolveMaster(masters, row.category, row.workName, materialName);
    if (m) applyMaster(row.workItemId, m, row.quantity);
    else updateRow(row.workItemId, { materialName });
  }
  // 単位変更（仕様7・9）: 同じ工種・項目名で該当単位の単価マスタがあれば、その単位の
  // 原価単価・目標粗利率・標準売価を取得する。無ければ単位だけ変え、価格は手入力を維持。
  function handleUnitChange(row: EditableWorkItem, unit: string) {
    const m = resolveMasterByUnit(masters, row.category, row.workName, row.materialName, unit);
    if (m) applyMaster(row.workItemId, m, row.quantity);
    else updateRow(row.workItemId, { unit });
  }

  function addRow() {
    const id = issueRowId();
    onRowsChange([...rows, emptyEditableRow(id)]);
    onSelectedIdChange(id);
  }
  function removeRow(id: string) {
    if (!confirm("この行を削除しますか？")) return;
    const next = rows.filter((r) => r.workItemId !== id);
    onRowsChange(next);
    if (selectedId === id) onSelectedIdChange(next[0]?.workItemId ?? null);
  }
  function normalizeField(id: string, field: "quantity" | "sellingUnitPrice", value: string) {
    updateRow(id, { [field]: normalizeNumericString(value) } as Partial<EditableWorkItem>);
  }
  function toggleDamage(id: string, damageId: string) {
    const row = rows.find((r) => r.workItemId === id);
    if (!row) return;
    const list = row.relatedDamageIds;
    updateRow(id, {
      relatedDamageIds: list.includes(damageId) ? list.filter((x) => x !== damageId) : [...list, damageId],
    });
  }

  const categoryOptions = workCategoryOptions(masters, rows);
  const selectedRow = rows.find((r) => r.workItemId === selectedId) ?? null;

  return (
    <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-4">
      {/* 左：見積入力 */}
      <div className="min-w-0">
        {rows.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-stone-200 px-4 py-10 text-center">
            <p className="text-sm text-stone-500">工事項目がありません。</p>
            <p className="mt-1.5 text-sm text-stone-500">「工事項目を追加」から項目を選び、数量を入力してください。</p>
          </div>
        )}

        {/* PC: テーブル */}
        {rows.length > 0 && (
          <div className="hidden overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-100 lg:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-stone-50 text-xs text-stone-500">
                  <th className="px-2 py-2.5 text-left font-bold">工種</th>
                  <th className="px-2 py-2.5 text-left font-bold">項目名</th>
                  <th className="px-2 py-2.5 text-left font-bold">材料名</th>
                  <th className="px-2 py-2.5 text-left font-bold">施工場所</th>
                  <th className="px-2 py-2.5 text-right font-bold">数量</th>
                  <th className="px-2 py-2.5 text-left font-bold">単位</th>
                  <th className="px-2 py-2.5 text-right font-bold">売価単価</th>
                  <th className="px-2 py-2.5 text-right font-bold">見積金額</th>
                  <th className="px-1 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const m = rowMetrics(row);
                  const selected = row.workItemId === selectedId;
                  return (
                    <tr
                      key={row.workItemId}
                      onClick={() => onSelectedIdChange(row.workItemId)}
                      className={`cursor-pointer border-t border-stone-100 ${selected ? "bg-blue-50/60 ring-2 ring-inset ring-blue-500" : "hover:bg-stone-50"}`}
                    >
                      <td className="px-1.5 py-1.5">
                        <Combo id={`${listBaseId}-cat-${row.workItemId}`} value={row.category} options={categoryOptions} onChange={(v) => handleCategoryChange(row, v)} placeholder="工種" />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <Combo id={`${listBaseId}-item-${row.workItemId}`} value={row.workName} options={itemNamesOf(masters, row.category)} onChange={(v) => handleItemChange(row, v)} placeholder="項目名" />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <Combo id={`${listBaseId}-mat-${row.workItemId}`} value={row.materialName} options={materialsOf(masters, row.category, row.workName)} onChange={(v) => handleMaterialChange(row, v)} placeholder="材料名/品番" />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <Combo id={`${listBaseId}-loc-${row.workItemId}`} value={row.location1} options={LOCATION_PRESETS} onChange={(v) => updateRow(row.workItemId, { location1: v })} placeholder="施工場所" />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input inputMode="decimal" value={row.quantity}
                          onChange={(e) => updateRow(row.workItemId, { quantity: e.target.value })}
                          onBlur={(e) => normalizeField(row.workItemId, "quantity", e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="0"
                          className="w-16 rounded-md border border-blue-300 bg-white px-2 py-1.5 text-right text-sm font-bold text-stone-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-300" />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <Combo id={`${listBaseId}-unit-${row.workItemId}`} value={row.unit} options={unitOptionsOf(masters, row.category, row.workName)} onChange={(v) => handleUnitChange(row, v)} placeholder="単位" narrow />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input inputMode="numeric" value={row.sellingUnitPrice}
                          onChange={(e) => updateRow(row.workItemId, { sellingUnitPrice: e.target.value })}
                          onBlur={(e) => normalizeField(row.workItemId, "sellingUnitPrice", e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="0"
                          className="w-24 rounded-md border border-blue-300 bg-white px-2 py-1.5 text-right text-sm font-bold text-stone-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-300" />
                      </td>
                      <td className="px-2 py-1.5 text-right font-bold text-stone-800">{fmtYen(m.sellingAmount)}</td>
                      <td className="px-1 py-1.5 text-center">
                        <button type="button" onClick={(e) => { e.stopPropagation(); removeRow(row.workItemId); }} className="px-1 text-xs text-stone-300 hover:text-red-500">✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* スマホ: 行カード（横スクロールにしない） */}
        {rows.length > 0 && (
          <div className="space-y-2 lg:hidden">
            {rows.map((row, i) => {
              const m = rowMetrics(row);
              const selected = row.workItemId === selectedId;
              return (
                <div key={row.workItemId} className={`overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ${selected ? "ring-2 ring-blue-500" : "ring-stone-100"}`}>
                  <button type="button" onClick={() => onSelectedIdChange(selected ? null : row.workItemId)} className="flex w-full items-center justify-between px-4 py-2.5 text-left">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-stone-800">{row.workName || `項目 ${i + 1}`}</span>
                      <span className="block text-xs text-stone-400">{row.category || "工種未選択"}{row.materialName ? `・${row.materialName}` : ""}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-bold text-stone-800">{fmtYen(m.sellingAmount)}</span>
                      <span className="block text-xs text-stone-400">{m.quantity}{row.unit}</span>
                    </span>
                  </button>
                  <div className="grid grid-cols-2 gap-2 border-t border-stone-100 px-4 py-3">
                    <label className="text-xs text-stone-500">工種
                      <Combo id={`${listBaseId}-mcat-${row.workItemId}`} value={row.category} options={categoryOptions} onChange={(v) => handleCategoryChange(row, v)} placeholder="工種" block />
                    </label>
                    <label className="text-xs text-stone-500">項目名
                      <Combo id={`${listBaseId}-mitem-${row.workItemId}`} value={row.workName} options={itemNamesOf(masters, row.category)} onChange={(v) => handleItemChange(row, v)} placeholder="項目名" block />
                    </label>
                    <label className="text-xs text-stone-500">材料名/品番
                      <Combo id={`${listBaseId}-mmat-${row.workItemId}`} value={row.materialName} options={materialsOf(masters, row.category, row.workName)} onChange={(v) => handleMaterialChange(row, v)} placeholder="材料名/品番" block />
                    </label>
                    <label className="text-xs text-stone-500">施工場所
                      <Combo id={`${listBaseId}-mloc-${row.workItemId}`} value={row.location1} options={LOCATION_PRESETS} onChange={(v) => updateRow(row.workItemId, { location1: v })} placeholder="施工場所" block />
                    </label>
                    <label className="text-xs text-stone-500">数量
                      <input inputMode="decimal" value={row.quantity} onChange={(e) => updateRow(row.workItemId, { quantity: e.target.value })} onBlur={(e) => normalizeField(row.workItemId, "quantity", e.target.value)} placeholder="0" className="mt-0.5 w-full rounded-md border border-blue-300 bg-white px-2 py-2 text-right text-sm font-bold text-stone-800 focus:border-blue-500 focus:outline-none" />
                    </label>
                    <label className="text-xs text-stone-500">単位
                      <Combo id={`${listBaseId}-munit-${row.workItemId}`} value={row.unit} options={unitOptionsOf(masters, row.category, row.workName)} onChange={(v) => handleUnitChange(row, v)} placeholder="単位" block />
                    </label>
                    <label className="text-xs text-stone-500">売価単価（円）
                      <input inputMode="numeric" value={row.sellingUnitPrice} onChange={(e) => updateRow(row.workItemId, { sellingUnitPrice: e.target.value })} onBlur={(e) => normalizeField(row.workItemId, "sellingUnitPrice", e.target.value)} placeholder="0" className="mt-0.5 w-full rounded-md border border-blue-300 bg-white px-2 py-2 text-right text-sm font-bold text-stone-800 focus:border-blue-500 focus:outline-none" />
                    </label>
                    <div className="text-xs text-stone-500">見積金額
                      <div className="mt-0.5 flex items-center justify-end rounded-md bg-stone-100 px-2 py-2">
                        <span className="font-bold text-stone-800">{fmtYen(m.sellingAmount)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button type="button" onClick={addRow} className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-blue-400/50 bg-white px-4 py-3 text-sm font-bold text-blue-600 active:opacity-80">
          ＋ 工事項目を追加
        </button>
      </div>

      {/* 右：内部管理（選択行） */}
      <div className="mt-3 lg:mt-0">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100 lg:sticky lg:top-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-stone-800">
            内部管理 <span className="text-xs font-normal text-stone-400">（外部帳票には表示されません）</span>
          </h2>
          {!selectedRow ? (
            <p className="mt-4 text-sm text-stone-400">行を選択すると、原価・粗利の内訳が表示されます。</p>
          ) : (
            <InternalPanel
              row={selectedRow}
              metrics={rowMetrics(selectedRow)}
              onSellingChange={(v) => updateRow(selectedRow.workItemId, { sellingUnitPrice: v })}
              onSellingBlur={(v) => normalizeField(selectedRow.workItemId, "sellingUnitPrice", v)}
            />
          )}

          {selectedRow && (
            <div className="mt-4 border-t border-stone-100 pt-3">
              <button type="button" onClick={onToggleDetail} className="flex w-full items-center justify-between text-xs font-bold text-stone-500">
                <span>詳細（税区分・工事内容・備考・関連被害）</span>
                <span>{showDetail ? "▲" : "▼"}</span>
              </button>
              {showDetail && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="mb-0.5 block text-xs text-stone-500">税区分・税率</label>
                    <select value={taxComboValue(selectedRow.taxType, selectedRow.taxRate)} onChange={(e) => { const { taxType, taxRate } = TAX_COMBO[e.target.value]; updateRow(selectedRow.workItemId, { taxType, taxRate }); }} className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-blue-400 focus:outline-none">
                      {selectedRow.taxType === "taxable" && selectedRow.taxRate === 0 && <option value="taxable_0">課税0%（詳細）</option>}
                      <option value="taxable_10">課税10%</option>
                      <option value="taxable_8">課税8%</option>
                      <option value="non_taxable">非課税</option>
                      <option value="tax_exempt">不課税・対象外</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-0.5 block text-xs text-stone-500">工事内容</label>
                    <input type="text" value={selectedRow.workDescription} onChange={(e) => updateRow(selectedRow.workItemId, { workDescription: e.target.value })} placeholder="既存クロスめくり・下地処理・新規クロス貼り" className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-blue-400 focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-xs text-stone-500">備考</label>
                    <input type="text" value={selectedRow.note} onChange={(e) => updateRow(selectedRow.workItemId, { note: e.target.value })} className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-blue-400 focus:outline-none" />
                  </div>
                  {damageOptions.length > 0 && (
                    <div>
                      <label className="mb-1 block text-xs text-stone-500">関連する被害</label>
                      <div className="flex flex-wrap gap-1.5">
                        {damageOptions.map((opt) => {
                          const active = selectedRow.relatedDamageIds.includes(opt.id);
                          return (
                            <button key={opt.id} type="button" onClick={() => toggleDamage(selectedRow.workItemId, opt.id)} className={`min-h-[40px] rounded-lg px-3 py-1.5 text-xs font-bold active:opacity-80 ${active ? "bg-[#8B4A3C] text-white" : "border border-stone-200 bg-white text-stone-500"}`}>
                              {opt.caption}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 独自コンボボックス（候補選択＋自由入力・仕様3/17〜20/A）
// 入力欄は白背景のまま。候補リストは暗色（黒背景×白文字）でSafariでも確実に読める。
// datalist と違い CSS で完全に制御できる。候補はポータルで body 直下に fixed 配置し、
// 表のはみ出し（overflow:hidden）で切れないようにする。
function Combo({
  id, value, options, onChange, placeholder, block, narrow,
}: {
  id: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder: string;
  block?: boolean;
  narrow?: boolean;
}) {
  const width = block ? "mt-0.5 w-full" : narrow ? "w-full min-w-[64px]" : "w-full min-w-[92px]";
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [hi, setHi] = useState(-1);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // 候補の絞り込み。開いた直後（フォーカス/クリック）は全候補を出し、
  // ユーザーが入力した時だけ入力値で絞り込む（既存値で勝手に絞らない＝単位変更を妨げない）。
  const q = value.trim().toLowerCase();
  const matched = typing && q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  const list = matched.length > 0 ? matched : options;

  function place() {
    const r = inputRef.current?.getBoundingClientRect();
    if (r) setRect({ top: r.bottom, left: r.left, width: r.width });
  }
  function openList() {
    place();
    setOpen(true);
    setTyping(false); // 開いた直後は全候補を見せる
    setHi(-1);
  }
  function close() {
    setOpen(false);
    setTyping(false);
    setHi(-1);
  }
  function choose(v: string) {
    onChange(v);
    close();
  }

  // 開いている間はスクロール・リサイズに追従して位置を合わせる
  useEffect(() => {
    if (!open) return;
    const handler = () => place();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [open]);

  return (
    <span className="relative block">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => { onChange(e.target.value); place(); setOpen(true); setTyping(true); setHi(-1); }}
        onFocus={openList}
        onClick={(e) => { e.stopPropagation(); openList(); }}
        onBlur={() => window.setTimeout(close, 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); if (!open) openList(); setHi((h) => Math.min(h + 1, list.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter") { if (open && hi >= 0 && list[hi]) { e.preventDefault(); choose(list[hi]); } }
          else if (e.key === "Escape") { close(); }
        }}
        placeholder={placeholder}
        autoComplete="off"
        className={`${width} rounded-md border border-stone-200 bg-white px-2 py-2 text-sm text-stone-800 placeholder:text-stone-300 focus:border-blue-400 focus:outline-none lg:py-1.5`}
      />
      {mounted && open && list.length > 0 && rect && createPortal(
        <ul
          role="listbox"
          aria-label={placeholder}
          style={{ position: "fixed", top: rect.top + 2, left: rect.left, minWidth: Math.max(rect.width, 120), zIndex: 70 }}
          className="max-h-60 overflow-auto rounded-lg border border-stone-600 bg-stone-800 py-1 shadow-xl"
        >
          {list.map((o, i) => (
            <li
              key={`${id}-${o}`}
              role="option"
              aria-selected={i === hi}
              // onMouseDown（クリックより先）で選択し、input の blur による閉じを防ぐ
              onMouseDown={(e) => { e.preventDefault(); choose(o); }}
              onMouseEnter={() => setHi(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${i === hi ? "bg-blue-600 text-white" : "text-stone-100 hover:bg-stone-700"}`}
            >
              {o}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </span>
  );
}

function InternalPanel({
  row, metrics, onSellingChange, onSellingBlur,
}: {
  row: EditableWorkItem;
  metrics: RowMetrics;
  onSellingChange: (v: string) => void;
  onSellingBlur: (v: string) => void;
}) {
  return (
    <div className="mt-3 space-y-2.5">
      <AutoField label="原価単価" value={metrics.unitCost > 0 ? fmtYen(metrics.unitCost) : "—"} chip />
      <AutoField label="数量" value={`${metrics.quantity}${row.unit}`} />
      <AutoField label="原価金額" value={fmtYen(metrics.costAmount)} />
      <AutoField label="目標粗利率" value={fmtPct(metrics.targetProfitRate)} chip />
      <div className="my-1 border-t border-dashed border-stone-200" />
      <AutoField label="参考売価" value={metrics.referencePrice > 0 ? fmtYen(metrics.referencePrice) : "—"} />
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm text-stone-600">採用売価</label>
        <div className="flex items-center gap-1">
          <input
            inputMode="numeric"
            value={row.sellingUnitPrice}
            onChange={(e) => onSellingChange(e.target.value)}
            onBlur={(e) => onSellingBlur(e.target.value)}
            placeholder="0"
            className="w-28 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-right text-sm font-bold text-stone-800 focus:border-amber-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-300"
          />
          <span className="text-xs text-stone-400">円</span>
        </div>
      </div>
      <AutoField label="粗利額" value={fmtYen(metrics.grossProfit)} tone={LEVEL_TEXT[metrics.level]} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-stone-600">実粗利率</span>
        <span className="flex items-center gap-1.5">
          <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${metrics.level === "ok" ? "bg-teal-50 text-teal-600" : metrics.level === "caution" ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"}`}>
            {LEVEL_LABEL[metrics.level]}
          </span>
          <span className={`text-sm font-bold ${LEVEL_TEXT[metrics.level]}`}>{fmtPct(metrics.grossProfitRate)}</span>
        </span>
      </div>
      {metrics.sellingAmount > 0 && metrics.level !== "ok" && (
        <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">
          粗利率が目安（25%）を下回っています。売価は変更できますが、最終判断はご確認ください。
        </p>
      )}
      {row.note ? <p className="text-[11px] text-stone-400">備考: {row.note}</p> : null}
      <p className="text-[11px] text-stone-400">
        税区分: {row.taxType === "taxable" ? `課税${row.taxRate}%` : TAX_TYPE_LABELS[row.taxType]}
      </p>
    </div>
  );
}

function AutoField({ label, value, chip, tone }: { label: string; value: string; chip?: boolean; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-sm text-stone-600">
        {label}
        {chip && <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">単価マスタから自動取得</span>}
      </span>
      <span className={`rounded-lg bg-stone-100 px-3 py-1.5 text-sm font-bold ${tone ?? "text-stone-800"}`}>{value}</span>
    </div>
  );
}

// 下部集計の4カード（見積合計/原価合計/粗利/粗利率）。ボタンは各ページが持つ。
export function TotalsCards({
  selling, cost, grossProfit, grossProfitRate, levelClass,
}: {
  selling: number;
  cost: number;
  grossProfit: number;
  grossProfitRate: number;
  levelClass: string;
}) {
  return (
    <div className="grid grid-cols-4 gap-2 lg:gap-4">
      <StatCard label="見積合計" value={fmtYen(selling)} />
      <StatCard label="原価合計" value={fmtYen(cost)} tone="text-stone-500" />
      <StatCard label="粗利" value={fmtYen(grossProfit)} tone={levelClass} />
      <StatCard label="粗利率" value={fmtPct(grossProfitRate)} tone={levelClass} />
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-stone-50 px-2 py-2 lg:px-4 lg:py-2.5">
      <div className="text-[11px] text-stone-500 lg:text-xs">{label}</div>
      <div className={`text-base font-bold leading-tight lg:text-xl ${tone ?? "text-stone-800"}`}>{value}</div>
    </div>
  );
}
