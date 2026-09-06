"use client";

// 単価マスタの保存先を隠蔽する Repository。
// Supabase 利用可能時は unit_price_master、それ以外は localStorage（unitPriceMasterStore）。
// 同一項目名でも単位別レコードを許容（trade_category + item_name + unit で別レコード）。
// アプリ内の id は UPM-xxxx（Supabase では local_ref に保持）。

import { getSupabase } from "@/app/lib/supabase/client";
import { activeBackend, resolveSupabaseContext } from "@/app/lib/supabase/backend";
import {
  unitPriceMasterStore,
  ensureUnitPriceMasterSeeded,
  withMasterDerived,
  type UnitPriceMasterItem,
  type UnitPriceMasterInput,
} from "@/app/utils/unitPriceMaster";
import type { TaxType, TaxRate } from "@/app/utils/taxCalculation";

export type WriteResult = { ok: true; data: UnitPriceMasterItem } | { ok: false; error: string };

type Row = {
  id: string;
  trade_category: string;
  item_name: string;
  material_name: string;
  unit: string;
  material_unit_cost: number;
  labor_unit_cost: number;
  subcontract_unit_cost: number;
  other_unit_cost: number;
  total_unit_cost: number;
  target_profit_rate: number;
  reference_selling_unit_price: number;
  standard_selling_unit_price: number;
  active: boolean;
  is_test_data: boolean;
  local_ref: string | null;
  created_at: string;
  updated_at: string;
};

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function rowToItem(r: Row): UnitPriceMasterItem {
  return {
    id: r.local_ref || r.id,
    workCategory: r.trade_category ?? "",
    itemName: r.item_name ?? "",
    materialName: r.material_name ?? "",
    unit: r.unit ?? "",
    materialUnitCost: num(r.material_unit_cost),
    laborUnitCost: num(r.labor_unit_cost),
    subcontractUnitCost: num(r.subcontract_unit_cost),
    otherUnitCost: num(r.other_unit_cost),
    totalUnitCost: num(r.total_unit_cost),
    targetProfitRate: num(r.target_profit_rate),
    referenceSellingUnitPrice: num(r.reference_selling_unit_price),
    standardSellingUnitPrice: num(r.standard_selling_unit_price),
    taxType: "taxable" as TaxType,
    taxRate: 10 as TaxRate,
    active: r.active,
    isTestData: r.is_test_data,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function itemToRow(m: UnitPriceMasterItem, organizationId: string) {
  return {
    organization_id: organizationId,
    local_ref: m.id,
    trade_category: m.workCategory,
    item_name: m.itemName,
    material_name: m.materialName,
    unit: m.unit,
    material_unit_cost: m.materialUnitCost,
    labor_unit_cost: m.laborUnitCost,
    subcontract_unit_cost: m.subcontractUnitCost,
    other_unit_cost: m.otherUnitCost,
    total_unit_cost: m.totalUnitCost,
    target_profit_rate: m.targetProfitRate,
    reference_selling_unit_price: m.referenceSellingUnitPrice,
    standard_selling_unit_price: m.standardSellingUnitPrice,
    active: m.active,
    is_test_data: m.isTestData ?? false,
  };
}

function nextMasterId(existing: UnitPriceMasterItem[]): string {
  let max = 0;
  for (const m of existing) {
    const n = parseInt((m.id || "").replace(/^UPM-/, ""), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `UPM-${String(max + 1).padStart(4, "0")}`;
}

export const unitPriceRepository = {
  /** マスタ一式を取得。ローカル時は必須クロス項目のシードを保証する。 */
  async list(): Promise<UnitPriceMasterItem[]> {
    const be = await activeBackend();
    if (be.mode === "supabase") {
      const sb = getSupabase()!;
      const { data, error } = await sb
        .from("unit_price_master")
        .select("*")
        .eq("organization_id", be.organizationId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data as Row[]).map(rowToItem);
    }
    ensureUnitPriceMasterSeeded();
    return unitPriceMasterStore.getAll();
  },

  async listActive(): Promise<UnitPriceMasterItem[]> {
    return (await this.list()).filter((m) => m.active);
  },

  async create(input: Omit<UnitPriceMasterInput, "id">): Promise<WriteResult> {
    const be = await activeBackend();
    if (be.mode === "supabase") {
      const sb = getSupabase()!;
      const existing = await this.list();
      const id = nextMasterId(existing);
      const item = withMasterDerived({ ...input, id });
      const { data, error } = await sb.from("unit_price_master").insert(itemToRow(item, be.organizationId!)).select().single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: rowToItem(data as Row) };
    }
    const created = unitPriceMasterStore.create(input);
    return created ? { ok: true, data: created } : { ok: false, error: "保存に失敗しました。" };
  },

  async upsert(item: UnitPriceMasterItem): Promise<WriteResult> {
    const derived = withMasterDerived(item);
    const be = await activeBackend();
    if (be.mode === "supabase") {
      const sb = getSupabase()!;
      const { data, error } = await sb
        .from("unit_price_master")
        .upsert(itemToRow(derived, be.organizationId!), { onConflict: "organization_id,local_ref" })
        .select()
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: rowToItem(data as Row) };
    }
    const ok = unitPriceMasterStore.upsert(derived);
    return ok ? { ok: true, data: derived } : { ok: false, error: "保存に失敗しました。" };
  },

  async remove(id: string): Promise<{ ok: boolean; error?: string }> {
    const be = await activeBackend();
    if (be.mode === "supabase") {
      const sb = getSupabase()!;
      const { error } = await sb.from("unit_price_master").delete().eq("organization_id", be.organizationId).eq("local_ref", id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }
    unitPriceMasterStore.remove(id);
    return { ok: true };
  },

  /** 移行専用: 移行ゲートに関係なくクラウドへ直接 upsert する（local_ref で冪等） */
  async migrateUpsert(item: UnitPriceMasterItem): Promise<{ ok: boolean; error?: string }> {
    const ctx = await resolveSupabaseContext();
    if (!ctx) return { ok: false, error: "クラウドに接続していません。" };
    const { error } = await ctx.sb
      .from("unit_price_master")
      .upsert(itemToRow(withMasterDerived(item), ctx.organizationId), { onConflict: "organization_id,local_ref" });
    return error ? { ok: false, error: error.message } : { ok: true };
  },
};
