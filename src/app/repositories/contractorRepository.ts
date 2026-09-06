"use client";

// 元請マスタの保存先を隠蔽する Repository。
// Supabase 利用可能時は contractors テーブル、それ以外は localStorage（contractorStore）。
// アプリ内の Contractor.id は業務コード（CON-xxxx）で一貫させる（Supabase の uuid は内部主キー）。

import { getSupabase } from "@/app/lib/supabase/client";
import { activeBackend, resolveSupabaseContext } from "@/app/lib/supabase/backend";
import { contractorStore, type Contractor, type ContractorInput } from "@/app/utils/contractorMaster";

export type WriteResult = { ok: true; data: Contractor } | { ok: false; error: string };

type Row = {
  id: string;
  contractor_code: string | null;
  company_name: string;
  contact_name: string;
  postal_code: string;
  address: string;
  phone: string;
  email: string;
  closing_day: string;
  payment_terms: string;
  note: string;
  active: boolean;
  is_test_data: boolean;
  local_ref: string | null;
  created_at: string;
  updated_at: string;
};

function rowToContractor(r: Row): Contractor {
  return {
    id: r.contractor_code || r.local_ref || r.id,
    name: r.company_name,
    contactName: r.contact_name ?? "",
    postalCode: r.postal_code ?? "",
    address: r.address ?? "",
    tel: r.phone ?? "",
    email: r.email ?? "",
    closingDay: r.closing_day ?? "",
    paymentTerms: r.payment_terms ?? "",
    note: r.note ?? "",
    active: r.active,
    isTestData: r.is_test_data,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function contractorToRow(c: Contractor, organizationId: string) {
  return {
    organization_id: organizationId,
    contractor_code: c.id,
    local_ref: c.id,
    company_name: c.name,
    contact_name: c.contactName,
    postal_code: c.postalCode,
    address: c.address,
    phone: c.tel,
    email: c.email,
    closing_day: c.closingDay,
    payment_terms: c.paymentTerms,
    note: c.note,
    active: c.active,
    is_test_data: c.isTestData ?? false,
  };
}

function nextContractorCode(existing: Contractor[]): string {
  let max = 0;
  for (const c of existing) {
    const n = parseInt((c.id || "").replace(/^CON-/, ""), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `CON-${String(max + 1).padStart(4, "0")}`;
}

export const contractorRepository = {
  async list(): Promise<Contractor[]> {
    const be = await activeBackend();
    if (be.mode === "supabase") {
      const sb = getSupabase()!;
      const { data, error } = await sb
        .from("contractors")
        .select("*")
        .eq("organization_id", be.organizationId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data as Row[]).map(rowToContractor);
    }
    return contractorStore.getAll();
  },

  async listActive(): Promise<Contractor[]> {
    return (await this.list()).filter((c) => c.active);
  },

  async create(input: ContractorInput): Promise<WriteResult> {
    const be = await activeBackend();
    if (be.mode === "supabase") {
      const sb = getSupabase()!;
      const existing = await this.list();
      const code = nextContractorCode(existing);
      const now = new Date().toISOString();
      const c: Contractor = { ...input, id: code, createdAt: input.createdAt ?? now, updatedAt: now };
      const { data, error } = await sb.from("contractors").insert(contractorToRow(c, be.organizationId!)).select().single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: rowToContractor(data as Row) };
    }
    const created = contractorStore.create(input);
    return created ? { ok: true, data: created } : { ok: false, error: "保存に失敗しました。" };
  },

  async upsert(c: Contractor): Promise<WriteResult> {
    const be = await activeBackend();
    if (be.mode === "supabase") {
      const sb = getSupabase()!;
      const { data, error } = await sb
        .from("contractors")
        .upsert(contractorToRow(c, be.organizationId!), { onConflict: "organization_id,local_ref" })
        .select()
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: rowToContractor(data as Row) };
    }
    const ok = contractorStore.upsert(c);
    return ok ? { ok: true, data: c } : { ok: false, error: "保存に失敗しました。" };
  },

  async remove(id: string): Promise<{ ok: boolean; error?: string }> {
    const be = await activeBackend();
    if (be.mode === "supabase") {
      const sb = getSupabase()!;
      const { error } = await sb.from("contractors").delete().eq("organization_id", be.organizationId).eq("contractor_code", id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }
    contractorStore.remove(id);
    return { ok: true };
  },

  /** 移行専用: 移行ゲートに関係なくクラウドへ直接 upsert する（local_ref で冪等） */
  async migrateUpsert(c: Contractor): Promise<{ ok: boolean; error?: string }> {
    const ctx = await resolveSupabaseContext();
    if (!ctx) return { ok: false, error: "クラウドに接続していません。" };
    const { error } = await ctx.sb
      .from("contractors")
      .upsert(contractorToRow(c, ctx.organizationId), { onConflict: "organization_id,local_ref" });
    return error ? { ok: false, error: error.message } : { ok: true };
  },
};
