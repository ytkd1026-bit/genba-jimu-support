"use client";

// 04 見積・原価入力（既存案件）
//
// 目的: 工事項目を選び数量を1回入力するだけで、見積・原価・粗利を同時に計算する。
// 表・内部管理・計算は共有コンポーネント（EstimateEditor）と共通ロジック（estimateRows）を使う。
// 新規見積フロー（/estimate/new）と同じUI・同じ計算。
//
// 初期表示は空欄5行（仕様12）。完全な空行は保存・PDF対象から除外する（仕様14）。
// 提出用PDFには原価・粗利を一切出さない（SellingLine 設計を維持）。

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { projectsStore, advanceProjectStatus, type Project } from "@/app/utils/projects";
import {
  workItemsStore,
  issueWorkItemId,
  migrateLegacyEstimateToWorkItems,
} from "@/app/utils/workItems";
import { ensureUnitPriceMasterSeeded, unitPriceMasterStore, type UnitPriceMasterItem } from "@/app/utils/unitPriceMaster";
import { damageRecordsStore } from "@/app/utils/damageRecords";
import { getSavedEstimates, type SavedEstimate } from "@/app/utils/savedEstimates";
import { draftKey } from "@/app/utils/draftStorage";
import { useAutoDraft } from "@/hooks/useAutoDraft";
import { SaveStatusBar } from "@/components/SaveStatusBar";
import { ProjectTabs, ProjectHeader } from "@/components/ProjectTabs";
import { TaxTotalsBox } from "@/components/TaxTotalsBox";
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

type WorkItemsDraftData = { rows: EditableWorkItem[]; deletedIds: string[] };

const INITIAL_EMPTY_ROWS = 5;

