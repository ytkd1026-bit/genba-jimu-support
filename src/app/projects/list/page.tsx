"use client";

// 案件一覧（一案件一元管理の入口）
// 新形式（genba_projects_v1）の案件を一覧表示し、新規案件の発行を行う。
// 旧形式の保存済み案件（/projects/saved）はそのまま残している。
//
// 2026-07 追加:
// - 表示用案件番号（例: REVO-26-0001）の表示とコピー
// - 案件ID・顧客名・現場名・元請名での検索
// - 流入経路・登録日の表示
// - 案件番号が無い既存案件への一括番号付与（プレビュー→バックアップ→実行）

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  projectsStore,
  registerNewProject,
  projectDisplayId,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  INFLOW_ROUTE_LABELS,
  type Project,
} from "@/app/utils/projects";
import {
  getUnmigratedLegacyProjects,
  migrateAllLegacyProjects,
} from "@/app/utils/projectMigration";
import { getProjectCode } from "@/app/utils/companySettings";
import {
  validateProjectCode,
  maxIssuedSequence,
  formatProjectNumber,
  raiseCounter,
} from "@/app/utils/projectNumbers";
import { getOrCreateOrganizationId } from "@/app/utils/organizations";

// ─── 既存案件への一括番号付与（プレビュー行） ─────────────────────
type AssignPreviewRow = {
  projectId: string;      // 内部ID（変更しない）
  currentDisplay: string; // いま表示している番号（旧 REV-... 等）
  projectName: string;
  createdAt: string;
  year: number;
  seq: number;
  newNumber: string;      // 付与する新番号（例: REVO-26-0003）
};

/** 番号未付与の案件を登録日順に並べ、年度別に連番を割り当てるプレビューを作る */
function buildAssignPreview(projects: Project[], code: string): AssignPreviewRow[] {
  const targets = projects
    .filter((p) => !p.projectNumber)
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt)); // 古い案件から
  const used = new Set(projects.map((p) => p.projectNumber).filter(Boolean) as string[]);
  const nextSeqByYear = new Map<number, number>();
  const rows: AssignPreviewRow[] = [];
  for (const p of targets) {
    const year = new Date(p.createdAt).getFullYear();
    let seq = nextSeqByYear.get(year) ?? maxIssuedSequence(projects, code, year) + 1;
    while (used.has(formatProjectNumber(code, year, seq))) seq += 1; // 二重採番防止
    const newNumber = formatProjectNumber(code, year, seq);
    used.add(newNumber);
    nextSeqByYear.set(year, seq + 1);
    rows.push({
      projectId: p.projectId,
      currentDisplay: projectDisplayId(p),
      projectName: p.projectName,
      createdAt: p.createdAt,
      year,
      seq,
      newNumber,
    });
  }
  return rows;
}

