"use client";

// 初回設定（オンボーディング）
//
// STEP1 自社情報＋標準粗利率 → STEP2 元請 → STEP3 単価マスタ → STEP4 完了。
// 既存の会社設定（genba_settings）があれば再利用し、二重設定を作らない（仕様3）。
// 未設定でも画面をクラッシュさせない。完了状態は appSetup で保持（仕様7・8）。

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_STANDARD_PROFIT_RATE } from "@/app/utils/companySettings";
import { setSetupCompleted, isSetupCompleted } from "@/app/utils/appSetup";
import { newRecordIsTestData } from "@/app/utils/devData";
import { normalizeNumericString, parseNumericInput } from "@/app/utils/numberInput";
import { companyRepository, type CompanyProfile } from "@/app/repositories/companyRepository";
import { contractorRepository } from "@/app/repositories/contractorRepository";
import { unitPriceRepository } from "@/app/repositories/unitPriceRepository";
import { resolveSupabaseContext } from "@/app/lib/supabase/backend";

const inputCls =
  "w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-base text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-2 focus:ring-[#8B4A3C]/20";
const labelCls = "mb-1 block text-xs font-bold text-stone-600";

type CompanyForm = {
  businessName: string; representative: string; postalCode: string; address: string;
  tel: string; email: string; invoiceNumber: string;
  bankName: string; branchName: string; accountType: string; accountNumber: string; accountHolder: string;
  standardProfitRatePct: string;
};

function profileToForm(p: CompanyProfile): CompanyForm {
  return {
    businessName: p.businessName, representative: p.representative, postalCode: p.postalCode,
    address: p.address, tel: p.tel, email: p.email, invoiceNumber: p.invoiceNumber,
    bankName: p.bankName, branchName: p.branchName, accountType: p.accountType,
    accountNumber: p.accountNumber, accountHolder: p.accountHolder,
    standardProfitRatePct: String(Math.round(p.standardProfitRate * 1000) / 10),
  };
}

