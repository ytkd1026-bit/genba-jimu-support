"use client";

// 02 現地調査（被害・問題記録）
// 1被害1カードで追加・複製・削除できる。
// 「確認した事実」と「推定原因」は必ず別項目として入力する。
// 被害IDは案件内連番（D-001〜）。削除しても番号は再利用しない。

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { projectsStore, projectDisplayId, type Project } from "@/app/utils/projects";
import {
  damageRecordsStore,
  issueDamageId,
  createEmptyDamageRecord,
  type DamageRecord,
} from "@/app/utils/damageRecords";
import { getPhotosSorted, PHOTO_PHASE_LABELS } from "@/app/utils/photoRecords";
import { workItemsStore } from "@/app/utils/workItems";
import { insuranceInfoStore, ACCIDENT_TYPE_LABELS } from "@/app/utils/insuranceInfo";
import { getCompanyInfoForPdf, getCompanySettings } from "@/app/utils/companySettings";
import { surveyReportPdfFileName } from "@/app/utils/pdfFileName";
import { renderAndDownloadPdf, todaySlash, todayDash } from "@/app/utils/pdfDownload";
import { draftKey } from "@/app/utils/draftStorage";
import { useAutoDraft } from "@/hooks/useAutoDraft";
import { SaveStatusBar } from "@/components/SaveStatusBar";
import { ProjectTabs, ProjectHeader } from "@/components/ProjectTabs";
import { StructuredTextInput } from "@/components/StructuredTextInput";
import { fldInput, lbl } from "@/components/formStyles";

// 被害分類のプリセット（自由入力も可能）
const DAMAGE_CATEGORY_PRESETS = [
  "水濡れ", "カビ", "剥がれ", "浮き", "変色", "破損", "腐食", "その他",
];

type SurveyDraftData = {
  records: DamageRecord[];
  deletedIds: string[];
  /** 現地調査報告書PDFの総括文（下書きにのみ保持） */
  summary?: string;
};

