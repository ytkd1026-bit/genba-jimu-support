"use client";

// 会社設定（自社情報＋振込先＋標準粗利率）の保存先を隠蔽する Repository。
// Supabase 利用可能時は company_settings（org につき1件）、それ以外は localStorage（genba_settings）。

import { getSupabase } from "@/app/lib/supabase/client";
import { activeBackend, resolveSupabaseContext } from "@/app/lib/supabase/backend";
import {
  getCompanySettings,
  getBankSettings,
  getStandardProfitRate,
  DEFAULT_STANDARD_PROFIT_RATE,
} from "@/app/utils/companySettings";

const SETTINGS_RAW_KEY = "genba_settings";

/** 完全に空の会社設定（クラウドに行が無いときに使う。ローカル既定値を混ぜない） */
function emptyProfile(): CompanyProfile {
  return {
    businessName: "", representative: "", postalCode: "", address: "", tel: "", email: "", invoiceNumber: "",
    bankName: "", branchName: "", accountType: "普通", accountNumber: "", accountHolder: "",
    standardProfitRate: DEFAULT_STANDARD_PROFIT_RATE,
  };
}

/** localStorage に「ユーザーが実際に入力した」自社情報があるか（既定値は数えない） */
function rawLocalCompanyName(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_RAW_KEY) ?? "{}");
    return typeof raw.businessName === "string" ? raw.businessName.trim() : "";
  } catch {
    return "";
  }
}

const SETTINGS_STORAGE_KEY = "genba_settings";

export type CompanyProfile = {
  businessName: string;
  representative: string;
  postalCode: string;
  address: string;
  tel: string;
  email: string;
  invoiceNumber: string;
  bankName: string;
  branchName: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
  standardProfitRate: number; // 0〜1
};

export type CompanySetupStatus = {
  userId: string | null;
  organizationId: string | null;
  organizationExists: boolean;
  companySettingsExists: boolean;
  companyNameExists: boolean;
};

function localGet(): CompanyProfile {
  const c = getCompanySettings();
  const b = getBankSettings();
  return {
    businessName: c.businessName,
    representative: c.representative,
    postalCode: c.postalCode,
    address: c.address,
    tel: c.tel,
    email: c.email,
    invoiceNumber: c.invoiceNumber,
    bankName: b.bankName,
    branchName: b.branchName,
    accountType: b.accountType,
    accountNumber: b.accountNumber,
    accountHolder: b.accountHolder,
    standardProfitRate: getStandardProfitRate(),
  };
}

function localSave(p: CompanyProfile): void {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}");
  } catch {
    raw = {};
  }
  const merged = {
    ...raw,
    businessName: p.businessName,
    representative: p.representative,
    postalCode: p.postalCode,
    address: p.address,
    tel: p.tel,
    email: p.email,
    invoiceNumber: p.invoiceNumber,
    bankName: p.bankName,
    branchName: p.branchName,
    accountType: p.accountType,
    accountNumber: p.accountNumber,
    accountHolder: p.accountHolder,
    standardProfitRate: p.standardProfitRate,
  };
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToProfile(r: any): CompanyProfile {
  return {
    businessName: r.company_name ?? "",
    representative: r.representative_name ?? "",
    postalCode: r.postal_code ?? "",
    address: r.address ?? "",
    tel: r.phone ?? "",
    email: r.email ?? "",
    invoiceNumber: r.invoice_registration_number ?? "",
    bankName: r.bank_name ?? "",
    branchName: r.branch_name ?? "",
    accountType: r.account_type ?? "普通",
    accountNumber: r.account_number ?? "",
    accountHolder: r.account_holder ?? "",
    standardProfitRate:
      typeof r.standard_profit_rate === "number" ? r.standard_profit_rate : DEFAULT_STANDARD_PROFIT_RATE,
  };
}

