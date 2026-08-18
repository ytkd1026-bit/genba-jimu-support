"use client";

// 新規見積フロー（見積を作る）
//
// ホームの「見積を作る」から直接ここへ来る。案件管理を先にさせない（仕様1・10）。
// 上部で 元請を選ぶ＋案件名等を入力 → 見積明細（初期5空行）を入力 → 保存。
// 保存時に Project が無ければ自動生成し、WorkItem・SavedEstimate を正しく紐付ける（仕様11）。
// 元請は contractorId で関連付け、提出先情報は SavedEstimate へスナップショット保存（仕様21・22）。

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  projectsStore,
  issueNewProjectId,
  createEmptyProject,
  advanceProjectStatus,
  type Project,
} from "@/app/utils/projects";
import { workItemsStore, issueWorkItemId, type WorkItem } from "@/app/utils/workItems";
import {
  ensureUnitPriceMasterSeeded,
  unitPriceMasterStore,
  type UnitPriceMasterItem,
} from "@/app/utils/unitPriceMaster";
import {
  contractorStore,
  contractorToSnapshot,
  type Contractor,
} from "@/app/utils/contractorMaster";
import {
  getSavedEstimates,
  upsertEstimate,
  setSelectedEstimateId,
  type SavedEstimate,
} from "@/app/utils/savedEstimates";
import {
  workItemsToSellingLines,
  workItemsToEstimateItems,
  workItemsToSnapshots,
  computeEstimateTotals,
  projectDocumentNumber,
  nextEstimateSeq,
} from "@/app/utils/workItemEstimate";
import { newRecordIsTestData } from "@/app/utils/devData";
import { draftKey } from "@/app/utils/draftStorage";
import { useAutoDraft } from "@/hooks/useAutoDraft";
import { SaveStatusBar } from "@/components/SaveStatusBar";
import { EstimateEditor, TotalsCards } from "@/components/estimate/EstimateEditor";
import {
  toEditable,
  toWorkItem,
  emptyEditableRow,
  normalizeEditableRow,
  isEmptyRow,
  computeEditorTotals,
  LEVEL_TEXT,
  type EditableWorkItem,
} from "@/app/utils/estimateRows";
import { parseNumericInput } from "@/app/utils/numberInput";

const INITIAL_EMPTY_ROWS = 5;

type HeaderState = {
  contractorId: string;
  existingProjectId: string;
  projectName: string;
  siteName: string;
  siteAddress: string;
  estimateDate: string;
  validUntil: string;
  note: string;
};

type EstimateNewDraft = { header: HeaderState; rows: EditableWorkItem[] };

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const inputCls =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-800 placeholder:text-stone-300 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300/40";
const labelCls = "mb-1 block text-xs font-bold text-stone-600";

