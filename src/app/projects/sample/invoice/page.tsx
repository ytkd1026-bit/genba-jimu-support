"use client";

import Link from "next/link";
import { useState, useMemo } from "react";

// TODO: Supabase連携後は、新規案件登録時の元請情報を customers テーブルに保存し、
//       projects.customer_id と紐づける。現在は仮データで動作確認中。

// ─── 型定義 ──────────────────────────────────────────────────
type Customer = {
  id: string;
  name: string;
  displayName: string;
  contactName: string;
  closingDay: string;
  paymentTerm: string;
  dueDate: string;
};

type InvoiceProject = {
  id: string;
  customerId: string;
  included: boolean;
  projectName: string;
  siteAddress: string;
  workSummary: string;
  completedAt: string;
  subtotal: number;
  tax: number;
  total: number;
};

type BankInfo = {
  bankName: string;
  branchName: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
};

// ─── 元請・得意先マスタ（仮） ─────────────────────────────────
// TODO: Supabase連携後は customers テーブルから取得する
const CUSTOMERS: Customer[] = [
  {
    id: "customer-1",
    name: "△△工務店",
    displayName: "△△工務店 御中",
    contactName: "山田様",
    closingDay: "月末締め",
    paymentTerm: "翌月末払い",
    dueDate: "2026-06-30",
  },
  {
    id: "customer-2",
    name: "□□リフォーム",
    displayName: "□□リフォーム 御中",
    contactName: "佐藤様",
    closingDay: "20日締め",
    paymentTerm: "翌月20日払い",
    dueDate: "2026-06-20",
  },
  {
    id: "customer-3",
    name: "〇〇建設",
    displayName: "〇〇建設 御中",
    contactName: "田中様",
    closingDay: "月末締め",
    paymentTerm: "翌々月10日払い",
    dueDate: "2026-07-10",
  },
];

// ─── 案件データ（仮） ─────────────────────────────────────────
// TODO: Supabase連携後は projects テーブルから customer_id でフィルタして取得する
const INITIAL_ALL_PROJECTS: InvoiceProject[] = [
  {
    id: "project-1", customerId: "customer-1", included: true,
    projectName: "〇〇マンション クロス貼替",
    siteAddress: "大阪府堺市〇〇区",
    workSummary: "洋室クロス貼替・洗面所CF貼替",
    completedAt: "2026-05-20",
    subtotal: 88000, tax: 8800, total: 96800,
  },
  {
    id: "project-2", customerId: "customer-1", included: true,
    projectName: "△△邸 CF貼替",
    siteAddress: "大阪府堺市△△区",
    workSummary: "洗面所CF貼替",
    completedAt: "2026-05-22",
    subtotal: 28000, tax: 2800, total: 30800,
  },
  {
    id: "project-3", customerId: "customer-2", included: true,
    projectName: "□□店舗 床補修",
    siteAddress: "大阪府大阪市□□区",
    workSummary: "床下地補修・フロアタイル部分貼替",
    completedAt: "2026-05-25",
    subtotal: 80000, tax: 8000, total: 88000,
  },
  {
    id: "project-4", customerId: "customer-3", included: true,
    projectName: "◇◇マンション 雑工事",
    siteAddress: "大阪府堺市◇◇区",
    workSummary: "カーテンレール取付・軽微補修",
    completedAt: "2026-05-28",
    subtotal: 20000, tax: 2000, total: 22000,
  },
];

// ─── 定数 ────────────────────────────────────────────────────
const ACCOUNT_TYPES = ["普通", "当座"];

function emptyProject(customerId: string, idx: number): InvoiceProject {
  return {
    id: `new-${Date.now()}-${idx}`, customerId, included: true,
    projectName: "", siteAddress: "", workSummary: "",
    completedAt: "", subtotal: 0, tax: 0, total: 0,
  };
}

function fmtYen(n: number): string { return "¥" + n.toLocaleString("ja-JP"); }

// ─── スタイル定数 ─────────────────────────────────────────────
const fi = "w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#8B4A3C]/30";
const fs = "w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 focus:border-[#8B4A3C] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#8B4A3C]/30";
const lbl = "mb-0.5 block text-xs text-stone-400";

