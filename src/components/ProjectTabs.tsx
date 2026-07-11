"use client";

// 案件詳細（親画面）配下のタブナビゲーションと案件ヘッダー
// タブ構成は改修指示書の推奨どおり 01〜09。
// 未実装のタブはグレー表示（フェーズ4以降で順次有効化する）。
// 05 見積書 / 06 請求書 は暫定的に既存画面へリンクする（段階的統合）。

import Link from "next/link";
import type { Project } from "@/app/utils/projects";
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from "@/app/utils/projects";

export type ProjectTabKey =
  | "detail"
  | "survey"
  | "photos"
  | "workItems"
  | "estimate"
  | "invoice"
  | "reports"
  | "logs"
  | "learning";

type TabDef = {
  key: ProjectTabKey;
  no: string;
  label: string;
  /** 案件配下の相対パス（projectId の後ろに付く） */
  subPath?: string;
  /** 案件外の既存画面へ飛ばす場合の絶対パス（暫定リンク） */
  externalHref?: string;
  /** 未実装タブ */
  disabled?: boolean;
};

const TABS: TabDef[] = [
  { key: "detail",    no: "01", label: "案件詳細",       subPath: "" },
  { key: "survey",    no: "02", label: "現地調査",       subPath: "/survey" },
  { key: "photos",    no: "03", label: "写真台帳",       subPath: "/photos" },
  { key: "workItems", no: "04", label: "工事項目・原価", disabled: true },
  { key: "estimate",  no: "05", label: "見積書",         externalHref: "/projects/sample/estimate" },
  { key: "invoice",   no: "06", label: "請求書",         externalHref: "/projects/sample/single-invoice" },
  { key: "reports",   no: "07", label: "作業報告",       disabled: true },
  { key: "logs",      no: "08", label: "案件ログ",       disabled: true },
  { key: "learning",  no: "09", label: "学び",           disabled: true },
];

export function ProjectTabs({
  projectId,
  active,
}: {
  projectId: string;
  active: ProjectTabKey;
}) {
  return (
    <nav className="mb-3 -mx-4 overflow-x-auto px-4">
      <div className="flex w-max gap-1.5 pb-1">
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          const base =
            "flex min-h-[44px] shrink-0 flex-col items-center justify-center rounded-xl px-3 py-1.5 text-center";
          if (isActive) {
            return (
              <span key={tab.key} className={`${base} bg-[#8B4A3C] text-white shadow-sm`}>
                <span className="text-[10px] opacity-70">{tab.no}</span>
                <span className="text-xs font-bold leading-tight">{tab.label}</span>
              </span>
            );
          }
          if (tab.disabled) {
            return (
              <span
                key={tab.key}
                className={`${base} bg-stone-100 text-stone-300`}
                title="今後のアップデートで追加予定です"
              >
                <span className="text-[10px]">{tab.no}</span>
                <span className="text-xs font-bold leading-tight">{tab.label}</span>
              </span>
            );
          }
          const href =
            tab.externalHref ?? `/projects/${encodeURIComponent(projectId)}${tab.subPath ?? ""}`;
          return (
            <Link
              key={tab.key}
              href={href}
              className={`${base} bg-white text-stone-600 ring-1 ring-stone-200 active:opacity-75`}
            >
              <span className="text-[10px] text-stone-400">{tab.no}</span>
              <span className="text-xs font-bold leading-tight">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** 案件名・案件ID・案件種別・進捗を表示する共通ヘッダー */
export function ProjectHeader({ project }: { project: Project }) {
  return (
    <div className="mb-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-stone-100">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-base font-bold text-stone-800">
          {project.projectName || "（案件名未入力）"}
        </p>
        <span className="shrink-0 rounded-full bg-[#fdf0ec] px-2 py-0.5 text-xs font-bold text-[#8B4A3C]">
          {PROJECT_STATUS_LABELS[project.status]}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-stone-400">
        <span className="font-mono">{project.projectId}</span>
        <span
          className={`rounded-full px-2 py-0.5 font-bold ${
            project.projectType === "insurance"
              ? "bg-blue-50 text-blue-600"
              : "bg-stone-100 text-stone-500"
          }`}
        >
          {PROJECT_TYPE_LABELS[project.projectType]}
        </span>
      </div>
    </div>
  );
}