function formToProfile(f: CompanyForm): CompanyProfile {
  const ratePct = parseNumericInput(f.standardProfitRatePct);
  return {
    businessName: f.businessName, representative: f.representative, postalCode: f.postalCode,
    address: f.address, tel: f.tel, email: f.email, invoiceNumber: f.invoiceNumber,
    bankName: f.bankName, branchName: f.branchName, accountType: f.accountType,
    accountNumber: f.accountNumber, accountHolder: f.accountHolder,
    standardProfitRate: ratePct >= 0 && ratePct < 100 ? ratePct / 100 : DEFAULT_STANDARD_PROFIT_RATE,
  };
}

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [company, setCompany] = useState<CompanyForm | null>(null);
  const [contractorCount, setContractorCount] = useState(0);
  const [masterCount, setMasterCount] = useState(0);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 元請クイック追加
  const [quick, setQuick] = useState({ name: "", contactName: "" });

  async function refreshCounts() {
    setContractorCount((await contractorRepository.listActive()).length);
    setMasterCount((await unitPriceRepository.listActive()).length);
  }

  useEffect(() => {
    void (async () => {
      setCompany(profileToForm(await companyRepository.get()));
      const ctx = await resolveSupabaseContext();
      setAlreadyDone(ctx ? isSetupCompleted(ctx.userId, ctx.organizationId) : false);
      await refreshCounts();
    })();
  }, []);

  function setC<K extends keyof CompanyForm>(key: K, value: CompanyForm[K]) {
    setCompany((c) => (c ? { ...c, [key]: value } : c));
  }

  async function handleSaveCompanyAndNext() {
    if (!company) return;
    if (!company.businessName.trim()) {
      setMsg("屋号・会社名を入力してください。");
      setTimeout(() => setMsg(null), 4000);
      return;
    }
    setMsg("保存中…");
    const res = await companyRepository.save(formToProfile(company));
    if (!res.ok) {
      setMsg(`保存できませんでした（通信エラー）：${res.error ?? ""}`);
      setTimeout(() => setMsg(null), 5000);
      return;
    }
    setMsg(null);
    setStep(2);
  }

  async function handleQuickAddContractor() {
    if (!quick.name.trim()) return;
    await contractorRepository.create({
      name: quick.name.trim(), contactName: quick.contactName.trim(),
      postalCode: "", address: "", tel: "", email: "", closingDay: "", paymentTerms: "", note: "",
      active: true, isTestData: newRecordIsTestData(),
    });
    setQuick({ name: "", contactName: "" });
    await refreshCounts();
  }

  async function handleComplete() {
    const ctx = await resolveSupabaseContext();
    if (!ctx) {
      setMsg("初期設定の完了状態を保存できません。ログインとクラウド接続を確認してください。");
      return;
    }
    if (!setSetupCompleted(ctx.userId, ctx.organizationId, true)) {
      setMsg("初期設定の完了状態を保存できません。Safariのサイトデータ設定を確認してください。");
      return;
    }
    router.push("/");
  }

  const canComplete = useMemo(() => !!company?.businessName.trim(), [company]);

  if (!company) return <div className="min-h-screen bg-[#fdf8f2]" />;

  return (
    <div className="min-h-screen bg-[#fdf8f2] pb-16">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">
        <header className="mb-3">
          <Link href="/" className="mb-2 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">← ホームへ戻る</Link>
          <h1 className="text-xl font-bold text-stone-800">初期設定</h1>
          <p className="mt-1 text-sm text-stone-500">一度登録すれば、見積のたびに入力し直す必要はありません。</p>
          {alreadyDone && <p className="mt-1 text-xs text-teal-600">初期設定は完了済みです。内容はいつでも変更できます。</p>}
        </header>

        {/* ステップ表示 */}
        <div className="mb-4 flex items-center gap-1">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-[#8B4A3C]" : "bg-stone-200"}`} />
          ))}
        </div>

        {msg && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600 ring-1 ring-red-200">{msg}</div>}

        {step === 1 && (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
            <h2 className="mb-3 text-sm font-bold text-stone-700">STEP 1／自社情報・標準粗利率</h2>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2"><label className={labelCls}>屋号・会社名 *</label><input value={company.businessName} onChange={(e) => setC("businessName", e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>代表者名</label><input value={company.representative} onChange={(e) => setC("representative", e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>電話番号</label><input value={company.tel} onChange={(e) => setC("tel", e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>郵便番号</label><input value={company.postalCode} onChange={(e) => setC("postalCode", e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>メール</label><input value={company.email} onChange={(e) => setC("email", e.target.value)} className={inputCls} /></div>
              <div className="col-span-2"><label className={labelCls}>住所</label><input value={company.address} onChange={(e) => setC("address", e.target.value)} className={inputCls} /></div>
              <div className="col-span-2"><label className={labelCls}>インボイス登録番号</label><input value={company.invoiceNumber} onChange={(e) => setC("invoiceNumber", e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>振込先銀行</label><input value={company.bankName} onChange={(e) => setC("bankName", e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>支店</label><input value={company.branchName} onChange={(e) => setC("branchName", e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>口座種別</label>
                <select value={company.accountType} onChange={(e) => setC("accountType", e.target.value)} className={inputCls}>
                  <option value="普通">普通</option><option value="当座">当座</option>
                </select>
              </div>
              <div><label className={labelCls}>口座番号</label><input value={company.accountNumber} onChange={(e) => setC("accountNumber", e.target.value)} className={inputCls} /></div>
              <div className="col-span-2"><label className={labelCls}>口座名義</label><input value={company.accountHolder} onChange={(e) => setC("accountHolder", e.target.value)} className={inputCls} /></div>
              <div className="col-span-2"><label className={labelCls}>標準目標粗利率（%）</label><input inputMode="numeric" value={company.standardProfitRatePct} onChange={(e) => setC("standardProfitRatePct", e.target.value)} onBlur={(e) => setC("standardProfitRatePct", normalizeNumericString(e.target.value))} className={inputCls} /></div>
            </div>
            <button type="button" onClick={handleSaveCompanyAndNext} className="mt-3 min-h-[48px] w-full rounded-xl bg-[#8B4A3C] px-4 py-3 text-sm font-bold text-white active:opacity-80">保存して次へ（元請）</button>
          </div>
        )}

        {step === 2 && (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
            <h2 className="mb-1 text-sm font-bold text-stone-700">STEP 2／元請情報</h2>
            <p className="mb-3 text-xs text-stone-500">登録済み元請：{contractorCount}件。1件以上登録するか「後で登録」で進めます。</p>
            <div className="grid grid-cols-2 gap-2">
              <input value={quick.name} onChange={(e) => setQuick((q) => ({ ...q, name: e.target.value }))} placeholder="元請名" className={inputCls} />
              <input value={quick.contactName} onChange={(e) => setQuick((q) => ({ ...q, contactName: e.target.value }))} placeholder="担当者名" className={inputCls} />
            </div>
            <button type="button" onClick={handleQuickAddContractor} className="mt-2 min-h-[44px] w-full rounded-xl border border-[#8B4A3C] bg-white px-3 py-2 text-sm font-bold text-[#8B4A3C] active:opacity-80">この元請を追加</button>
            <Link href="/settings/contractors" className="mt-2 block text-center text-xs text-[#8B4A3C] underline">詳しく登録する（元請マスタ）</Link>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setStep(1)} className="min-h-[48px] rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold text-stone-600 active:opacity-80">戻る</button>
              <button type="button" onClick={() => setStep(3)} className="min-h-[48px] flex-1 rounded-xl bg-[#8B4A3C] px-4 py-3 text-sm font-bold text-white active:opacity-80">{contractorCount > 0 ? "次へ（単価マスタ）" : "後で登録して次へ"}</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
            <h2 className="mb-1 text-sm font-bold text-stone-700">STEP 3／自社単価マスタ</h2>
            <p className="mb-3 text-xs text-stone-500">登録済み単価：{masterCount}件（クロス材料費・施工費・張替は初期登録済み）。工種は追加できます。</p>
            <Link href="/settings/unit-master" className="block min-h-[48px] rounded-xl border border-[#8B4A3C] bg-white px-4 py-3 text-center text-sm font-bold text-[#8B4A3C] active:opacity-80">単価マスタを編集する</Link>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setStep(2)} className="min-h-[48px] rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold text-stone-600 active:opacity-80">戻る</button>
              <button type="button" onClick={() => { refreshCounts(); setStep(4); }} className="min-h-[48px] flex-1 rounded-xl bg-[#8B4A3C] px-4 py-3 text-sm font-bold text-white active:opacity-80">次へ（完了）</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
            <h2 className="mb-3 text-sm font-bold text-stone-700">STEP 4／設定内容の確認</h2>
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-center justify-between"><span className="text-stone-600">自社情報</span><span className={company.businessName.trim() ? "font-bold text-teal-600" : "text-red-500"}>{company.businessName.trim() ? "登録済み" : "未登録"}</span></li>
              <li className="flex items-center justify-between"><span className="text-stone-600">標準目標粗利率</span><span className="font-bold text-stone-800">{company.standardProfitRatePct}%</span></li>
              <li className="flex items-center justify-between"><span className="text-stone-600">元請</span><span className={contractorCount > 0 ? "font-bold text-teal-600" : "text-amber-600"}>{contractorCount > 0 ? `${contractorCount}件` : "後で登録"}</span></li>
              <li className="flex items-center justify-between"><span className="text-stone-600">単価マスタ</span><span className={masterCount > 0 ? "font-bold text-teal-600" : "text-amber-600"}>{masterCount > 0 ? `${masterCount}件` : "後で登録"}</span></li>
            </ul>
            {!canComplete && <p className="mt-2 text-xs text-red-500">自社情報（屋号・会社名）が未登録です。STEP1で登録してください。</p>}
            {(contractorCount === 0 || masterCount === 0) && canComplete && (
              <p className="mt-2 text-xs text-stone-500">元請・単価マスタは後からでも登録できます。見積作成時に未登録なら案内されます。</p>
            )}
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setStep(3)} className="min-h-[48px] rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold text-stone-600 active:opacity-80">戻る</button>
              <button type="button" onClick={handleComplete} disabled={!canComplete} className="min-h-[48px] flex-1 rounded-xl bg-[#1e3a5f] px-4 py-3 text-sm font-bold text-white active:opacity-80 disabled:opacity-50">初期設定を完了する</button>
            </div>
          </div>
        )}

        {/* 設定はいつでも変更できる導線 */}
        <div className="mt-4 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-stone-100">
          <h3 className="mb-1.5 text-xs font-bold text-stone-400">設定はいつでも変更できます</h3>
          <div className="grid grid-cols-3 gap-2">
            <Link href="/settings/company" className="rounded-lg border border-stone-200 px-2 py-2 text-center text-xs font-bold text-stone-600 active:bg-stone-50">自社情報</Link>
            <Link href="/settings/contractors" className="rounded-lg border border-stone-200 px-2 py-2 text-center text-xs font-bold text-stone-600 active:bg-stone-50">元請マスタ</Link>
            <Link href="/settings/unit-master" className="rounded-lg border border-stone-200 px-2 py-2 text-center text-xs font-bold text-stone-600 active:bg-stone-50">単価マスタ</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