// ─── 案件カード ───────────────────────────────────────────────
function ProjectCard({
  project, index, canDelete,
  onUpdate, onToggle, onDelete,
}: {
  project: InvoiceProject; index: number; canDelete: boolean;
  onUpdate: (field: keyof InvoiceProject, value: string | number) => void;
  onToggle: () => void; onDelete: () => void;
}) {
  return (
    <div className={`overflow-hidden rounded-2xl shadow-sm transition-opacity ${
      project.included
        ? "bg-white ring-1 ring-stone-100"
        : "bg-stone-50 opacity-60 ring-1 ring-stone-200"
    }`}>
      {/* カードヘッダー */}
      <div className={`flex items-center justify-between border-b px-4 py-2.5 ${
        project.included ? "border-stone-100 bg-stone-50" : "border-stone-200 bg-stone-100"
      }`}>
        <div className="flex items-center gap-2.5">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={project.included}
              onChange={onToggle}
              className="h-4 w-4 rounded border-stone-300 accent-[#8B4A3C]"
            />
            <span className="text-xs font-bold text-stone-600">案件 {index + 1}</span>
          </label>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
            project.included
              ? "bg-[#8B4A3C]/10 text-[#8B4A3C]"
              : "bg-stone-200 text-stone-500"
          }`}>
            {project.included ? "請求対象" : "対象外"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!canDelete) { alert("案件行は最低1行必要です。"); return; }
            onDelete();
          }}
          className="text-xs text-stone-400 active:text-red-500"
        >削除</button>
      </div>

      <div className={`space-y-3 p-4 ${!project.included ? "pointer-events-none select-none" : ""}`}>
        <div>
          <label className={lbl}>案件名</label>
          <input type="text" value={project.projectName}
            onChange={(e) => onUpdate("projectName", e.target.value)}
            placeholder="例：〇〇マンション クロス貼替" className={fi} />
        </div>
        <div>
          <label className={lbl}>現場住所</label>
          <input type="text" value={project.siteAddress}
            onChange={(e) => onUpdate("siteAddress", e.target.value)}
            placeholder="例：大阪府堺市〇〇区" className={fi} />
        </div>
        <div>
          <label className={lbl}>工事内容</label>
          <input type="text" value={project.workSummary}
            onChange={(e) => onUpdate("workSummary", e.target.value)}
            placeholder="例：洋室クロス貼替・洗面所CF貼替" className={fi} />
        </div>
        <div>
          <label className={lbl}>完了日</label>
          <input type="date" value={project.completedAt}
            onChange={(e) => onUpdate("completedAt", e.target.value)}
            className={fi} />
        </div>

        {/* 金額3行 */}
        <div className="divide-y divide-stone-100 rounded-xl border border-stone-100">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs text-stone-500">小計</span>
            <input type="number" inputMode="numeric" value={project.subtotal}
              onChange={(e) => onUpdate("subtotal", parseFloat(e.target.value) || 0)}
              className="w-32 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-right text-sm font-bold text-stone-800 focus:border-[#8B4A3C] focus:outline-none" />
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs text-stone-500">消費税</span>
            <input type="number" inputMode="numeric" value={project.tax}
              onChange={(e) => onUpdate("tax", parseFloat(e.target.value) || 0)}
              className="w-32 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-right text-sm font-medium text-stone-600 focus:border-[#8B4A3C] focus:outline-none" />
          </div>
          <div className="flex items-center justify-between rounded-b-xl bg-[#fdf0ec] px-3 py-2.5">
            <span className="text-xs font-bold text-[#8B4A3C]">税込金額</span>
            <input type="number" inputMode="numeric" value={project.total}
              onChange={(e) => onUpdate("total", parseFloat(e.target.value) || 0)}
              className="w-32 rounded-lg border border-[#8B4A3C]/30 bg-[#fdf0ec] px-2 py-1 text-right text-base font-bold text-[#8B4A3C] focus:border-[#8B4A3C] focus:outline-none" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── メインページ ─────────────────────────────────────────────
export default function InvoicePage() {
  // 案件データ（全元請分）
  const [allProjects, setAllProjects] = useState<InvoiceProject[]>(INITIAL_ALL_PROJECTS);
  const [newProjectCount, setNewProjectCount] = useState(0);
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  // 請求情報
  const [invoiceNo] = useState("INV-0001");
  const [invoiceDate, setInvoiceDate] = useState("2026-05-30");
  const [selectedCustomerId, setSelectedCustomerId] = useState(CUSTOMERS[0].id);
  const [periodFrom, setPeriodFrom] = useState("2026-05-01");
  const [periodTo, setPeriodTo] = useState("2026-05-31");

  // 振込先
  const [bank, setBank] = useState<BankInfo>({
    bankName: "", branchName: "", accountType: "普通",
    accountNumber: "", accountHolder: "",
  });

  // 備考
  const [invoiceNote, setInvoiceNote] = useState("");

  // 選択中の元請情報
  const selectedCustomer = useMemo(
    () => CUSTOMERS.find((c) => c.id === selectedCustomerId) ?? CUSTOMERS[0],
    [selectedCustomerId]
  );

  // 元請変更時：支払期日などを自動セット
  function handleCustomerChange(customerId: string) {
    setSelectedCustomerId(customerId);
  }

  // 選択元請に絞った案件リスト
  const filteredProjects = useMemo(
    () => allProjects.filter((p) => p.customerId === selectedCustomerId),
    [allProjects, selectedCustomerId]
  );

  // 案件操作
  function toggleProject(id: string) {
    setAllProjects((prev) => prev.map((p) => p.id === id ? { ...p, included: !p.included } : p));
  }
  function updateProject(id: string, field: keyof InvoiceProject, value: string | number) {
    setAllProjects((prev) => prev.map((p) => p.id === id ? { ...p, [field]: value } : p));
  }
  function addProject() {
    const n = newProjectCount + 1;
    setNewProjectCount(n);
    setAllProjects((prev) => [...prev, emptyProject(selectedCustomerId, n)]);
  }
  function removeProject(id: string) {
    setAllProjects((prev) => prev.filter((p) => p.id !== id));
  }

  // 集計（表示中かつチェック済み）
  const targets = filteredProjects.filter((p) => p.included);
  const subtotalSum = targets.reduce((acc, p) => acc + p.subtotal, 0);
  const taxSum = targets.reduce((acc, p) => acc + p.tax, 0);
  const totalWithTax = targets.reduce((acc, p) => acc + p.total, 0);

  // ── 一括請求書PDF 生成 ────────────────────────────────────────
  async function handleBulkInvoicePDF() {
    if (isPdfLoading) return;
    if (targets.length === 0) {
      alert("請求対象案件がありません。請求対象にチェックを入れてください。");
      return;
    }
    setIsPdfLoading(true);
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { makeBulkInvoicePDF } = await import('./BulkInvoicePDF');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const element: any = makeBulkInvoicePDF({
        invoiceNo,
        invoiceDate,
        periodFrom,
        periodTo,
        customer: selectedCustomer,
        projects: targets.map((p) => ({
          projectName: p.projectName,
          siteAddress: p.siteAddress,
          workSummary: p.workSummary,
          completedAt: p.completedAt,
          subtotal: p.subtotal,
          tax: p.tax,
          total: p.total,
        })),
        subtotalSum,
        taxSum,
        totalWithTax,
        bank,
        invoiceNote,
      });
      const blob = await pdf(element).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bulk_invoice_${invoiceNo}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF生成エラー:', err);
      alert('PDFの生成に失敗しました。ネットワーク接続を確認してから再試行してください。');
    } finally {
      setIsPdfLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        {/* ヘッダー */}
        <header className="mb-4">
          <Link href="/projects/sample" className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← 案件詳細へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">得意先別 請求書作成</h1>
          <p className="mt-1 text-sm text-stone-500">
            元請けごとに複数案件をまとめて、一括請求書を作成します。
          </p>
        </header>

        {/* 請求情報カード */}
        <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between border-b border-stone-100 pb-2">
            <span className="text-sm font-bold text-stone-800">請求情報</span>
            <span className="text-xs text-stone-400">{invoiceNo}</span>
          </div>

          {/* 説明文 */}
          <p className="mb-3 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">
            請求先を選ぶと、その元請に紐づく請求対象案件だけを表示します。
          </p>

          <div className="space-y-3">
            {/* 請求先プルダウン */}
            <div>
              <label className={lbl}>請求先</label>
              <select
                value={selectedCustomerId}
                onChange={(e) => handleCustomerChange(e.target.value)}
                className={fs}
              >
                {CUSTOMERS.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* 選択した元請の自動表示 */}
            <div className="rounded-xl border border-stone-100 bg-stone-50 divide-y divide-stone-100">
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="w-20 shrink-0 text-xs text-stone-400 pt-0.5">請求先表示名</span>
                <span className="text-sm font-bold text-stone-800">{selectedCustomer.displayName}</span>
              </div>
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="w-20 shrink-0 text-xs text-stone-400 pt-0.5">担当者</span>
                <span className="text-sm text-stone-700">{selectedCustomer.contactName}</span>
              </div>
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="w-20 shrink-0 text-xs text-stone-400 pt-0.5">締日</span>
                <span className="text-sm text-stone-700">{selectedCustomer.closingDay}</span>
              </div>
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="w-20 shrink-0 text-xs text-stone-400 pt-0.5">支払条件</span>
                <span className="text-sm text-stone-700">{selectedCustomer.paymentTerm}</span>
              </div>
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="w-20 shrink-0 text-xs text-[#8B4A3C] font-bold pt-0.5">支払期日</span>
                <span className="text-sm font-bold text-[#8B4A3C]">
                  {selectedCustomer.dueDate.replace(/-/g, "/")}
                </span>
              </div>
            </div>

            {/* 対象期間・請求日 */}
            <div>
              <label className={lbl}>対象期間</label>
              <div className="flex items-center gap-2">
                <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className={fi} />
                <span className="shrink-0 text-xs text-stone-400">〜</span>
                <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className={fi} />
              </div>
            </div>
            <div>
              <label className={lbl}>請求日</label>
              <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={fi} />
            </div>
          </div>
        </div>

        {/* 請求対象案件 */}
        <section className="mb-4 space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-stone-700">請求対象案件</h2>
              <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600">
                {selectedCustomer.name}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-stone-500">
              チェックした案件の税込金額を合計して請求金額を出します。
            </p>
          </div>

          {filteredProjects.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-stone-200 py-8 text-center text-sm text-stone-400">
              この元請の案件はまだありません
            </div>
          ) : (
            filteredProjects.map((project, index) => (
              <ProjectCard
                key={project.id} project={project} index={index}
                canDelete={filteredProjects.length > 1}
                onUpdate={(field, value) => updateProject(project.id, field, value)}
                onToggle={() => toggleProject(project.id)}
                onDelete={() => removeProject(project.id)}
              />
            ))
          )}

          <button type="button" onClick={addProject}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-200 py-3.5 text-sm font-bold text-stone-500 active:opacity-75">
            <span className="text-base leading-none">＋</span>
            案件行を追加
          </button>
        </section>

        {/* 集計カード */}
        <div className="mb-4 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="p-4">
            <h2 className="mb-3 text-sm font-bold text-stone-700">請求金額</h2>
            <div className="divide-y divide-stone-100 rounded-xl border border-stone-100">
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-sm text-stone-500">対象案件数</span>
                <span className="text-sm font-bold text-stone-800">{targets.length}件</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-sm text-stone-500">小計合計</span>
                <span className="text-sm font-medium text-stone-800">{fmtYen(subtotalSum)}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-sm text-stone-500">消費税合計</span>
                <span className="text-sm font-medium text-stone-700">{fmtYen(taxSum)}</span>
              </div>
              <div className="flex items-center justify-between rounded-b-xl bg-[#fdf0ec] px-4 py-3">
                <div>
                  <p className="text-xs text-[#8B4A3C]">税込請求額</p>
                  <p className="text-[11px] text-[#8B4A3C]/70">
                    支払期日：{selectedCustomer.dueDate.replace(/-/g, "/")}
                  </p>
                </div>
                <span className="text-2xl font-bold text-[#8B4A3C]">{fmtYen(totalWithTax)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 振込先カード */}
        <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">振込先</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={lbl}>銀行名</label>
                <input type="text" value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} placeholder="例：〇〇銀行" className={fi} />
              </div>
              <div>
                <label className={lbl}>支店名</label>
                <input type="text" value={bank.branchName} onChange={(e) => setBank({ ...bank, branchName: e.target.value })} placeholder="例：〇〇支店" className={fi} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={lbl}>口座種別</label>
                <select value={bank.accountType} onChange={(e) => setBank({ ...bank, accountType: e.target.value })} className={fs}>
                  {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>口座番号</label>
                <input type="text" inputMode="numeric" value={bank.accountNumber} onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })} placeholder="例：1234567" className={fi} />
              </div>
            </div>
            <div>
              <label className={lbl}>口座名義（カタカナ）</label>
              <input type="text" value={bank.accountHolder} onChange={(e) => setBank({ ...bank, accountHolder: e.target.value })} placeholder="例：ヤマダ タロウ" className={fi} />
            </div>
          </div>
        </div>

        {/* 備考欄 */}
        <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <label className="mb-2 block text-sm font-bold text-stone-700">備考</label>
          <textarea
            value={invoiceNote}
            onChange={(e) => setInvoiceNote(e.target.value)}
            rows={3}
            placeholder="例：5月施工分の一括請求です。お振込み手数料はご負担ください。"
            className={fi + " resize-none"}
          />
        </div>

        {/* ボタン群 */}
        <div className="space-y-3 pb-8">
          <button
            type="button"
            onClick={handleBulkInvoicePDF}
            disabled={isPdfLoading}
            className="w-full rounded-2xl bg-[#8B4A3C] py-3.5 text-white shadow-sm active:opacity-80 disabled:opacity-50"
          >
            <span className="block text-base font-bold">
              {isPdfLoading ? '生成中...' : '請求書PDFを作る'}
            </span>
            <span className="block mt-0.5 text-xs font-normal text-amber-100">
              {isPdfLoading ? 'フォント読み込み中（初回のみ時間がかかります）' : '得意先別 一括請求書'}
            </span>
          </button>
          <button type="button"
            onClick={() => alert("一括請求書を仮保存しました。次工程で保存機能を追加します。")}
            className="w-full rounded-2xl border border-[#8B4A3C] bg-white py-4 text-base font-bold text-[#8B4A3C] shadow-sm active:opacity-80">
            仮保存
          </button>
          <Link href="/projects/sample"
            className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-4 text-base font-bold text-stone-600 shadow-sm active:opacity-80">
            案件詳細へ戻る
          </Link>
        </div>

      </div>
    </div>
  );
}