function profileToRow(p: CompanyProfile, organizationId: string) {
  return {
    organization_id: organizationId,
    company_name: p.businessName,
    representative_name: p.representative,
    postal_code: p.postalCode,
    address: p.address,
    phone: p.tel,
    email: p.email,
    invoice_registration_number: p.invoiceNumber,
    bank_name: p.bankName,
    branch_name: p.branchName,
    account_type: p.accountType,
    account_number: p.accountNumber,
    account_holder: p.accountHolder,
    standard_profit_rate: p.standardProfitRate,
  };
}

export const companyRepository = {
  async get(): Promise<CompanyProfile> {
    const be = await activeBackend();
    if (be.mode === "supabase") {
      const sb = getSupabase()!;
      const { data, error } = await sb
        .from("company_settings")
        .select("*")
        .eq("organization_id", be.organizationId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      // クラウドに行が無い＝未登録。ローカル既定値は混ぜず、空を返す（初期設定判定を正しくするため）
      if (!data) return emptyProfile();
      return rowToProfile(data);
    }
    return localGet();
  },

  async save(p: CompanyProfile): Promise<{ ok: boolean; error?: string }> {
    const be = await activeBackend();
    if (be.mode === "supabase") {
      const sb = getSupabase()!;
      const { error } = await sb
        .from("company_settings")
        .upsert(profileToRow(p, be.organizationId!), { onConflict: "organization_id" });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }
    localSave(p);
    return { ok: true };
  },

  /**
   * 実際に自社情報が登録済みか（初期設定完了の判定・§4/§22）。
   * organization の存在だけでは true にしない。実データ（company_name）の有無で判定。
   * - supabase 表示中: クラウドの company_settings.company_name
   * - local 表示中: localStorage の実入力値（既定値 "REVO" 等は数えない）
   */
  async hasRealCompanyInfo(): Promise<boolean> {
    const be = await activeBackend();
    if (be.mode === "supabase") {
      const p = await this.get(); // クラウド空なら emptyProfile → ""
      return p.businessName.trim() !== "";
    }
    return rawLocalCompanyName() !== "";
  },

  /** ホームの初期設定完了判定用。organizationと会社設定行をクラウド正本で確認する。 */
  async cloudSetupStatus(): Promise<CompanySetupStatus> {
    const ctx = await resolveSupabaseContext();
    if (!ctx) {
      return {
        userId: null,
        organizationId: null,
        organizationExists: false,
        companySettingsExists: false,
        companyNameExists: false,
      };
    }

    const [organization, company] = await Promise.all([
      ctx.sb.from("organizations").select("id").eq("id", ctx.organizationId).maybeSingle(),
      ctx.sb.from("company_settings").select("id, company_name").eq("organization_id", ctx.organizationId).maybeSingle(),
    ]);
    const error = organization.error ?? company.error;
    if (error) throw new Error(error.message);

    return {
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      organizationExists: !!organization.data,
      companySettingsExists: !!company.data,
      companyNameExists:
        typeof company.data?.company_name === "string" && company.data.company_name.trim() !== "",
    };
  },

  /** クラウド側に会社設定が登録済みか（移行時の上書き回避に使う） */
  async cloudHasCompany(): Promise<boolean> {
    const ctx = await resolveSupabaseContext();
    if (!ctx) return false;
    const { data } = await ctx.sb
      .from("company_settings")
      .select("company_name")
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    return !!(data && typeof data.company_name === "string" && data.company_name.trim() !== "");
  },

  /** 移行専用: 移行ゲートに関係なくクラウドへ直接保存する */
  async migrateSave(p: CompanyProfile): Promise<{ ok: boolean; error?: string }> {
    const ctx = await resolveSupabaseContext();
    if (!ctx) return { ok: false, error: "クラウドに接続していません。" };
    const { error } = await ctx.sb
      .from("company_settings")
      .upsert(profileToRow(p, ctx.organizationId), { onConflict: "organization_id" });
    return error ? { ok: false, error: error.message } : { ok: true };
  },
};
