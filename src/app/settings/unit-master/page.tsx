"use client";

// 自社単価マスタ管理
//
// 見積・原価の「正本」。ここで登録した単価を、見積・原価入力画面で
// 「項目を選ぶ＋数量を入れる」だけで呼び出す。材料のみ／施工のみ／材料＋施工の
// 3種類を同じ構造で表現できる（クロス専用にハードコードしない）。
// 将来の初回設定導線（会社情報→振込先→標準粗利率→自社単価マスタ→よく使う項目）に耐える構造。

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  unitPriceMasterStore,
  ensureUnitPriceMasterSeeded,
  withMasterDerived,
  type UnitPriceMasterItem,
} from "@/app/utils/unitPriceMaster";
import { parseNumericInput, normalizeNumericString } from "@/app/utils/numberInput";
import { unitCostTotal, referenceSellingUnitPrice } from "@/app/utils/costCalc";
import { newRecordIsTestData } from "@/app/utils/devData";
import { TAX_TYPE_LABELS, type TaxType, type TaxRate } from "@/app/utils/taxCalculation";

const UNITS = ["m", "㎡", "枚", "式", "人工", "箇所", "本", "ケース", "台"];

const inputCls =
  "w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-base text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-2 focus:ring-[#8B4A3C]/20";
const labelCls = "mb-1 block text-xs font-bold text-stone-600";

type FormState = {
  id: string | null;
  workCategory: string;
  itemName: string;
  materialName: string;
  unit: string;
  materialUnitCost: string;
  laborUnitCost: string;
  subcontractUnitCost: string;
  otherUnitCost: string;
  targetProfitRatePct: string; // %表記
  standardSellingUnitPrice: string; // 空なら参考売価を採用
  taxType: TaxType;
  taxRate: TaxRate;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  id: null,
  workCategory: "",
  itemName: "",
  materialName: "",
  unit: "m",
  materialUnitCost: "0",
  laborUnitCost: "0",
  subcontractUnitCost: "0",
  otherUnitCost: "0",
  targetProfitRatePct: "25",
  standardSellingUnitPrice: "",
  taxType: "taxable",
  taxRate: 10,
  active: true,
};

