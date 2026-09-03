"use client";

// 新UI ホーム（/new）
// 「今日どこへ行くか・何をすべきか・忘れている仕事がないか」を一目で把握する入口。
// データは既存 localStorage ストアを「読むだけ」。予定（schedule_events）は未連携のため、
// 取得できない情報は架空表示せず placeholder を出す。

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  loadProjects,
  loadInvoices,
  actionSummary,
  monthlyIssuedTotal,
  isActive,
  formatYen,
  type Project,
  type ActionSummary,
} from "./_lib/data";
import { statusBadgeClass } from "./_lib/theme";
import { PROJECT_STATUS_LABELS } from "@/app/utils/projects";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function todayLabel(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
}

export default function NewHome() {
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [summary, setSummary] = useState<ActionSummary>({
    estimateNotSubmitted: 0,
    unbilled: 0,
    awaitingPayment: 0,
  });
  const [monthTotal, setMonthTotal] = useState<number | null>(null);
  const now = new Date();

  useEffect(() => {
    const ps = loadProjects();
    setProjects(ps);
    setSummary(actionSummary(ps));
    setMonthTotal(monthlyIssuedTotal(loadInvoices(), now));
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeProjects = projects.filter(isActive);
  const hasAction =
    summary.estimateNotSubmitted + summary.unbilled + summary.awaitingPayment > 0;

  return (
    <div>
      {/* ── 挨拶・日付 ── */}
      <header
        className="bg-gradient-to-b from-[#0d9488] to-[#0f766e] px-5 pb-6 pt-5 text-white"
        style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}
      >
        <p className="text-xs text-teal-100">現場の事務サポ</p>
        <h1 className="mt-1 text-xl font-bold">今日のダッシュボード</h1>
        <p className="mt-1 text-sm text-teal-50">{todayLabel(now)}</p>
      </header>

      <div className="space-y-4 px-4 py-4">
        {/* ── 今日のスケジュール（予定は未連携） ── */}
        <section className="rounded-2xl border border-[#e6ebeb] bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#1f2a2e]">今日のスケジュール</h2>
            <span className="text-[11px] text-slate-400">予定連携は準備中</span>
          </div>
          <div className="rounded-xl bg-[#f6f8f8] px-3 py-4 text-center text-sm text-slate-500">
            予定データ（現調・施工・請求など）の連携は今後の工程です。<br />
            現在は案件情報のみ表示しています。
          </div>
        </section>

        {/* ── 要対応 ── */}
        <section>
          <h2 className="mb-2 px-1 text-sm font-bold text-[#1f2a2e]">要対応</h2>
          <div className="grid grid-cols-3 gap-2">
            <ActionTile
              label="見積未提出"
              count={summary.estimateNotSubmitted}
              href="/new/projects?filter=estimating"
              tone="amber"
            />
            <ActionTile
              label="未請求"
              count={summary.unbilled}
              href="/new/projects?filter=unbilled"
              tone="rose"
            />
            <ActionTile
              label="入金待ち"
              count={summary.awaitingPayment}
              href="/new/projects?filter=all"
              tone="sky"
            />
          </div>
          {ready && !hasAction && (
            <p className="mt-2 px-1 text-xs text-slate-400">
              対応が必要な案件はありません。
            </p>
          )}
        </section>

        {/* ── 本日の案件（進行中を表示） ── */}
        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-[#1f2a2e]">進行中の案件</h2>
            <Link href="/new/projects" className="text-xs font-medium text-[#0d9488]">
              すべて見る ›
            </Link>
          </div>

          {!ready ? (
            <SkeletonCard />
          ) : activeProjects.length === 0 ? (
            <EmptyState
              text="進行中の案件はまだありません。"
              cta="案件を登録する"
              href="/projects/new"
            />
          ) : (
            <ul className="space-y-2">
              {activeProjects.slice(0, 4).map((p) => (
                <li key={p.projectId}>
                  <Link
                    href={`/projects/${encodeURIComponent(p.projectId)}`}
                    className="block rounded-2xl border border-[#e6ebeb] bg-white p-3.5 shadow-sm active:bg-[#f6f8f8]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate font-bold text-[#1f2a2e]">
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
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {[p.propertyName, p.roomNumber && `${p.roomNumber}`]
                        .filter(Boolean)
                        .join(" ") || "物件情報なし"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-400">
                      {p.clientName || p.customerName || "元請・顧客未設定"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── 今月サマリー（実データのみ） ── */}
        <section className="rounded-2xl border border-[#e6ebeb] bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-bold text-[#1f2a2e]">今月サマリー</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-500">発行済み請求（今月）</p>
              <p className="mt-0.5 text-lg font-bold text-[#0f766e]">
                {monthTotal === null ? (
                  <span className="text-sm font-medium text-slate-400">未集計</span>
                ) : (
                  formatYen(monthTotal)
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">進行中の案件</p>
              <p className="mt-0.5 text-lg font-bold text-[#0f766e]">
                {ready ? `${activeProjects.length}件` : "…"}
              </p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            粗利・入金状況などは今後の連携で追加予定です。
          </p>
        </section>
      </div>
    </div>
  );
}

// ─── 部品 ────────────────────────────────────────────────────
function ActionTile({
  label,
  count,
  href,
  tone,
}: {
  label: string;
  count: number;
  href: string;
  tone: "amber" | "rose" | "sky";
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-600"
      : tone === "rose"
      ? "text-rose-600"
      : "text-sky-600";
  return (
    <Link
      href={href}
      className="flex flex-col items-center rounded-2xl border border-[#e6ebeb] bg-white px-2 py-3 text-center shadow-sm active:bg-[#f6f8f8]"
    >
      <span className={`text-2xl font-bold ${count > 0 ? toneClass : "text-slate-300"}`}>
        {count}
      </span>
      <span className="mt-0.5 text-[11px] font-medium text-slate-500">{label}</span>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="h-20 animate-pulse rounded-2xl border border-[#e6ebeb] bg-white" />
  );
}

function EmptyState({ text, cta, href }: { text: string; cta: string; href: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#cfdad8] bg-white px-4 py-6 text-center">
      <p className="text-sm text-slate-500">{text}</p>
      <Link
        href={href}
        className="mt-3 inline-flex items-center gap-1 rounded-xl bg-[#0d9488] px-4 py-2 text-sm font-semibold text-white active:bg-[#0f766e]"
      >
        {cta}
      </Link>
    </div>
  );
}
