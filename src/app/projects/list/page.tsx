"use client";

// 案件一覧（一案件一元管理の入口）
// 新形式（genba_projects_v1）の案件を一覧表示し、新規案件の発行を行う。
// 旧形式の保存済み案件（/projects/saved）はそのまま残している。

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  projectsStore,
  issueNewProjectId,
  createEmptyProject,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  type Project,
} from "@/app/utils/projects";
import {
  getUnmigratedLegacyProjects,
  migrateAllLegacyProjects,
} from "@/app/utils/projectMigration";

export default function ProjectListPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [legacyCount, setLegacyCount] = useState(0);
  const [migrateMsg, setMigrateMsg] = useState("");

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
  }, []);

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

  // 新規案件を発行して案件詳細へ移動する
  function handleCreate() {
    const projectId = issueNewProjectId();
    const project = createEmptyProject(projectId);
    const ok = projectsStore.upsert(project);
    if (!ok) {
      setErrorMsg("案件を作成できませんでした。ブラウザの保存容量を確認してください。");
      return;
    }
    router.push(`/projects/${encodeURIComponent(projectId)}`);
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

        <button
          type="button"
          onClick={handleCreate}
          className="mb-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#8B4A3C] px-4 py-3 text-sm font-bold text-white shadow-sm active:opacity-80"
        >
          ＋ 新しい案件を作成する（案件IDを発行）
        </button>

        {errorMsg && (
          <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600 ring-1 ring-red-200">
            {errorMsg}
          </div>
        )}

        <div className="space-y-3">
          {projects.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-stone-200 px-4 py-10 text-center">
              <p className="text-sm text-stone-500">まだ案件がありません。</p>
              <p className="mt-1.5 text-sm text-stone-500">
                「新しい案件を作成する」から始めてください。
              </p>
            </div>
          ) : (
            projects.map((p) => (
              <Link
                key={p.projectId}
                href={`/projects/${encodeURIComponent(p.projectId)}`}
                className="block overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-100 active:opacity-75"
              >
                <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-4 py-2.5">
                  <span className="rounded-full bg-[#fdf0ec] px-2 py-0.5 text-xs font-bold text-[#8B4A3C]">
                    {PROJECT_STATUS_LABELS[p.status]}
                  </span>
                  <span className="font-mono text-xs text-stone-400">{p.projectId}</span>
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
                  </p>
                  <p className="text-right text-[11px] text-stone-300">
                    更新 {new Date(p.updatedAt).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                </div>
              </Link>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