function fmtYen(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

function toForm(m: UnitPriceMasterItem): FormState {
  return {
    id: m.id,
    workCategory: m.workCategory,
    itemName: m.itemName,
    materialName: m.materialName,
    unit: m.unit,
    materialUnitCost: String(m.materialUnitCost),
    laborUnitCost: String(m.laborUnitCost),
    subcontractUnitCost: String(m.subcontractUnitCost),
    otherUnitCost: String(m.otherUnitCost),
    targetProfitRatePct: String(Math.round(m.targetProfitRate * 1000) / 10),
    standardSellingUnitPrice: m.standardSellingUnitPrice ? String(m.standardSellingUnitPrice) : "",
    taxType: m.taxType,
    taxRate: m.taxRate,
    active: m.active,
  };
}

export default function UnitMasterPage() {
  const [items, setItems] = useState<UnitPriceMasterItem[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [msg, setMsg] = useState<string | null>(null);

  function reload() {
    setItems(unitPriceMasterStore.getAll());
  }

  useEffect(() => {
    ensureUnitPriceMasterSeeded();
    reload();
  }, []);

  const editing = form.id !== null;

  // 入力からの派生プレビュー（原価単価合計・参考売価）
  const preview = useMemo(() => {
    const units = {
      materialUnitCost: parseNumericInput(form.materialUnitCost),
      laborUnitCost: parseNumericInput(form.laborUnitCost),
      subcontractUnitCost: parseNumericInput(form.subcontractUnitCost),
      otherUnitCost: parseNumericInput(form.otherUnitCost),
    };
    const total = unitCostTotal(units);
    const rate = parseNumericInput(form.targetProfitRatePct) / 100;
    return { total, reference: referenceSellingUnitPrice(total, rate) };
  }, [form.materialUnitCost, form.laborUnitCost, form.subcontractUnitCost, form.otherUnitCost, form.targetProfitRatePct]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function resetForm() {
    setForm(EMPTY_FORM);
  }

  function handleSave() {
    if (!form.workCategory.trim() || !form.itemName.trim()) {
      setMsg("工種と項目名は必須です。");
      setTimeout(() => setMsg(null), 4000);
      return;
    }
    const input = {
      workCategory: form.workCategory.trim(),
      itemName: form.itemName.trim(),
      materialName: form.materialName.trim(),
      unit: form.unit,
      materialUnitCost: parseNumericInput(form.materialUnitCost),
      laborUnitCost: parseNumericInput(form.laborUnitCost),
      subcontractUnitCost: parseNumericInput(form.subcontractUnitCost),
      otherUnitCost: parseNumericInput(form.otherUnitCost),
      targetProfitRate: parseNumericInput(form.targetProfitRatePct) / 100,
      standardSellingUnitPrice: parseNumericInput(form.standardSellingUnitPrice),
      taxType: form.taxType,
      taxRate: (form.taxType === "taxable" ? form.taxRate : 0) as TaxRate,
      active: form.active,
    };
    let ok = false;
    if (form.id) {
      const existing = unitPriceMasterStore.getById(form.id);
      ok = unitPriceMasterStore.upsert(
        withMasterDerived({ ...input, id: form.id, createdAt: existing?.createdAt, isTestData: existing?.isTestData ?? newRecordIsTestData() }),
      );
    } else {
      ok = unitPriceMasterStore.create({ ...input, isTestData: newRecordIsTestData() }) !== null;
    }
    if (ok) {
      reload();
      resetForm();
      setMsg(form.id ? "単価マスタを更新しました。" : "単価マスタに追加しました。");
    } else {
      setMsg("保存に失敗しました（容量超過の可能性）。");
    }
    setTimeout(() => setMsg(null), 4000);
  }

  function handleDelete(id: string) {
    if (!confirm("この単価マスタを削除しますか？")) return;
    unitPriceMasterStore.remove(id);
    reload();
    if (form.id === id) resetForm();
  }

  function toggleActive(m: UnitPriceMasterItem) {
    unitPriceMasterStore.upsert({ ...m, active: !m.active });
    reload();
  }

  // 工種ごとにグループ表示
  const grouped = useMemo(() => {
    const map = new Map<string, UnitPriceMasterItem[]>();
    for (const m of items) {
      const list = map.get(m.workCategory) ?? [];
      list.push(m);
      map.set(m.workCategory, list);
    }
    return Array.from(map.entries());
  }, [items]);

  return (
    <div className="min-h-screen bg-[#fdf8f2] pb-16">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">
        <header className="mb-3">
          <Link href="/" className="mb-2 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">← ホームへ戻る</Link>
          <h1 className="text-xl font-bold text-stone-800">自社単価マスタ</h1>
          <p className="mt-1 text-sm text-stone-500">
            登録した単価を、見積・原価入力で「項目を選ぶ＋数量を入れる」だけで呼び出せます。
            材料のみ・施工のみ・材料＋施工（複合）の3種類を同じ形で登録できます。
          </p>
        </header>

        {msg && <div className="mb-3 rounded-xl bg-green-50 px-3 py-2 text-xs font-bold text-green-700 ring-1 ring-green-200">{msg}</div>}

        {/* 入力フォーム */}
        <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
          <h2 className="mb-3 text-sm font-bold text-stone-700">{editing ? "単価マスタを編集" : "単価マスタを追加"}</h2>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>工種 *</label>
              <input list="cat-list" value={form.workCategory} onChange={(e) => set("workCategory", e.target.value)} placeholder="クロス工事" className={inputCls} />
              <datalist id="cat-list">
                {Array.from(new Set(items.map((m) => m.workCategory))).map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className={labelCls}>項目名 *</label>
              <input value={form.itemName} onChange={(e) => set("itemName", e.target.value)} placeholder="クロス張替" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>材料名</label>
              <input value={form.materialName} onChange={(e) => set("materialName", e.target.value)} placeholder="（任意）SP2525" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>単位</label>
              <select value={form.unit} onChange={(e) => set("unit", e.target.value)} className={inputCls}>
                {(UNITS.includes(form.unit) ? UNITS : [form.unit, ...UNITS]).map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>材料原価単価</label>
              <input inputMode="numeric" value={form.materialUnitCost} onChange={(e) => set("materialUnitCost", e.target.value)} onBlur={(e) => set("materialUnitCost", normalizeNumericString(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>労務原価単価</label>
              <input inputMode="numeric" value={form.laborUnitCost} onChange={(e) => set("laborUnitCost", e.target.value)} onBlur={(e) => set("laborUnitCost", normalizeNumericString(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>外注原価単価</label>
              <input inputMode="numeric" value={form.subcontractUnitCost} onChange={(e) => set("subcontractUnitCost", e.target.value)} onBlur={(e) => set("subcontractUnitCost", normalizeNumericString(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>その他原価単価</label>
              <input inputMode="numeric" value={form.otherUnitCost} onChange={(e) => set("otherUnitCost", e.target.value)} onBlur={(e) => set("otherUnitCost", normalizeNumericString(e.target.value))} className={inputCls} />
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>標準目標粗利率（%）</label>
              <input inputMode="numeric" value={form.targetProfitRatePct} onChange={(e) => set("targetProfitRatePct", e.target.value)} onBlur={(e) => set("targetProfitRatePct", normalizeNumericString(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>標準売上単価（空欄=参考売価）</label>
              <input inputMode="numeric" value={form.standardSellingUnitPrice} onChange={(e) => set("standardSellingUnitPrice", e.target.value)} onBlur={(e) => set("standardSellingUnitPrice", normalizeNumericString(e.target.value))} placeholder={String(preview.reference)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>税区分</label>
              <select value={form.taxType === "taxable" ? `taxable_${form.taxRate}` : form.taxType} onChange={(e) => {
                const v = e.target.value;
                if (v === "non_taxable" || v === "tax_exempt") set("taxType", v);
                else { set("taxType", "taxable"); set("taxRate", (v === "taxable_8" ? 8 : 10) as TaxRate); }
              }} className={inputCls}>
                <option value="taxable_10">課税10%</option>
                <option value="taxable_8">課税8%</option>
                <option value="non_taxable">非課税</option>
                <option value="tax_exempt">不課税・対象外</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex min-h-[44px] items-center gap-2 text-sm text-stone-700">
                <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} className="h-5 w-5 accent-[#8B4A3C]" />
                有効
              </label>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2.5 text-sm">
            <span className="text-stone-500">原価単価合計 <b className="text-stone-800">{fmtYen(preview.total)}</b></span>
            <span className="text-stone-500">参考売価 <b className="text-stone-800">{fmtYen(preview.reference)}</b></span>
          </div>

          <div className="mt-3 flex gap-2">
            <button type="button" onClick={handleSave} className="min-h-[48px] flex-1 rounded-xl bg-[#8B4A3C] px-4 py-3 text-sm font-bold text-white active:opacity-80">
              {editing ? "更新する" : "追加する"}
            </button>
            {editing && (
              <button type="button" onClick={resetForm} className="min-h-[48px] rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold text-stone-600 active:opacity-80">
                新規に戻す
              </button>
            )}
          </div>
        </div>

        {/* 一覧 */}
        <div className="space-y-4">
          {grouped.length === 0 && <p className="text-sm text-stone-400">まだ単価マスタがありません。</p>}
          {grouped.map(([category, list]) => (
            <div key={category}>
              <h3 className="mb-1.5 text-xs font-bold text-stone-500">{category || "（工種未設定）"}</h3>
              <div className="space-y-2">
                {list.map((m) => (
                  <div key={m.id} className={`rounded-xl bg-white p-3 shadow-sm ring-1 ${m.active ? "ring-stone-100" : "opacity-60 ring-stone-200"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-stone-800">
                          {m.itemName}{m.materialName ? <span className="ml-1 text-xs font-normal text-stone-400">/ {m.materialName}</span> : null}
                        </p>
                        <p className="mt-0.5 text-xs text-stone-500">
                          原価単価 {fmtYen(m.totalUnitCost)}/{m.unit}・目標粗利率 {(m.targetProfitRate * 100).toFixed(0)}%・参考売価 {fmtYen(m.referenceSellingUnitPrice)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-stone-400">
                          材{fmtYen(m.materialUnitCost)}・労{fmtYen(m.laborUnitCost)}・外{fmtYen(m.subcontractUnitCost)}・他{fmtYen(m.otherUnitCost)}・{m.taxType === "taxable" ? `課税${m.taxRate}%` : TAX_TYPE_LABELS[m.taxType]}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <button type="button" onClick={() => setForm(toForm(m))} className="text-xs font-bold text-[#8B4A3C]">編集</button>
                        <button type="button" onClick={() => toggleActive(m)} className="text-xs text-stone-400">{m.active ? "無効化" : "有効化"}</button>
                        <button type="button" onClick={() => handleDelete(m.id)} className="text-xs text-stone-300 hover:text-red-500">削除</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
