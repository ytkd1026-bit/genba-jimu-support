// 会話に紐づく案件カード（チャット上部などで使う）。
// 正本は案件DB。ここはその参照表示。将来 projectId で実データへ解決する。

import Link from "next/link";
import type { RelatedProjectRef } from "../_lib/chatMock";
import { statusBadgeClass } from "../_lib/theme";
import { PROJECT_STATUS_LABELS } from "@/app/utils/projects";

export default function ProjectCard({
  project,
  href = "/new/projects",
}: {
  project: RelatedProjectRef;
  href?: string;
}) {
  return (
    <div className="rounded-2xl border border-[#e6ebeb] bg-white p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-bold text-[#1f2a2e]">
          {project.projectName}
        </p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusBadgeClass(
            project.status,
          )}`}
        >
          {PROJECT_STATUS_LABELS[project.status]}
        </span>
      </div>

      <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
        <StateCell label="見積" value={project.estimateState} />
        <StateCell label="施工" value={project.constructionState} />
        <StateCell label="請求" value={project.invoiceState} />
      </dl>

      <Link
        href={href}
        className="mt-3 flex w-full items-center justify-center rounded-xl bg-[#e6f4f2] py-2 text-sm font-semibold text-[#0f766e] active:bg-[#d6ece9]"
      >
        案件を見る
      </Link>
    </div>
  );
}

function StateCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#f6f8f8] px-1 py-1.5">
      <dt className="text-[10px] text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-xs font-semibold text-[#1f2a2e]">{value}</dd>
    </div>
  );
}