// ─── 関連ID選択チップ ─────────────────────────────────────────
function IdToggleChips({
  label,
  emptyHint,
  options,
  selected,
  onToggle,
}: {
  label: string;
  emptyHint: string;
  options: Array<{ id: string; caption: string }>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      {options.length === 0 ? (
        <p className="rounded-lg bg-stone-50 px-3 py-2.5 text-xs text-stone-400">{emptyHint}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {options.map((opt) => {
            const active = selected.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onToggle(opt.id)}
                className={`min-h-[44px] rounded-xl px-3 py-2 text-xs font-bold active:opacity-80 ${
                  active
                    ? "bg-[#8B4A3C] text-white"
                    : "border border-stone-200 bg-white text-stone-500"
                }`}
              >
                {opt.caption}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SurveyPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(params.projectId);

  const [notFound, setNotFound] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [records, setRecords] = useState<DamageRecord[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [summary, setSummary] = useState("");
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // 関連付け候補（写真・工事項目）
  const [photoOptions, setPhotoOptions] = useState<Array<{ id: string; caption: string }>>([]);
  const [workItemOptions, setWorkItemOptions] = useState<Array<{ id: string; caption: string }>>([]);

  // ── 読み込み ──────────────────────────────────────────────
  useEffect(() => {
    const p = projectsStore.getById(projectId);
    if (!p) {
      setNotFound(true);
      return;
    }
    setProject(p);
    setRecords(damageRecordsStore.getByProjectId(projectId));
    setPhotoOptions(
      getPhotosSorted(projectId).map((ph) => ({
        id: ph.photoId,
        caption: `${ph.photoId} ${PHOTO_PHASE_LABELS[ph.phase]}${ph.location ? `・${ph.location}` : ""}`,
      })),
    );
    setWorkItemOptions(
      workItemsStore.getByProjectId(projectId).map((w) => ({
        id: w.workItemId,
        caption: `${w.workItemId} ${w.workName || "（工事名未入力）"}`,
      })),
    );
    setLoaded(true);
  }, [projectId]);

  // ── 自動下書き保存 ────────────────────────────────────────
  const SURVEY_DRAFT_KEY = draftKey("survey", projectId);
  const draftData = useMemo<SurveyDraftData>(
    () => ({ records, deletedIds, summary }),
    [records, deletedIds, summary],
  );
  const { saveStatus, savedAt, clearDraft, restoredDraft } = useAutoDraft<SurveyDraftData>(
    SURVEY_DRAFT_KEY, "survey", projectId, draftData,
    { enabled: loaded, debounceMs: 800 },
  );

  useEffect(() => {
    if (restoredDraft?.data) setShowRestoreBanner(true);
  }, [restoredDraft]);

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
    setRecords(restoredDraft.data.records);
    setDeletedIds(restoredDraft.data.deletedIds);
    setSummary(restoredDraft.data.summary ?? "");
    setShowRestoreBanner(false);
  }

  function handleDiscardDraft() {
    clearDraft();
    setShowRestoreBanner(false);
  }

  // ── 被害記録の操作 ────────────────────────────────────────
  function updateRecord(damageId: string, patch: Partial<DamageRecord>) {
    setRecords((prev) =>
      prev.map((r) => (r.damageId === damageId ? { ...r, ...patch } : r)),
    );
  }

  function addRecord() {
    const damageId = issueDamageId(projectId);
    setRecords((prev) => [...prev, createEmptyDamageRecord(projectId, damageId)]);
  }

  function duplicateRecord(damageId: string) {
    const src = records.find((r) => r.damageId === damageId);
    if (!src) return;
    const newId = issueDamageId(projectId);
    const now = new Date().toISOString();
    const idx = records.findIndex((r) => r.damageId === damageId);
    const dup: DamageRecord = { ...src, damageId: newId, createdAt: now, updatedAt: now };
    setRecords((prev) => [...prev.slice(0, idx + 1), dup, ...prev.slice(idx + 1)]);
  }

  function removeRecord(damageId: string) {
    if (!confirm(`${damageId} を削除しますか？\n（削除した被害IDは再利用されません）`)) return;
    setRecords((prev) => prev.filter((r) => r.damageId !== damageId));
    setDeletedIds((prev) => (prev.includes(damageId) ? prev : [...prev, damageId]));
  }

  function toggleRelatedId(
    damageId: string,
    field: "relatedPhotoIds" | "relatedWorkItemIds",
    id: string,
  ) {
    setRecords((prev) =>
      prev.map((r) => {
        if (r.damageId !== damageId) return r;
        const list = r[field];
        return {
          ...r,
          [field]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
        };
      }),
    );
  }

  // 発行済みIDのうち採番だけして未入力のままの空カードは保存対象に含める
  // （IDの一貫性を保つため、保存時に除外はしない）
  function saveAll(): boolean {
    const now = new Date().toISOString();
    let allOk = true;
    for (const r of records) {
      if (!damageRecordsStore.upsert({ ...r, updatedAt: now })) allOk = false;
    }
    for (const id of deletedIds) {
      damageRecordsStore.remove(id);
    }
    if (allOk) {
      setDeletedIds([]);
      setRecords(damageRecordsStore.getByProjectId(projectId));
      clearDraft();
    }
    return allOk;
  }

  function handleSave() {
    if (saveAll()) {
      setSaveMsg({ ok: true, text: "現地調査を保存しました。" });
    } else {
      setSaveMsg({ ok: false, text: "一部保存に失敗しました。入力内容は下書きとして残っています。" });
    }
    setTimeout(() => setSaveMsg(null), 6000);
  }

  // ── 現地調査報告書PDF（保存 → 生成の順） ───────────────────
  async function handleSurveyReportPdf() {
    if (!project || pdfLoading) return;
    if (records.length === 0) {
      alert("被害記録を1件以上入力してからPDFを発行してください。");
      return;
    }
    // PDF発行前の本保存（失敗したら発行しない）
    if (!saveAll()) {
      alert("保存に失敗しました。PDFは発行していません。");
      return;
    }
    setPdfLoading(true);
    try {
      const { makeSurveyReportPDF } = await import("@/components/pdf/SurveyReportPDF");
      const insurance =
        project.projectType === "insurance" ? insuranceInfoStore.getById(projectId) : null;
      const doc = makeSurveyReportPDF({
        documentTitle: "現地調査報告書",
        documentNumber: `RPT-${projectDisplayId(project)}`,
        createdDate: todaySlash(),
        submitTo: project.submitTo || project.clientName || "",
        projectName: project.projectName,
        siteAddress: project.siteAddress,
        companyInfo: getCompanyInfoForPdf(),
        projectId: projectDisplayId(project),
        accident: insurance
          ? {
              accidentTypeLabel: ACCIDENT_TYPE_LABELS[insurance.accidentType],
              suspectedCause: insurance.suspectedCause,
              accidentDate: insurance.accidentDate.replace(/-/g, "/"),
              surveyDate: insurance.surveyDate.replace(/-/g, "/"),
            }
          : null,
        inspectorName: getCompanySettings().representative,
        damages: records.map((r) => ({
          damageId: r.damageId,
          location: r.location,
          confirmedFact: r.confirmedFact,
          suspectedCause: r.suspectedCause,
          requiredRestoration: r.requiredRestoration,
          relatedPhotoIds: r.relatedPhotoIds,
        })),
        summaryText: summary,
      });
      await renderAndDownloadPdf(
        doc,
        surveyReportPdfFileName({
          clientName: project.clientName || project.submitTo,
          projectName: project.projectName,
          date: todayDash(),
        }),
      );
    } catch (err) {
      console.error("現地調査報告書PDF生成エラー:", err);
      alert("PDFの生成に失敗しました。もう一度お試しください。");
    } finally {
      setPdfLoading(false);
    }
  }

  // ── 案件が見つからない場合 ────────────────────────────────
  if (notFound) {
    return (
      <div className="min-h-screen bg-[#fdf8f2]">
        <div className="mx-auto max-w-md px-4 py-10 text-center sm:max-w-lg">
          <p className="text-sm font-bold text-stone-700">案件が見つかりません。</p>
          <p className="mt-1 font-mono text-xs text-stone-400">{projectId}</p>
          <Link
            href="/projects/list"
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#8B4A3C] px-5 py-2.5 text-sm font-bold text-white active:opacity-80"
          >
            案件一覧へ戻る
          </Link>
        </div>
      </div>
    );
  }

  if (!project) {
    return <div className="min-h-screen bg-[#fdf8f2]" />;
  }

  return (
    <div className="min-h-screen bg-[#fdf8f2] pb-24">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        <header className="mb-3">
          <Link href={`/projects/${encodeURIComponent(projectId)}`} className="mb-2 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← 案件詳細へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">現地調査</h1>
          <p className="mt-1 text-sm text-stone-500">
            被害・問題を1件ずつ記録します。「確認した事実」と「推定原因」は分けて書いてください。
          </p>
        </header>

        <ProjectHeader project={project} />
        <ProjectTabs projectId={projectId} active="survey" />

        {/* 下書き復元バナー */}
        {showRestoreBanner && restoredDraft && (
          <div className="mb-3 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
            <p className="text-xs font-bold text-amber-800">保存されていない下書きがあります。</p>
            <p className="mt-0.5 text-xs text-amber-700">
              最終更新：{new Date(restoredDraft.updatedAt).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" })}
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={handleRestoreDraft}
                className="min-h-[44px] flex-1 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white active:opacity-80">
                下書きを復元する
              </button>
              <button type="button" onClick={handleDiscardDraft}
                className="min-h-[44px] flex-1 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-700 active:opacity-80">
                破棄する
              </button>
            </div>
          </div>
        )}

        <SaveStatusBar status={saveStatus} savedAt={savedAt} />

        {/* ── 被害カード一覧 ─────────────────────────────── */}
        <div className="space-y-3">
          {records.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-stone-200 px-4 py-10 text-center">
              <p className="text-sm text-stone-500">まだ被害記録がありません。</p>
              <p className="mt-1.5 text-sm text-stone-500">「被害を追加する」から記録を始めてください。</p>
            </div>
          )}

          {records.map((r, index) => (
            <div key={r.damageId} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-100">
              {/* カードヘッダー */}
              <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[#8B4A3C] px-2 py-0.5 font-mono text-xs font-bold text-white">
                    {r.damageId}
                  </span>
                  <span className="text-xs font-bold text-stone-500">被害 {index + 1}</span>
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => duplicateRecord(r.damageId)}
                    className="min-h-[44px] px-1 text-xs text-stone-400 active:text-stone-600">
                    複製
                  </button>
                  <button type="button" onClick={() => removeRecord(r.damageId)}
                    className="min-h-[44px] px-1 text-xs text-stone-400 active:text-red-500">
                    削除
                  </button>
                </div>
              </div>

              <div className="space-y-3 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={lbl}>被害箇所</label>
                    <input type="text" value={r.location}
                      onChange={(e) => updateRecord(r.damageId, { location: e.target.value })}
                      placeholder="洗面所 天井" className={fldInput} />
                  </div>
                  <div>
                    <label className={lbl}>被害分類</label>
                    <input type="text" value={r.damageCategory} list={`damage-cat-${r.damageId}`}
                      onChange={(e) => updateRecord(r.damageId, { damageCategory: e.target.value })}
                      placeholder="水濡れ" className={fldInput} />
                    <datalist id={`damage-cat-${r.damageId}`}>
                      {DAMAGE_CATEGORY_PRESETS.map((c) => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                </div>

                <StructuredTextInput
                  label="目視確認した被害"
                  value={r.observedDamage}
                  onChange={(v) => updateRecord(r.damageId, { observedDamage: v })}
                  placeholder="例：天井クロスに約50cmの水染みと剥がれ"
                  allowFutureVoiceInput
                />
                <StructuredTextInput
                  label="確認した事実"
                  value={r.confirmedFact}
                  onChange={(v) => updateRecord(r.damageId, { confirmedFact: v })}
                  placeholder="例：点検口から確認し、給水管接続部に水滴の付着あり"
                  allowFutureVoiceInput
                  required
                />
                <StructuredTextInput
                  label="推定原因"
                  value={r.suspectedCause}
                  onChange={(v) => updateRecord(r.damageId, { suspectedCause: v })}
                  placeholder="例：上階洗面所の給水管接続部からの漏水と推定"
                  allowFutureVoiceInput
                  required
                />
                <StructuredTextInput
                  label="必要な復旧工事"
                  value={r.requiredRestoration}
                  onChange={(v) => updateRecord(r.damageId, { requiredRestoration: v })}
                  placeholder="例：天井クロス貼替・下地ボード交換"
                  allowFutureVoiceInput
                />
                <StructuredTextInput
                  label="注意事項"
                  value={r.caution}
                  onChange={(v) => updateRecord(r.damageId, { caution: v })}
                  placeholder="例：乾燥期間を1週間確保してから施工"
                  allowFutureVoiceInput
                />

                <IdToggleChips
                  label="関連写真"
                  emptyHint="この案件の写真はまだありません（写真台帳は今後のアップデートで追加されます）。"
                  options={photoOptions}
                  selected={r.relatedPhotoIds}
                  onToggle={(id) => toggleRelatedId(r.damageId, "relatedPhotoIds", id)}
                />
                <IdToggleChips
                  label="関連工事項目"
                  emptyHint="この案件の工事項目はまだありません（工事項目・原価画面は今後のアップデートで追加されます）。"
                  options={workItemOptions}
                  selected={r.relatedWorkItemIds}
                  onToggle={(id) => toggleRelatedId(r.damageId, "relatedWorkItemIds", id)}
                />
              </div>
            </div>
          ))}
        </div>

        {/* ── 追加・保存 ─────────────────────────────────── */}
        <button
          type="button"
          onClick={addRecord}
          className="mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#8B4A3C]/40 bg-white px-4 py-3 text-sm font-bold text-[#8B4A3C] active:opacity-80"
        >
          ＋ 被害を追加する
        </button>

        {saveMsg && (
          <div className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold ring-1 ${
            saveMsg.ok
              ? "bg-green-50 text-green-700 ring-green-200"
              : "bg-red-50 text-red-600 ring-red-200"
          }`}>
            {saveMsg.text}
          </div>
        )}
        <button
          type="button"
          onClick={handleSave}
          className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#8B4A3C] px-4 py-3 text-sm font-bold text-white shadow-sm active:opacity-80"
        >
          現地調査を保存する
        </button>

        {/* ── 現地調査報告書PDF ───────────────────────────── */}
        {records.length > 0 && (
          <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
            <h2 className="mb-2 text-sm font-bold text-stone-700">現地調査報告書PDF</h2>
            <StructuredTextInput
              label="総括（報告書の最後に載せる文章）"
              value={summary}
              onChange={setSummary}
              placeholder="例：上階給水管からの漏水により天井・壁の復旧工事が必要と判断します。"
              allowFutureVoiceInput
              rows={3}
            />
            <button
              type="button"
              disabled={pdfLoading}
              onClick={() => void handleSurveyReportPdf()}
              className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-[#8B4A3C] bg-white px-4 py-3 text-sm font-bold text-[#8B4A3C] active:opacity-80 disabled:opacity-50"
            >
              {pdfLoading ? "PDF作成中..." : "📄 現地調査報告書PDFを作成する（保存してから発行）"}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