export default function NewEstimatePage() {
  const router = useRouter();

  const [loaded, setLoaded] = useState(false);
  const [header, setHeader] = useState<HeaderState>({
    contractorId: "",
    existingProjectId: "",
    projectName: "",
    siteName: "",
    siteAddress: "",
    estimateDate: todayIso(),
    validUntil: "",
    note: "",
  });
  const [rows, setRows] = useState<EditableWorkItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [masters, setMasters] = useState<UnitPriceMasterItem[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showDetail, setShowDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [restoreDismissed, setRestoreDismissed] = useState(false);

  // 新元請のインライン追加
  const [showAddContractor, setShowAddContractor] = useState(false);
  const [newContractor, setNewContractor] = useState({ name: "", contactName: "", tel: "", email: "", postalCode: "", address: "" });

  useEffect(() => {
    ensureUnitPriceMasterSeeded();
    setMasters(unitPriceMasterStore.getActive());
    setContractors(contractorStore.getActive());
    setProjects(projectsStore.getAll());
    const initial = Array.from({ length: INITIAL_EMPTY_ROWS }, (_, i) => emptyEditableRow(`tmp-${Date.now()}-${i}`));
    setRows(initial);
    setSelectedId(initial[0]?.workItemId ?? null);
    setLoaded(true);
  }, []);

  const DRAFT_KEY = draftKey("estimate", "new");
  const draftData = useMemo<EstimateNewDraft>(() => ({ header, rows }), [header, rows]);
  const { saveStatus, savedAt, clearDraft, restoredDraft } = useAutoDraft<EstimateNewDraft>(
    DRAFT_KEY, "estimate", "new", draftData, { enabled: loaded, debounceMs: 800 },
  );
  const showRestoreBanner = !!restoredDraft?.data && !restoreDismissed;

  function handleRestoreDraft() {
    if (!restoredDraft?.data) return;
    if (restoredDraft.data.header) setHeader(restoredDraft.data.header);
    const restored = (restoredDraft.data.rows ?? []).map(normalizeEditableRow);
    if (restored.length > 0) {
      setRows(restored);
      setSelectedId(restored[0].workItemId);
    }
    setRestoreDismissed(true);
  }

  function setH<K extends keyof HeaderState>(key: K, value: HeaderState[K]) {
    setHeader((h) => ({ ...h, [key]: value }));
  }

  function handleSelectExistingProject(pid: string) {
    if (!pid) {
      setH("existingProjectId", "");
      return;
    }
    const p = projectsStore.getById(pid);
    if (!p) return;
    setHeader((h) => ({
      ...h,
      existingProjectId: pid,
      projectName: p.projectName,
      siteName: p.propertyName,
      siteAddress: p.siteAddress,
      contractorId: p.contractorId ?? h.contractorId,
    }));
    // 既存案件の工事項目があれば読み込む
    const existing = workItemsStore.getByProjectId(pid).map(toEditable);
    if (existing.length > 0) {
      setRows(existing);
      setSelectedId(existing[0].workItemId);
    }
  }

  function handleAddContractor() {
    if (!newContractor.name.trim()) {
      setErrMsg("元請名を入力してください。");
      setTimeout(() => setErrMsg(null), 4000);
      return;
    }
    const created = contractorStore.create({
      name: newContractor.name.trim(),
      contactName: newContractor.contactName.trim(),
      postalCode: newContractor.postalCode.trim(),
      address: newContractor.address.trim(),
      tel: newContractor.tel.trim(),
      email: newContractor.email.trim(),
      closingDay: "",
      paymentTerms: "",
      note: "",
      active: true,
      isTestData: newRecordIsTestData(),
    });
    if (created) {
      setContractors(contractorStore.getActive());
      setH("contractorId", created.id);
      setShowAddContractor(false);
      setNewContractor({ name: "", contactName: "", tel: "", email: "", postalCode: "", address: "" });
    } else {
      setErrMsg("元請の保存に失敗しました。");
      setTimeout(() => setErrMsg(null), 4000);
    }
  }

  function issueRowId() {
    return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  const totals = useMemo(() => computeEditorTotals(rows), [rows]);

  function buildSavedEstimate(projectId: string, workItems: WorkItem[], contractor: Contractor | null): SavedEstimate {
    const now = new Date().toISOString();
    const lines = workItemsToSellingLines(workItems);
    const t = computeEstimateTotals(lines);
    const seq = nextEstimateSeq(getSavedEstimates(), projectId);
    const memo = [
      header.estimateDate ? `見積日:${header.estimateDate}` : "",
      header.validUntil ? `有効期限:${header.validUntil}` : "",
      header.note,
    ].filter(Boolean).join(" / ");
    return {
      id: `est-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
      estimateNo: projectDocumentNumber(projectId, "EST", seq),
      projectId,
      projectName: header.projectName,
      clientName: contractor?.name ?? "",
      siteAddress: header.siteAddress,
      workDescription: workItems[0]?.workName ?? "",
      estimateItems: workItemsToEstimateItems(workItems),
      subtotal: t.subtotal,
      tax: t.tax,
      total: t.total,
      status: "saved",
      version: 1,
      memo,
      taxBreakdown: t.breakdown,
      lineSnapshots: workItemsToSnapshots(workItems),
      contractorId: contractor?.id,
      submitToSnapshot: contractor ? contractorToSnapshot(contractor) : undefined,
    };
  }

  function handleSaveAndReview() {
    const nonEmpty = rows.filter((r) => !isEmptyRow(r) && (r.workName.trim() !== "" || parseNumericInput(r.sellingUnitPrice) > 0 || parseNumericInput(r.quantity) > 0));
    if (nonEmpty.length === 0) {
      setErrMsg("工事項目を1件以上入力してください。");
      setTimeout(() => setErrMsg(null), 4000);
      return;
    }
    if (!header.projectName.trim()) {
      setErrMsg("案件名を入力してください。");
      setTimeout(() => setErrMsg(null), 4000);
      return;
    }

    setSaving(true);
    try {
      const contractor = header.contractorId ? contractorStore.getById(header.contractorId) : null;

      // Project: 既存選択があれば再利用（重複作成しない）。無ければ自動生成（仕様11）。
      let projectId = header.existingProjectId;
      if (projectId) {
        const p = projectsStore.getById(projectId);
        if (p) {
          projectsStore.upsert({
            ...p,
            projectName: header.projectName || p.projectName,
            propertyName: header.siteName || p.propertyName,
            siteAddress: header.siteAddress || p.siteAddress,
            submitTo: contractor?.name ?? p.submitTo,
            clientName: contractor?.name ?? p.clientName,
            customerName: contractor?.contactName ?? p.customerName,
            contractorId: contractor?.id ?? p.contractorId,
            updatedAt: new Date().toISOString(),
          });
        }
      } else {
        projectId = issueNewProjectId();
        const p = createEmptyProject(projectId);
        p.projectName = header.projectName;
        p.propertyName = header.siteName;
        p.siteAddress = header.siteAddress;
        p.submitTo = contractor?.name ?? "";
        p.clientName = contractor?.name ?? "";
        p.customerName = contractor?.contactName ?? "";
        p.contractorId = contractor?.id;
        p.isTestData = newRecordIsTestData();
        p.status = "estimating";
        projectsStore.upsert(p);
      }

      // WorkItem: 入力済み行のみを案件スコープの W-xxx で採番して保存
      const now = new Date().toISOString();
      const existingIds = new Set(workItemsStore.getByProjectId(projectId).map((w) => w.workItemId));
      const savedItems: WorkItem[] = [];
      const keepIds = new Set<string>();
      for (const row of nonEmpty) {
        const finalId = existingIds.has(row.workItemId) ? row.workItemId : issueWorkItemId(projectId);
        const item = toWorkItem({ ...row, workItemId: finalId }, projectId, now);
        workItemsStore.upsert(item);
        savedItems.push(item);
        keepIds.add(finalId);
      }
      for (const id of existingIds) {
        if (!keepIds.has(id)) workItemsStore.remove(id);
      }

      // SavedEstimate 保存
      const est = buildSavedEstimate(projectId, savedItems, contractor);
      upsertEstimate(est);
      setSelectedEstimateId(est.id);
      advanceProjectStatus(projectId, "estimating");

      clearDraft();
      router.push(`/projects/${encodeURIComponent(projectId)}/estimate`);
    } catch (e) {
      console.error("見積保存エラー:", e);
      setErrMsg("保存に失敗しました。もう一度お試しください。");
      setSaving(false);
      setTimeout(() => setErrMsg(null), 5000);
    }
  }

  return (
    <div className="min-h-screen bg-[#fdf8f2] pb-40">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg lg:max-w-6xl">
        <header className="mb-3">
          <Link href="/" className="mb-2 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">← ホームへ戻る</Link>
          <h1 className="text-xl font-bold text-stone-800">見積を作る</h1>
          <p className="mt-1 text-sm text-stone-500">元請を選び、案件名と工事項目を入力すると見積ができます。案件登録は保存時に自動で行われます。</p>
        </header>

        {showRestoreBanner && restoredDraft && (
          <div className="mb-3 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
            <p className="text-xs font-bold text-amber-800">保存されていない見積の下書きがあります。</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={handleRestoreDraft} className="min-h-[44px] flex-1 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white active:opacity-80">下書きを復元する</button>
              <button type="button" onClick={() => { clearDraft(); setRestoreDismissed(true); }} className="min-h-[44px] flex-1 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-700 active:opacity-80">破棄する</button>
            </div>
          </div>
        )}

        <SaveStatusBar status={saveStatus} savedAt={savedAt} />

        {/* ── ヘッダ：元請・案件情報 ── */}
        <div className="mb-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>元請</label>
              <div className="flex gap-2">
                <select value={header.contractorId} onChange={(e) => setH("contractorId", e.target.value)} className={inputCls}>
                  <option value="">（元請を選択）</option>
                  {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}{c.contactName ? `（${c.contactName}）` : ""}</option>)}
                </select>
                <button type="button" onClick={() => setShowAddContractor((v) => !v)} className="shrink-0 rounded-lg border border-[#8B4A3C] bg-white px-3 py-2 text-xs font-bold text-[#8B4A3C] active:opacity-80">＋新しい元請</button>
              </div>
              {contractors.length === 0 && !showAddContractor && (
                <p className="mt-1 text-xs text-stone-400">元請が未登録です。「＋新しい元請」から追加するか、<Link href="/settings/contractors" className="text-[#8B4A3C] underline">元請マスタ</Link>で登録してください。</p>
              )}
              {showAddContractor && (
                <div className="mt-2 space-y-2 rounded-xl bg-stone-50 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <input value={newContractor.name} onChange={(e) => setNewContractor((n) => ({ ...n, name: e.target.value }))} placeholder="元請名（必須）" className={inputCls} />
                    <input value={newContractor.contactName} onChange={(e) => setNewContractor((n) => ({ ...n, contactName: e.target.value }))} placeholder="担当者名" className={inputCls} />
                    <input value={newContractor.tel} onChange={(e) => setNewContractor((n) => ({ ...n, tel: e.target.value }))} placeholder="電話" className={inputCls} />
                    <input value={newContractor.email} onChange={(e) => setNewContractor((n) => ({ ...n, email: e.target.value }))} placeholder="メール" className={inputCls} />
                    <input value={newContractor.postalCode} onChange={(e) => setNewContractor((n) => ({ ...n, postalCode: e.target.value }))} placeholder="郵便番号" className={inputCls} />
                    <input value={newContractor.address} onChange={(e) => setNewContractor((n) => ({ ...n, address: e.target.value }))} placeholder="住所" className={inputCls} />
                  </div>
                  <button type="button" onClick={handleAddContractor} className="min-h-[44px] w-full rounded-lg bg-[#8B4A3C] px-3 py-2 text-sm font-bold text-white active:opacity-80">この元請を追加</button>
                </div>
              )}
            </div>

            {projects.length > 0 && (
              <div className="sm:col-span-2">
                <label className={labelCls}>既存案件から選ぶ（任意）</label>
                <select value={header.existingProjectId} onChange={(e) => handleSelectExistingProject(e.target.value)} className={inputCls}>
                  <option value="">新規案件として作成</option>
                  {projects.map((p) => <option key={p.projectId} value={p.projectId}>{p.projectId}・{p.projectName || "（案件名なし）"}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className={labelCls}>案件名 *</label>
              <input value={header.projectName} onChange={(e) => setH("projectName", e.target.value)} placeholder="山田様邸 内装復旧工事" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>現場名</label>
              <input value={header.siteName} onChange={(e) => setH("siteName", e.target.value)} placeholder="〇〇マンション101" className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>現場住所</label>
              <input value={header.siteAddress} onChange={(e) => setH("siteAddress", e.target.value)} placeholder="大阪府堺市〇〇区〇〇" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>見積日</label>
              <input type="date" value={header.estimateDate} onChange={(e) => setH("estimateDate", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>見積有効期限</label>
              <input type="date" value={header.validUntil} onChange={(e) => setH("validUntil", e.target.value)} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>備考</label>
              <input value={header.note} onChange={(e) => setH("note", e.target.value)} placeholder="" className={inputCls} />
            </div>
          </div>
        </div>

        {/* ── 見積明細（初期5空行） ── */}
        <EstimateEditor
          rows={rows}
          onRowsChange={setRows}
          selectedId={selectedId}
          onSelectedIdChange={setSelectedId}
          masters={masters}
          issueRowId={issueRowId}
          showDetail={showDetail}
          onToggleDetail={() => setShowDetail((v) => !v)}
        />

        {errMsg && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600 ring-1 ring-red-200">{errMsg}</div>}
      </div>

      {/* 下部：集計＋保存 */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-md px-4 py-3 sm:max-w-lg lg:max-w-6xl">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <TotalsCards selling={totals.selling} cost={totals.cost} grossProfit={totals.grossProfit} grossProfitRate={totals.grossProfitRate} levelClass={LEVEL_TEXT[totals.level]} />
            <button type="button" onClick={handleSaveAndReview} disabled={saving} className="min-h-[48px] whitespace-nowrap rounded-xl bg-[#1e3a5f] px-6 py-2.5 text-sm font-bold text-white shadow-sm active:opacity-80 disabled:opacity-50">
              {saving ? "保存中..." : "保存して見積書を確認"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
