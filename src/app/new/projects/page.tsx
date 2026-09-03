"use client";

// 新UI 案件（/new/projects）
// 「検索画面」ではなく既存案件DB（genba_projects_v1）への入口。
// 既存 projectsStore を読むだけ。作成・編集は既存ルートへ遷移させる。

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "../_components/PageHeader";
import { loadProjects, isActive, type Project } from "../_lib/data";
import {
  statusBadgeClass,
  FILTER_LABELS,
  type ProjectFilter,
} from "../_lib/theme";
import { PROJECT_STATUS_LABELS } from "@/app/utils/projects";

const FILTER_ORDER: ProjectFilter[] = [
  "all",
  "active",
  "estimating",
  "scheduled",
  "in_progress",
  "unbilled",
  "completed",
];

function matchFilter(p: Project, filter: ProjectFilter): boolean {
  switch (filter) {
    case "all":         return true;
    case "active":      return isActive(p);
    case "estimating":  return p.status === "estimating" || p.status === "submitted";
    case "scheduled":   return p.status === "approved" || p.status === "scheduled";
    case "in_progress": return p.status === "in_progress";
    case "unbilled":    return p.status === "completed";
    case "completed":   return p.status === "paid";
  }
}

function matchQuery(p: Project, q: string): boolean {
  if (!q) return true;
  const hay = [
    p.projectName,
    p.propertyName,
    p.roomNumber,
    p.clientName,
    p.customerName,
    p.siteAddress,
    p.projectId,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

function ProjectsInner() {
  const searchParams = useSearchParams();
  const initialFilter = (searchParams.get("filter") as ProjectFilter) || "all";
  // 作成画面「見積書」からの遷移: 案件タップで直接 見積・原価入力 を開く
  const fromEstimate = searchParams.get("from") === "estimate";

  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProjectFilter>(
    FILTER_ORDER.includes(initialFilter) ? initialFilter : "all",
  );

  useEffect(() => {
    setProjects(loadProjects());
    setReady(true);
  }, []);

  const summary = useMemo(() => {
    const active = projects.filter(isActive).length;
    const unbilled = projects.filter((p) => p.status === "completed").length;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const doneThisWeek = projects.filter((p) => {
      if (p.status !== "paid" && p.status !== "completed" && p.status !== "invoiced")
        return false;
      const d = new Date(p.updatedAt);
      return !isNaN(d.getTime()) && d >= weekAgo && d <= now;
    }).length;
    return { active, unbilled, doneThisWeek };
  }, [projects]);

  const filtered = useMemo(
    () => projects.filter((p) => matchFilter(p, filter) && matchQuery(p, query)),
    [projects, filter, query],
  );

  return (
    <div>
      <PageHeader
        title={fromEstimate ? "見積する案件を選ぶ" : "案件"}
        subtitle={fromEstimate ? "案件をタップすると見積・原価入力が開きます" : "現場・元請・住所・案件IDで探す"}
        back={fromEstimate ? "/new/create" : undefined}
      />

      <div className="px-4 py-3">
        {/* 検索欄 */}
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            🔍
          </span>
          <input
            type="search"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="案件名・物件・部屋番号・元請・住所・ID"
            className="w-full rounded-xl border border-[var(--nu-border)] bg-white py-2.5 pl-9 pr-3 text-sm text-[var(--nu-text)] outline-none focus:border-[var(--nu-primary)] focus:ring-2 focus:ring-[var(--nu-primary-bg)]"
          />
        </div>

        {/* サマリー */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <SummaryTile label="進行中" value={summary.active} />
          <SummaryTile label="未請求" value={summary.unbilled} accent />
          <SummaryTile label="今週完了" value={summary.doneThisWeek} />
        </div>

        {/* フィルター */}
        <div className="mt-3 -mx-4 overflow-x-auto px-4">
          <div className="flex gap-2 whitespace-nowrap pb-1">
            {FILTER_ORDER.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  filter === f
                    ? "bg-[var(--nu-primary)] text-white"
                    : "border border-[var(--nu-border)] bg-white text-slate-600 active:bg-[var(--nu-bg)]"
                }`}
              >
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 一覧 */}
      <div className="px-4 pb-4">
        {!ready ? (
          <div className="space-y-2">
            <div className="h-24 animate-pulse rounded-2xl bg-white" />
            <div className="h-24 animate-pulse rounded-2xl bg-white" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--nu-border)] bg-white px-4 py-8 text-center">
            <p className="text-sm text-slate-500">
              {projects.length === 0
                ? "案件がまだありません。"
                : "条件に合う案件がありません。"}
            </p>
            <Link
              href="/new/projects/new"
              className="mt-3 inline-flex items-center gap-1 rounded-xl bg-[var(--nu-primary)] px-4 py-2 text-sm font-semibold text-white active:bg-[var(--nu-primary-dk)]"
            >
              ＋ 新しい案件を登録
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-2 px-1 text-xs text-slate-400">{filtered.length}件</p>
            <ul className="space-y-2">
              {filtered.map((p) => (
                <li key={p.projectId}>
                  <Link
                    href={`/new/projects/${encodeURIComponent(p.projectId)}${fromEstimate ? "/estimate" : ""}`}
                    className="block rounded-2xl border border-[var(--nu-border)] bg-white p-3.5 shadow-sm active:bg-[var(--nu-bg)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 font-bold text-[var(--nu-text)]">
                        {p.projectName || "（名称未設定の案件）"}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusBadgeClass(
                          p.status,
                        )}`}
                      >
                        {PROJECT_STATUS_LABELS[p.status]}
                      </span>
                    </div>
                    <dl className="mt-1.5 space-y-0.5 text-xs text-slate-500">
                      <div className="truncate">
                        物件：{[p.propertyName, p.roomNumber].filter(Boolean).join(" ") || "—"}
                      </div>
                      <div className="truncate">
                        元請/顧客：{p.clientName || p.customerName || "—"}
                      </div>
                      {p.siteAddress && <div className="truncate">住所：{p.siteAddress}</div>}
                    </dl>
                    <p className="mt-1.5 text-[11px] text-slate-400">{p.projectId}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--nu-border)] bg-white px-2 py-2.5 text-center shadow-sm">
      <p className={`text-xl font-bold ${accent ? "text-rose-600" : "text-[var(--nu-primary-dk)]"}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

export default function NewProjectsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-sm text-slate-400">読み込み中…</div>}>
      <ProjectsInner />
    </Suspense>
  );
}
