"use client";

// 06 請求書（案件請求）
// - 新規は現在の WorkItem から作成（項目の請求除外に対応）
// - 保存済み請求書は lineSnapshots / taxBreakdown から再表示・再発行する
//   （現在の WorkItem を自動再読込しない＝発行済み請求の内容は変わらない）
// - 請求日・支払期限・請求書備考・振込手数料文言を入力・保存
// 原価・粗利はPDFへ出さない。税計算は共通関数に委譲。

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { projectsStore, advanceProjectStatus, type Project } from "@/app/utils/projects";
import { workItemsStore, type WorkItem } from "@/app/utils/workItems";
import {
  getSavedInvoices,
  upsertInvoice,
  type SavedInvoice,
} from "@/app/utils/savedInvoices";
import {
  workItemsToSellingLines,
  workItemsToSnapshots,
  snapshotsToSellingLines,
  computeEstimateTotals,
  taxBreakdownFromSnapshots,
  projectDocumentNumber,
} from "@/app/utils/workItemEstimate";
import type { SellingLine } from "@/components/pdf/WorkEstimatePDF";
import { getCompanyInfoForPdf, getBankSettings } from "@/app/utils/companySettings";
import { singleInvoicePdfFileName } from "@/app/utils/pdfFileName";
import { renderAndDownloadPdf, todaySlash, todayDash } from "@/app/utils/pdfDownload";
import { ProjectTabs, ProjectHeader } from "@/components/ProjectTabs";
import { TaxTotalsBox } from "@/components/TaxTotalsBox";
import { fldInput, lbl } from "@/components/formStyles";
import { draftKey } from "@/app/utils/draftStorage";
import { useAutoDraft } from "@/hooks/useAutoDraft";
import { SaveStatusBar } from "@/components/SaveStatusBar";

// 編集中の請求ヘッダ入力（請求日・支払期限・備考・除外項目）の自動下書き型。
// 明細金額は WorkItem を正本とするため下書きには入力欄のみを保持する。
type InvoiceDraft = {
  invoiceDate: string;
  dueDate: string;
  invoiceNote: string;
  bankFeeNote: string;
  excluded: string[];
};

const DEFAULT_BANK_FEE_NOTE = "振込手数料はご負担くださいますようお願いいたします。";

function fmtYen(n: number): string {
  return "¥" + n.toLocaleString("ja-JP");
}

