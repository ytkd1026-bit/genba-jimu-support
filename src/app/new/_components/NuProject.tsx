"use client";

// 新UI 案件配下の共通部品（案件ヘッダー＋タブ）。
// 旧 src/components/ProjectTabs.tsx は旧UIが使い続けるため一切変更せず、
// 新UI用に同等機能をテーマ変数（--nu-*）で描画するここを使う。

import Link from "next/link";
import type { Project } from "@/app/utils/projects";
import { PROJECT_STATUS_LABELS } from "@/app/utils/projects";
import { statusBadgeClass } from "../_lib/theme";

export type NuTabKey =
  | "detail" | "survey" | "photos" | "workItems"
  | "estimate" | "invoice" | "reports";

const TABS: Array<{ key: NuTabKey; label: string; sub: string }> = [
  { key: "detail",    label: "詳細",     sub: "" },
  { key: "survey",    label: "現地調査", sub: "/survey" },
  { key: "photos",    label: "写真台帳", sub: "/photos" },
  { key: "estimate",  label: "見積・原価", sub: "/estimate" },
  { key: "invoice",   label: "請求書",   sub: "/invoice" },
  { key: "reports",   label: "作業報告", sub: "/reports" },
];

/** 案件配下のタブ。すべて新UIルート（/new/projects/[id]/...）へ遷移する。 */
export function NuProjectTabs({
  projectId,
  active,
}: {
  projectId: string;
  active: NuTabKey;
}) {
  const base = `/new/projects/${encodeURIComponent(projectId)}`;
  return (
    <nav aria-label="案件メニュー" className="-mx-4 mb-3 overflow-x-auto px-4">
      <ul className="flex gap-1.5 whitespace-nowrap pb-1">
        {TABS.map((t) => {
          const on = t.key === active;
          return (
            <li key={t.key}>
              <Link
                href={`${base}${t.sub}`}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-[40px] items-center rounded-xl px-3.5 text-xs font-bold ${
                  on
                    ? "bg-[var(--nu-primary)] text-[var(--nu-on-primary)]"
                    : "border border-[var(--nu-border)] bg-white text-slate-600 active:bg-[var(--nu-bg)]"
                }`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** 案件の要約カード（新UIトーン）。 */
export function NuProjectHeader({ project }: { project: Project }) {
  return (
    <div className="mb-3 rounded-2xl border border-[var(--nu-border)] bg-white p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-bold text-[var(--nu-text)]">
          {project.projectName || "（名称未設定の案件）"}
        </p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusBadgeClass(
            project.status,
          )}`}
        >
          {PROJECT_STATUS_LABELS[project.status]}
        </span>
      </div>
      <p className="mt-1 truncate text-xs text-slate-500">
        {[project.propertyName, project.roomNumber].filter(Boolean).join(" ") || "物件情報なし"}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-slate-400">
        {project.clientName || project.customerName || "元請・顧客未設定"}・{project.projectId}
      </p>
    </div>
  );
}