export default function WorkItemsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(params.projectId);
  const router = useRouter();

  const [notFound, setNotFound] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [rows, setRows] = useState<EditableWorkItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [masters, setMasters] = useState<UnitPriceMasterItem[]>([]);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [restoreDismissed, setRestoreDismissed] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [saving, setSaving] = useState(false);

  const [legacyEstimates, setLegacyEstimates] = useState<SavedEstimate[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [damageOptions, setDamageOptions] = useState<Array<{ id: string; caption: string }>>([]);

  useEffect(() => {
    const p = projectsStore.getById(projectId);
    if (!p) {
      setNotFound(true);
      return;
    }
    ensureUnitPriceMasterSeeded();
    setProject(p);
    const loadedRows = workItemsStore.getByProjectId(projectId).map(toEditable);
    // 保存済みが無ければ空欄5行を表示（仕様12）。空行は一時IDで持ち、保存時に採番する。
    const initial =
      loadedRows.length > 0
        ? loadedRows
        : Array.from({ length: INITIAL_EMPTY_ROWS }, (_, i) => emptyEditableRow(`tmp-${Date.now()}-${i}`));
    setRows(initial);
    setSelectedId(initial[0]?.workItemId ?? null);
    setMasters(unitPriceMasterStore.getActive());
    setDamageOptions(
      damageRecordsStore.getByProjectId(projectId).map((d) => ({
        id: d.damageId,
        caption: `${d.damageId} ${d.location || "（箇所未入力）"}`,
      })),
    );
    setLegacyEstimates(getSavedEstimates());
    setLoaded(true);
  }, [projectId]);

  const WORK_ITEMS_DRAFT_KEY = draftKey("work-items", projectId);
  const draftData = useMemo<WorkItemsDraftData>(() => ({ rows, deletedIds: [] }), [rows]);
  const { saveStatus, savedAt, clearDraft, restoredDraft } = useAutoDraft<WorkItemsDraftData>(
    WORK_ITEMS_DRAFT_KEY, "work-items", projectId, draftData, { enabled: loaded, debounceMs: 800 },
  );

  const showRestoreBanner = !!restoredDraft?.data && !restoreDismissed;

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (saveStatus === "dirty") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveStatus]);

  function handleRestoreDraft() {
    if (!restoredDraft?.data) return;
    const restored = (restoredDraft.data.rows ?? []).map(normalizeEditableRow);
    setRows(restored);
    setSelectedId(restored[0]?.workItemId ?? null);
    setRestoreDismissed(true);
  }
  function handleDiscardDraft() {
    clearDraft();
    setRestoreDismissed(true);
  }

  function issueRowId() {
    return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function handleImportEstimate(estimateId: string) {
    const est = legacyEstimates.find((e) => e.id === estimateId);
    if (!est) return;
    const migrated = migrateLegacyEstimateToWorkItems(est, projectId).map(toEditable);
    // 既存の空行を除いてから取り込み行を足す
    setRows((prev) => [...prev.filter((r) => !isEmptyRow(r)), ...migrated]);
    if (migrated[0]) setSelectedId(migrated[0].workItemId);
    setShowImport(false);
    setSaveMsg({ ok: true, text: `見積「${est.projectName || est.estimateNo}」から${migrated.length}行を取り込みました。` });
    setTimeout(() => setSaveMsg(null), 8000);
  }

  // ── 本保存（空行を除外し、存在しなくなった行は削除・仕様14） ──
  function saveAll(): boolean {
    const now = new Date().toISOString();
    const nonEmpty = rows.filter((r) => !isEmptyRow(r));
    const existingIds = new Set(workItemsStore.getByProjectId(projectId).map((w) => w.workItemId));

    let allOk = true;
    const savedIds = new Set<string>();
    for (const row of nonEmpty) {
      // 一時ID（tmp-）または未保存IDには案件スコープの W-xxx を採番する
      const finalId = existingIds.has(row.workItemId) ? row.workItemId : issueWorkItemId(projectId);
      const item = toWorkItem({ ...row, workItemId: finalId }, projectId, now);
      if (!workItemsStore.upsert(item)) allOk = false;
      savedIds.add(finalId);
    }
    // 画面から消えた（空にされた/削除された）既存項目を削除
    for (const id of existingIds) {
      if (!savedIds.has(id)) workItemsStore.remove(id);
    }
    if (allOk) {
      const reloaded = workItemsStore.getByProjectId(projectId).map(toEditable);
      setRows(reloaded);
      setSelectedId((cur) => (reloaded.some((r) => r.workItemId === cur) ? cur : reloaded[0]?.workItemId ?? null));
      clearDraft();
      if (nonEmpty.length > 0) advanceProjectStatus(projectId, "estimating");
    }
    return allOk;
  }

  function handleSave(): boolean {
    setSaving(true);
    const ok = saveAll();
    setSaving(false);
    if (ok) setSaveMsg({ ok: true, text: "見積・原価を保存しました。" });
    else setSaveMsg({ ok: false, text: "一部保存に失敗しました。入力内容は下書きとして残っています。" });
    setTimeout(() => setSaveMsg(null), 6000);
    return ok;
  }

  function handleSaveAndReviewEstimate() {
    const hasContent = rows.some((r) => !isEmptyRow(r) && (r.workName.trim() !== "" || parseNumericInput(r.sellingUnitPrice) > 0));
    if (!hasContent) {
      alert("工事項目を1件以上入力してから保存してください。");
      return;
    }
    if (handleSave()) router.push(`/projects/${encodeURIComponent(projectId)}/estimate`);
  }

  const totals = useMemo(() => computeEditorTotals(rows), [rows]);

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
    <div className="min-h-screen bg-[#fdf8f2] pb-40">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg lg:max-w-6xl">
        <header className="mb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <Link href={`/projects/${encodeURIComponent(projectId)}`} className="mb-2 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">← 案件詳細へ戻る</Link>
              <h1 className="text-xl font-bold text-stone-800">見積・原価入力</h1>
              <p className="mt-1 text-sm text-stone-500">工事項目と数量を入力すると、見積と内部原価を同時に計算します。</p>
            </div>
            <Link href="/settings/unit-master" className="mt-1 shrink-0 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-600 active:opacity-80">単価マスタ</Link>
          </div>
        </header>

        <ProjectHeader project={project} />
        <ProjectTabs projectId={projectId} active="workItems" />

        {showRestoreBanner && restoredDraft && (
          <div className="mb-3 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
            <p className="text-xs font-bold text-amber-800">保存されていない下書きがあります。</p>
            <p className="mt-0.5 text-xs text-amber-700">最終更新：{new Date(restoredDraft.updatedAt).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" })}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={handleRestoreDraft} className="min-h-[44px] flex-1 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white active:opacity-80">下書きを復元する</button>
              <button type="button" onClick={handleDiscardDraft} className="min-h-[44px] flex-1 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-700 active:opacity-80">破棄する</button>
            </div>
          </div>
        )}

        <SaveStatusBar status={saveStatus} savedAt={savedAt} />

        {legacyEstimates.length > 0 && (
          <div className="mb-3">
            <button type="button" onClick={() => setShowImport((v) => !v)} className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-bold text-stone-600 active:opacity-80">
              <span>📥 保存済みの見積から取り込む</span>
              <span className="text-stone-300">{showImport ? "▲" : "▼"}</span>
            </button>
            {showImport && (
              <div className="mt-2 space-y-2 rounded-xl bg-white p-3 ring-1 ring-stone-100">
                <p className="text-xs text-stone-400">見積の明細行を工事項目としてコピーします（元の見積は変更されません）。</p>
                {legacyEstimates.map((est) => (
                  <button key={est.id} type="button" onClick={() => handleImportEstimate(est.id)} className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-left active:opacity-80">
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-stone-700">{est.projectName || "（案件名なし）"}</span>
                      <span className="block text-xs text-stone-400">{est.estimateNo}・{est.estimateItems.length}行</span>
                    </span>
                    <span className="shrink-0 text-xs font-bold text-[#8B4A3C]">取り込む</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <EstimateEditor
          rows={rows}
          onRowsChange={setRows}
          selectedId={selectedId}
          onSelectedIdChange={setSelectedId}
          masters={masters}
          issueRowId={issueRowId}
          damageOptions={damageOptions}
          showDetail={showDetail}
          onToggleDetail={() => setShowDetail((v) => !v)}
        />

        {saveMsg && (
          <div className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold ring-1 ${saveMsg.ok ? "bg-green-50 text-green-700 ring-green-200" : "bg-red-50 text-red-600 ring-red-200"}`}>
            {saveMsg.text}
          </div>
        )}
      </div>

      {/* 下部：案件全体集計（常時表示） */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-md px-4 py-3 sm:max-w-lg lg:max-w-6xl">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <TotalsCards selling={totals.selling} cost={totals.cost} grossProfit={totals.grossProfit} grossProfitRate={totals.grossProfitRate} levelClass={LEVEL_TEXT[totals.level]} />
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => handleSave()} disabled={saving} className="min-h-[48px] rounded-xl border border-[#1e3a5f] bg-white px-4 py-2.5 text-sm font-bold text-[#1e3a5f] active:opacity-80 disabled:opacity-50">保存</button>
              <button type="button" onClick={handleSaveAndReviewEstimate} disabled={saving} className="min-h-[48px] flex-1 whitespace-nowrap rounded-xl bg-[#1e3a5f] px-5 py-2.5 text-sm font-bold text-white shadow-sm active:opacity-80 disabled:opacity-50 lg:flex-none">保存して見積書を確認</button>
            </div>
          </div>
          <div className="mt-2 hidden lg:block">
            <TaxTotalsBox breakdown={totals.breakdown} />
          </div>
        </div>
      </div>
    </div>
  );
}