function nextInvoiceSeq(saved: SavedInvoice[], projectId: string): number {
  const prefix = `${projectId}-INV-`;
  let max = 0;
  for (const inv of saved) {
    if (!inv.invoiceNo?.startsWith(prefix)) continue;
    const n = parseInt(inv.invoiceNo.slice(prefix.length), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return max + 1;
}

export default function ProjectInvoicePage() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(params.projectId);

  const [notFound, setNotFound] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<SavedInvoice | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("edit");

  // 入力欄
  const [invoiceDate, setInvoiceDate] = useState(todayDash());
  const [dueDate, setDueDate] = useState("");
  const [invoiceNote, setInvoiceNote] = useState("");
  const [bankFeeNote, setBankFeeNote] = useState(DEFAULT_BANK_FEE_NOTE);

  const [pdfLoading, setPdfLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [restoreDismissed, setRestoreDismissed] = useState(false);

  useEffect(() => {
    const p = projectsStore.getById(projectId);
    if (!p) {
      setNotFound(true);
      return;
    }
    setProject(p);
    setWorkItems(workItemsStore.getByProjectId(projectId));
    const existing = getSavedInvoices().find((e) => e.projectId === projectId) ?? null;
    if (existing) {
      // 保存済み請求書はスナップショットから再表示（現在の WorkItem は読まない）
      setSaved(existing);
      setMode("view");
      setInvoiceDate(existing.invoiceDate ? existing.invoiceDate.replace(/\//g, "-").slice(0, 10) : todayDash());
      setDueDate(existing.dueDate ?? "");
      setInvoiceNote(existing.memo ?? "");
      setBankFeeNote(existing.bankFeeNote ?? DEFAULT_BANK_FEE_NOTE);
    } else {
      setMode("edit");
    }
  }, [projectId]);

  // 編集ヘッダ入力の自動下書き（保存前の請求日・期限・備考・除外を保護）。
  // 保存済み請求書を表示中（view）は下書きしない。
  const invoiceDraftData = useMemo<InvoiceDraft>(
    () => ({ invoiceDate, dueDate, invoiceNote, bankFeeNote, excluded: [...excluded] }),
    [invoiceDate, dueDate, invoiceNote, bankFeeNote, excluded],
  );
  const { saveStatus, savedAt, clearDraft, restoredDraft } = useAutoDraft<InvoiceDraft>(
    draftKey("invoice", projectId), "invoice", projectId, invoiceDraftData,
    { enabled: mode === "edit", debounceMs: 800 },
  );

  // 下書き復元バナーの表示可否（編集モードで、意味のある入力がある下書きがあるとき）。
  // effect 内 setState を避けるため派生値で算出する。
  const showRestore =
    mode === "edit" && !restoreDismissed && !!restoredDraft &&
    ((restoredDraft.data.dueDate ?? "") !== "" ||
      (restoredDraft.data.invoiceNote ?? "") !== "" ||
      (restoredDraft.data.excluded?.length ?? 0) > 0);

  function handleRestoreDraft() {
    if (!restoredDraft) return;
    const d = restoredDraft.data;
    if (d.invoiceDate) setInvoiceDate(d.invoiceDate);
    setDueDate(d.dueDate ?? "");
    setInvoiceNote(d.invoiceNote ?? "");
    setBankFeeNote(d.bankFeeNote ?? DEFAULT_BANK_FEE_NOTE);
    setExcluded(new Set(d.excluded ?? []));
    setRestoreDismissed(true);
  }
  function handleDiscardDraft() {
    clearDraft();
    setRestoreDismissed(true);
  }

  // 表示明細・内訳
  const includedItems = useMemo(
    () => workItems.filter((w) => !excluded.has(w.workItemId)),
    [workItems, excluded],
  );
  const sellingLines: SellingLine[] = useMemo(() => {
    if (mode === "view" && saved?.lineSnapshots) {
      return snapshotsToSellingLines(saved.lineSnapshots);
    }
    return workItemsToSellingLines(includedItems);
  }, [mode, saved, includedItems]);

  const breakdown = useMemo(() => {
    if (mode === "view" && saved) {
      return saved.taxBreakdown ?? taxBreakdownFromSnapshots(saved.lineSnapshots ?? []);
    }
    return computeEstimateTotals(sellingLines).breakdown;
  }, [mode, saved, sellingLines]);

  const docNumber = useMemo(() => {
    if (saved) return saved.invoiceNo;
    return projectDocumentNumber(projectId, "INV", nextInvoiceSeq(getSavedInvoices(), projectId));
  }, [projectId, saved]);

  function toggleExclude(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function saveInvoice(): SavedInvoice | null {
    if (!project) return null;
    const now = new Date().toLocaleString("ja-JP");
    const id = saved?.id ?? `inv-${Date.now()}`;
    const totals = computeEstimateTotals(workItemsToSellingLines(includedItems));
    const inv: SavedInvoice = {
      id,
      createdAt: saved?.createdAt ?? now,
      updatedAt: now,
      invoiceNo: docNumber,
      projectId,
      projectName: project.projectName,
      clientName: project.submitTo || project.clientName,
      invoiceDate: invoiceDate ? invoiceDate.replace(/-/g, "/") : todaySlash(),
      dueDate,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      status: "draft",
      memo: invoiceNote,
      bankFeeNote,
      taxBreakdown: totals.breakdown,
      // 保存時点の明細（請求対象＝除外後）をスナップショット。lineSnapshots が請求対象の正本
      lineSnapshots: workItemsToSnapshots(includedItems),
    };
    upsertInvoice(inv);
    return inv;
  }

  function handleSave() {
    if (mode === "edit" && includedItems.length === 0) {
      setMsg({ ok: false, text: "請求対象の工事項目がありません。" });
      setTimeout(() => setMsg(null), 6000);
      return;
    }
    // view モードでの保存は入力欄（日付・備考）のみ更新（明細スナップショットは維持）
    let inv: SavedInvoice | null;
    if (mode === "view" && saved) {
      inv = {
        ...saved,
        invoiceDate: invoiceDate ? invoiceDate.replace(/-/g, "/") : saved.invoiceDate,
        dueDate,
        memo: invoiceNote,
        bankFeeNote,
        updatedAt: new Date().toLocaleString("ja-JP"),
      };
      upsertInvoice(inv);
    } else {
      inv = saveInvoice();
    }
    if (inv) {
      setSaved(inv);
      setMode("view");
      clearDraft(); // 本保存できたので編集下書きは不要
      setRestoreDismissed(true);
      setMsg({ ok: true, text: `請求書を保存しました（${inv.invoiceNo}）。` });
    } else {
      setMsg({ ok: false, text: "保存に失敗しました。" });
    }
    setTimeout(() => setMsg(null), 6000);
  }

  // 現在の工事項目から請求書を再作成（明示操作のみ）
  function recreateFromWorkItems() {
    if (!confirm("保存済み請求明細を現在の工事項目で置き換えます。\n元の請求内容は上書きされます。続けますか？")) {
      return;
    }
    setWorkItems(workItemsStore.getByProjectId(projectId));
    setExcluded(new Set());
    setMode("edit");
  }

  async function handlePdf() {
    if (!project || pdfLoading) return;

    let lines = sellingLines;
    let bd = breakdown;
    let docNo = docNumber;

    if (mode === "edit") {
      if (includedItems.length === 0) {
        alert("請求対象の工事項目がありません。");
        return;
      }
      const inv = saveInvoice();
      if (!inv) {
        alert("保存に失敗しました。PDFは発行していません。");
        return;
      }
      setSaved(inv);
      setMode("view");
      clearDraft(); // PDF発行前に本保存できたので編集下書きは不要
      setRestoreDismissed(true);
      lines = snapshotsToSellingLines(inv.lineSnapshots ?? []);
      bd = inv.taxBreakdown ?? breakdown;
      docNo = inv.invoiceNo;
    }

    // 支払期限が未入力なら確認（別途協議として発行 / 入力に戻る）
    let dueForPdf = dueDate;
    if (dueDate.trim() === "") {
      const proceed = confirm("支払期限が未入力です。\n「別途協議」として発行しますか？\n（OK＝別途協議として発行 / キャンセル＝入力に戻る）");
      if (!proceed) return;
      dueForPdf = "別途協議";
    } else {
      dueForPdf = dueDate.replace(/-/g, "/");
    }

    setPdfLoading(true);
    try {
      const { makeProjectInvoicePDF } = await import("@/components/pdf/ProjectInvoicePDF");
      const noteForPdf = [invoiceNote, bankFeeNote].filter((s) => s && s.trim() !== "").join("\n");
      const doc = makeProjectInvoicePDF({
        documentTitle: "請求書",
        documentNumber: docNo,
        createdDate: todaySlash(),
        submitTo: project.submitTo || project.clientName || "",
        projectName: project.projectName,
        siteAddress: project.siteAddress,
        companyInfo: getCompanyInfoForPdf(),
        projectId: project.projectId,
        lines,
        subtotalSum: bd.subtotal,
        taxSum: bd.taxTotal,
        totalWithTax: bd.total,
        taxBreakdown: bd,
        invoiceDate: invoiceDate ? invoiceDate.replace(/-/g, "/") : todaySlash(),
        dueDate: dueForPdf,
        bank: getBankSettings(),
        invoiceNote: noteForPdf,
      });
      await renderAndDownloadPdf(
        doc,
        singleInvoicePdfFileName({
          clientName: project.clientName || project.submitTo,
          projectName: project.projectName,
          workContent: (lines[0]?.workName) ?? "",
          invoiceDate: todayDash(),
        }),
      );
      // 請求PDF発行で案件ステータスを「請求済み」へ前進（後退はしない）
      advanceProjectStatus(projectId, "invoiced");
      setMsg({ ok: true, text: `請求書を保存し、請求書PDFを発行しました（${docNo}）。` });
      setTimeout(() => setMsg(null), 6000);
    } catch (err) {
      console.error("請求書PDF生成エラー:", err);
      alert("PDFの生成に失敗しました。もう一度お試しください。");
    } finally {
      setPdfLoading(false);
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#fdf8f2]">
        <div className="mx-auto max-w-md px-4 py-10 text-center sm:max-w-lg">
          <p className="text-sm font-bold text-stone-700">案件が見つかりません。</p>
          <p className="mt-1 font-mono text-xs text-stone-400">{projectId}</p>
          <Link href="/projects/list" className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#8B4A3C] px-5 py-2.5 text-sm font-bold text-white active:opacity-80">
            案件一覧へ戻る
          </Link>
        </div>
      </div>
    );
  }

  if (!project) return <div className="min-h-screen bg-[#fdf8f2]" />;

  return (
    <div className="min-h-screen bg-[#fdf8f2] pb-24">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        <header className="mb-3">
          <Link href={`/projects/${encodeURIComponent(projectId)}`} className="mb-2 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← 案件詳細へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">請求書</h1>
          <p className="mt-1 text-sm text-stone-500">
            工事項目から請求書を作成します。保存後は発行時点の内容で残ります。
          </p>
        </header>

        <ProjectHeader project={project} />
        <ProjectTabs projectId={projectId} active="invoice" />

        <div className="mb-3 flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs ring-1 ring-stone-100">
          <span className="text-stone-400">請求番号</span>
          <span className="font-mono font-bold text-stone-700">{docNumber}</span>
        </div>

        {/* 編集中の入力は自動で下書き保存される（本保存で確定） */}
        {mode === "edit" && <SaveStatusBar status={saveStatus} savedAt={savedAt} />}

        {mode === "edit" && showRestore && (
          <div className="mb-3 overflow-hidden rounded-2xl border border-amber-300 bg-amber-50 shadow-sm">
            <div className="border-b border-amber-200 bg-amber-100 px-4 py-2.5">
              <p className="text-sm font-bold text-amber-800">前回入力途中の請求内容があります</p>
            </div>
            <div className="flex gap-2 px-4 py-3">
              <button type="button" onClick={handleRestoreDraft}
                className="flex-1 min-h-[44px] rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white active:opacity-80">
                下書きを復元する
              </button>
              <button type="button" onClick={handleDiscardDraft}
                className="flex-1 min-h-[44px] rounded-xl border border-amber-300 bg-white py-2.5 text-sm font-bold text-amber-700 active:opacity-80">
                破棄する
              </button>
            </div>
          </div>
        )}

        {mode === "view" && saved && (
          <div className="mb-3 rounded-xl bg-amber-50 p-3 text-xs ring-1 ring-amber-200">
            <p className="font-bold text-amber-800">保存済み請求書を表示中（発行時点の内容）</p>
            <p className="mt-0.5 text-amber-700">現在の工事項目を変更しても、この請求書の金額は変わりません。</p>
          </div>
        )}

        {/* 請求情報入力 */}
        <div className="mb-3 space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>請求日</label>
              <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={fldInput} />
            </div>
            <div>
              <label className={lbl}>支払期限</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={fldInput} />
            </div>
          </div>
          <div>
            <label className={lbl}>請求書備考</label>
            <input type="text" value={invoiceNote} onChange={(e) => setInvoiceNote(e.target.value)}
              placeholder="例：〇月施工分のご請求です。" className={fldInput} />
          </div>
          <div>
            <label className={lbl}>振込手数料について</label>
            <input type="text" value={bankFeeNote} onChange={(e) => setBankFeeNote(e.target.value)} className={fldInput} />
          </div>
        </div>

        {workItems.length === 0 && mode === "edit" ? (
          <div className="rounded-2xl border-2 border-dashed border-stone-200 px-4 py-10 text-center">
            <p className="text-sm text-stone-500">工事項目がありません。</p>
            <Link href={`/projects/${encodeURIComponent(projectId)}/work-items`}
              className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#8B4A3C] px-5 py-2.5 text-sm font-bold text-white active:opacity-80">
              工事項目・原価へ
            </Link>
          </div>
        ) : (
          <>
            {/* 明細 */}
            {mode === "edit" ? (
              <div className="space-y-2">
                {workItems.map((w) => {
                  const isExcluded = excluded.has(w.workItemId);
                  return (
                    <div key={w.workItemId}
                      className={`rounded-xl p-3 shadow-sm ring-1 ${isExcluded ? "bg-stone-100 ring-stone-200 opacity-60" : "bg-white ring-stone-100"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-stone-800">{w.workName || "（工事名未入力）"}</p>
                          <p className="text-xs text-stone-400">{w.quantity} {w.unit} × {fmtYen(w.sellingUnitPrice)}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold text-stone-800">{fmtYen(w.sellingAmount)}</p>
                          <button type="button" onClick={() => toggleExclude(w.workItemId)}
                            className={`mt-1 min-h-[36px] rounded-lg px-2 py-1 text-xs font-bold active:opacity-80 ${isExcluded ? "bg-[#8B4A3C] text-white" : "border border-stone-200 text-stone-500"}`}>
                            {isExcluded ? "請求に含める" : "請求から除外"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {sellingLines.map((l) => (
                  <div key={l.workItemId} className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-stone-100">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-stone-800">{l.workName || "（工事名未入力）"}</p>
                        <p className="text-xs text-stone-400">
                          {l.quantity} {l.unit} × {fmtYen(l.sellingUnitPrice)}・
                          {l.taxType === "taxable" ? `課税${l.taxRate}%` : l.taxType === "non_taxable" ? "非課税" : "不課税・対象外"}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-bold text-stone-800">{fmtYen(l.sellingAmount)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3">
              <TaxTotalsBox breakdown={breakdown} title="請求合計" totalLabel="ご請求金額（税込）" />
            </div>

            {msg && (
              <div className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold ring-1 ${msg.ok ? "bg-green-50 text-green-700 ring-green-200" : "bg-red-50 text-red-600 ring-red-200"}`}>
                {msg.text}
              </div>
            )}

            <button type="button" onClick={handleSave}
              className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#8B4A3C] px-4 py-3 text-sm font-bold text-white shadow-sm active:opacity-80">
              請求書を保存する（案件に紐付け）
            </button>
            <button type="button" disabled={pdfLoading} onClick={() => void handlePdf()}
              className="mt-2 flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-[#8B4A3C] bg-white px-4 py-3 text-sm font-bold text-[#8B4A3C] active:opacity-80 disabled:opacity-50">
              {pdfLoading ? "PDF作成中..." : "📄 請求書PDFを保存して発行"}
            </button>
            {mode === "view" && (
              <button type="button" onClick={recreateFromWorkItems}
                className="mt-2 flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-bold text-stone-600 active:opacity-80">
                現在の工事項目から請求書を再作成
              </button>
            )}
          </>
        )}

      </div>
    </div>
  );
}
