"use client";

// 案件ステータスの7段階表示バッジ（S-3 一覧強化）
//
// 保存されるステータス（ProjectStatus・10値）は変更せず、画面表示だけを
// 「①調査 → ②見積 → ③受注 → ④施工中 → ⑤施工完了 → ⑥請求済み → ⑦入金済み」
// の7段階に束ねて色分けする。中止は段階外（グレー）として扱う。

import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/app/utils/projects";

type StageInfo = {
  step: number; // 1〜7（中止は 0）
  label: string;
  cls: string; // バッジの配色
};

const STAGE_OF_STATUS: Record<ProjectStatus, StageInfo> = {
  survey:      { step: 1, label: "現地調査", cls: "bg-blue-100 text-blue-800" },
  estimating:  { step: 2, label: "見積中",   cls: "bg-amber-100 text-amber-800" },
  submitted:   { step: 2, label: "見積中",   cls: "bg-amber-100 text-amber-800" },
  approved:    { step: 3, label: "受注",     cls: "bg-violet-100 text-violet-800" },
  scheduled:   { step: 3, label: "受注",     cls: "bg-violet-100 text-violet-800" },
  in_progress: { step: 4, label: "施工中",   cls: "bg-[#8B4A3C]/10 text-[#8B4A3C]" },
  completed:   { step: 5, label: "施工完了", cls: "bg-red-100 text-red-700" },
  invoiced:    { step: 6, label: "請求済み", cls: "bg-purple-100 text-purple-800" },
  paid:        { step: 7, label: "入金済み", cls: "bg-green-100 text-green-700" },
  cancelled:   { step: 0, label: "中止",     cls: "bg-stone-200 text-stone-500" },
};

const STEP_MARKS = ["", "①", "②", "③", "④", "⑤", "⑥", "⑦"];

/**
 * 7段階の状態バッジ。
 * 段階名より細かいステータス（見積提出済み・施工予定など）は
 * showDetail のとき小さく併記する。
 */
export function ProjectStatusBadge({
  status,
  showDetail = true,
}: {
  status: ProjectStatus;
  showDetail?: boolean;
}) {
  const stage = STAGE_OF_STATUS[status];
  const detail = PROJECT_STATUS_LABELS[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${stage.cls}`}>
        {stage.step > 0 ? `${STEP_MARKS[stage.step]} ` : ""}{stage.label}
      </span>
      {showDetail && detail !== stage.label && (
        <span className="text-[11px] text-stone-400">{detail}</span>
      )}
    </span>
  );
}