/** 実行前バックアップ: 現在の案件データをJSONファイルとしてダウンロードする */
function downloadProjectsBackup(projects: Project[]): void {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const blob = new Blob([JSON.stringify(projects, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `genba_projects_backup_${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ProjectListPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [legacyCount, setLegacyCount] = useState(0);
  const [migrateMsg, setMigrateMsg] = useState("");
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [assignPreview, setAssignPreview] = useState<AssignPreviewRow[] | null>(null);
  const [assignMsg, setAssignMsg] = useState("");
  const [creating, setCreating] = useState(false);

  const codeReady = validateProjectCode(projectCode) === null;
  const unnumberedCount = useMemo(
    () => projects.filter((p) => !p.projectNumber).length,
    [projects],
  );

  function reload() {
    const list = projectsStore
      .getAll()
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    setProjects(list);
    setLegacyCount(getUnmigratedLegacyProjects().length);
  }

  useEffect(() => {
    reload();
    setProjectCode(getProjectCode());
  }, []);

  // ─── 検索（案件ID・顧客名・現場名・元請名） ───────────────────
  const visibleProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      [
        projectDisplayId(p),
        p.projectId,
        p.customerName,
        p.projectName,
        p.propertyName,
        p.clientName,          // 元請名（案件登録の元請け・顧客名）
        p.inflowSourceName ?? "", // 元請名（流入経路「元請け」で入力した取引先名）
      ]
        .join("\n")
        .toLowerCase()
        .includes(q),
    );
  }, [projects, query]);

  // 旧形式の保存済み案件を新しい案件管理へ引き継ぐ（旧データは残す・重複移行しない）
  function handleMigrate() {
    const result = migrateAllLegacyProjects();
    reload();
    setMigrateMsg(
      result.migratedCount > 0
        ? `${result.migratedCount}件を新しい案件管理へ引き継ぎました。旧データはそのまま残しています。`
        : "引き継ぐ旧案件はありませんでした。",
    );
    setTimeout(() => setMigrateMsg(""), 8000);
  }

  // 新規案件を発行して案件詳細へ移動する（案件化＝表示用案件番号を自動発番）
  async function handleCreate() {
    if (creating) return; // 連打による二重発番防止
    setCreating(true);
    try {
      const { project, error } = await registerNewProject({});
      if (!project) {
        setErrorMsg(error ?? "案件を作成できませんでした。");
        return;
      }
      router.push(`/projects/${encodeURIComponent(project.projectId)}`);
    } finally {
      setCreating(false);
    }
  }

  // ─── 案件番号のコピー ──────────────────────────────────────────
  async function handleCopy(e: React.MouseEvent, text: string) {
    e.preventDefault(); // カード全体のリンク遷移を止める
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(text);
      setTimeout(() => setCopiedId(""), 2000);
    } catch {
      // クリップボード不可の環境では選択コピーしてもらう
      alert(`コピーできませんでした。案件ID: ${text}`);
    }
  }

  // ─── 既存案件への一括番号付与 ──────────────────────────────────
  function handleShowAssignPreview() {
    setAssignPreview(buildAssignPreview(projectsStore.getAll(), projectCode));
  }

  function handleApplyAssign() {
    if (!assignPreview || assignPreview.length === 0) return;
    // 1) 実行前バックアップ（必ず先にダウンロード）
    const before = projectsStore.getAll();
    downloadProjectsBackup(before);
    // 2) プレビューどおりに付与（発番済みはスキップ＝二重採番しない）
    const organizationId = getOrCreateOrganizationId();
    let applied = 0;
    for (const row of assignPreview) {
      const p = projectsStore.getById(row.projectId);
      if (!p || p.projectNumber) continue;
      const ok = projectsStore.upsert({
        ...p,
        organizationId: p.organizationId ?? organizationId,
        projectNumber: row.newNumber,
        projectCode,
        sequenceYear: row.year,
        sequenceNumber: row.seq,
        updatedAt: new Date().toISOString(),
      });
      if (ok) applied += 1;
    }
    // 3) カウンターを付与済み最大値まで引き上げる（以後の新規発番が続き番号になる）
    const byYear = new Map<number, number>();
    for (const row of assignPreview) {
      byYear.set(row.year, Math.max(byYear.get(row.year) ?? 0, row.seq));
    }
    for (const [year, seq] of byYear) raiseCounter(organizationId, projectCode, year, seq);

    setAssignPreview(null);
    setAssignMsg(`${applied}件へ案件番号を付与しました。バックアップをダウンロード済みです。`);
    setTimeout(() => setAssignMsg(""), 10000);
    reload();
  }

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        <header className="mb-4">
          <Link href="/projects/register" className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← 案件検索・登録へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">案件一覧</h1>
          <p className="mt-1 text-sm text-stone-500">
            案件ごとに調査・写真・見積・請求・報告をまとめて管理します。
          </p>
        </header>

        {/* 旧案件の移行案内（未移行の旧 savedProjects がある場合のみ） */}
        {legacyCount > 0 && (
          <div className="mb-3 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
            <p className="text-sm font-bold text-amber-800">
              旧形式の保存済み案件が {legacyCount} 件あります。
            </p>
            <p className="mt-0.5 text-xs text-amber-700">
              新しい案件管理へ引き継げます。旧データはそのまま残ります。
            </p>
            <button
              type="button"
              onClick={handleMigrate}
              className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-xl bg-amber-600 px-3 py-2 text-sm font-bold text-white active:opacity-80"
            >
              既存案件を引き継ぐ（{legacyCount}件）
            </button>
          </div>
        )}
        {migrateMsg && (
          <div className="mb-3 rounded-xl bg-green-50 px-3 py-2 text-xs font-bold text-green-700 ring-1 ring-green-200">
            {migrateMsg}
          </div>
        )}

        {/* 案件番号が無い既存案件への一括付与（コード設定済みのときだけ表示） */}
        {codeReady && unnumberedCount > 0 && (
          <div className="mb-3 rounded-2xl bg-sky-50 p-3 ring-1 ring-sky-200">
            <p className="text-sm font-bold text-sky-800">
              案件番号（{projectCode}-〇〇-0000形式）が未付与の案件が {unnumberedCount} 件あります。
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-sky-700">
              登録日の古い順に、年度別の連番を付与できます。内部の紐付け（見積・写真など）は変わりません。
              実行前に現在のデータのバックアップを自動ダウンロードします。
            </p>
            {!assignPreview ? (
              <button
                type="button"
                onClick={handleShowAssignPreview}
                className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-xl bg-sky-600 px-3 py-2 text-sm font-bold text-white active:opacity-80"
              >
                付与内容をプレビューする（まだ変更しません）
              </button>
            ) : (
              <div className="mt-2 space-y-2">
                <div className="max-h-56 overflow-y-auto rounded-xl bg-white p-2 ring-1 ring-sky-100">
                  {assignPreview.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-stone-500">対象がありません。</p>
                  ) : (
                    assignPreview.map((row) => (
                      <div key={row.projectId} className="border-b border-stone-50 px-2 py-1.5 last:border-0">
                        <p className="text-xs font-bold text-stone-700">
                          {row.projectName || "（案件名未入力）"}
                        </p>
                        <p className="font-mono text-[11px] text-stone-500">
                          {row.currentDisplay} → <span className="font-bold text-sky-700">{row.newNumber}</span>
                        </p>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleApplyAssign}
                    className="flex-1 rounded-xl bg-sky-600 py-2.5 text-sm font-bold text-white active:opacity-80"
                  >
                    バックアップ後に付与を実行
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignPreview(null)}
                    className="flex-1 rounded-xl border border-sky-300 bg-white py-2.5 text-sm font-bold text-sky-700 active:opacity-80"
                  >
                    やめる
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {assignMsg && (
          <div className="mb-3 rounded-xl bg-green-50 px-3 py-2 text-xs font-bold text-green-700 ring-1 ring-green-200">
            {assignMsg}
          </div>
        )}

        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="mb-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#8B4A3C] px-4 py-3 text-sm font-bold text-white shadow-sm active:opacity-80 disabled:opacity-50"
        >
          ＋ 新しい案件を作成する（案件番号を自動発行）
        </button>

        {errorMsg && (
          <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600 ring-1 ring-red-200">
            {errorMsg}
            {!codeReady && (
              <Link href="/settings/company" className="mt-1 block underline underline-offset-2">
                事業者設定で案件ID用コードを登録する →
              </Link>
            )}
          </div>
        )}

        {/* ── 検索 ── */}
        <div className="mb-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="案件ID・顧客名・現場名・元請名で検索"
            className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-2 focus:ring-[#8B4A3C]/20"
          />
          {query && (
            <p className="mt-1 text-xs text-stone-400">{visibleProjects.length}件が一致</p>
          )}
        </div>

        <div className="space-y-3">
          {visibleProjects.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-stone-200 px-4 py-10 text-center">
              <p className="text-sm text-stone-500">
                {projects.length === 0 ? "まだ案件がありません。" : "検索に一致する案件がありません。"}
              </p>
              {projects.length === 0 && (
                <p className="mt-1.5 text-sm text-stone-500">
                  「新しい案件を作成する」から始めてください。
                </p>
              )}
            </div>
          ) : (
            visibleProjects.map((p) => {
              const display = projectDisplayId(p);
              return (
                <Link
                  key={p.projectId}
                  href={`/projects/${encodeURIComponent(p.projectId)}`}
                  className="block overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-100 active:opacity-75"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-stone-100 bg-stone-50 px-4 py-2.5">
                    <span className="rounded-full bg-[#fdf0ec] px-2 py-0.5 text-xs font-bold text-[#8B4A3C]">
                      {PROJECT_STATUS_LABELS[p.status]}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono text-xs text-stone-500">{display}</span>
                      <button
                        type="button"
                        onClick={(e) => handleCopy(e, display)}
                        aria-label="案件IDをコピー"
                        className="rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-stone-500 active:opacity-70"
                      >
                        {copiedId === display ? "✓ コピー済" : "コピー"}
                      </button>
                    </span>
                  </div>
                  <div className="space-y-0.5 px-4 py-3">
                    <p className="text-sm font-bold text-stone-800 leading-tight">
                      {p.projectName || "（案件名未入力）"}
                    </p>
                    {p.propertyName && (
                      <p className="text-xs text-stone-500">
                        {p.propertyName}
                        {p.roomNumber ? ` ${p.roomNumber}` : ""}
                      </p>
                    )}
                    {p.siteAddress && <p className="text-xs text-stone-400">{p.siteAddress}</p>}
                    <p className="text-xs text-stone-400">
                      {PROJECT_TYPE_LABELS[p.projectType]}
                      {p.clientName ? `・元請: ${p.clientName}` : ""}
                      {p.customerName ? `・顧客: ${p.customerName}` : ""}
                      {p.inflowRoute ? `・経路: ${INFLOW_ROUTE_LABELS[p.inflowRoute]}` : ""}
                    </p>
                    <p className="text-right text-[11px] text-stone-300">
                      登録 {new Date(p.createdAt).toLocaleDateString("ja-JP")}
                      ・更新 {new Date(p.updatedAt).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  </div>
                </Link>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
}
