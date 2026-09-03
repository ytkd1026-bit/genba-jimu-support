"use client";

// 新UI 作成（/new/create）
// 作成メニューは既存機能へ遷移させる（二重実装しない）。
// 「最近の案件から作成」「最近の作成物」は既存ストアを読むだけ。

import Link from "next/link";
import { useEffect, useState } from "react";
import PageHeader from "../_components/PageHeader";
import {
  loadProjects,
  loadEstimates,
  loadInvoices,
  formatYen,
  type Project,
} from "../_lib/data";
import { statusBadgeClass } from "../_lib/theme";
import { PROJECT_STATUS_LABELS } from "@/app/utils/projects";

// 作成メニュー（既存ルートへの導線）
const CREATE_MENU = [
  { title: "新規案件",   desc: "現場・元請・住所を登録",   icon: "📝", href: "/new/projects/new",                    primary: true },
  { title: "見積書",     desc: "案件を選んで見積・原価入力", icon: "📋", href: "/new/projects?from=estimate",       primary: true },
  { title: "請求書",     desc: "完了案件の請求書を作成",   icon: "📄", href: "/new/invoices",                    primary: true },
  { title: "発注書",     desc: "材料計算・発注候補を管理", icon: "📦", href: "/new/materials",                   primary: false },
  { title: "完了報告書", desc: "案件を選んで報告書を作成", icon: "✅", href: "/new/projects?from=report",       primary: false },
  { title: "施工記録",   desc: "案件を選んで写真・記録",   icon: "📷", href: "/new/projects?from=log",           primary: false },
  { title: "拾い出し",   desc: "音声で採寸→数量を自動計算", icon: "🎙", href: "/new/takeoff",                     primary: false },
];

type RecentDoc = {
  key: string;
  kind: "見積" | "請求";
  title: string;
  amount: number;
  href: string;
  updatedAt: string;
};

export default function NewCreatePage() {
  const [ready, setReady] = useState(false);
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [recentDocs, setRecentDocs] = useState<RecentDoc[]>([]);

  useEffect(() => {
    setRecentProjects(loadProjects().slice(0, 5));

    const ests: RecentDoc[] = loadEstimates().slice(0, 6).map((e) => ({
      key: `est-${e.id}`,
      kind: "見積",
      title: e.projectName || e.estimateNo || "見積書",
      amount: e.total || 0,
      href: "/new/estimates/saved",
      updatedAt: e.updatedAt || e.createdAt || "",
    }));
    const invs: RecentDoc[] = loadInvoices().slice(0, 6).map((i) => ({
      key: `inv-${i.id}`,
      kind: "請求",
      title: i.projectName || i.invoiceNo || "請求書",
      amount: i.total || 0,
      href: "/new/invoices",
      updatedAt: i.updatedAt || i.createdAt || "",
    }));
    const merged = [...ests, ...invs]
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .slice(0, 5);
    setRecentDocs(merged);
    setReady(true);
  }, []);

  return (
    <div>
      <PageHeader title="作成" subtitle="案件・見積・請求などを作る" />

      <div className="space-y-5 px-4 py-4">
        {/* 作成メニュー */}
        <section>
          <h2 className="mb-2 px-1 text-sm font-bold text-[var(--nu-text)]">なにを作りますか？</h2>
          <div className="grid grid-cols-2 gap-3">
            {CREATE_MENU.map((m) => (
              <Link
                key={m.title}
                href={m.href}
                className={`flex flex-col rounded-2xl border p-4 shadow-sm active:scale-[0.98] ${
                  m.primary
                    ? "border-transparent bg-[var(--nu-primary)] text-white"
                    : "border-[var(--nu-border)] bg-white text-[var(--nu-text)]"
                }`}
              >
                <span className="text-2xl">{m.icon}</span>
                <span className="mt-2 text-sm font-bold">{m.title}</span>
                <span
                  className={`mt-0.5 text-[11px] leading-snug ${
                    m.primary ? "text-teal-50" : "text-slate-500"
                  }`}
                >
                  {m.desc}
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-2 px-1 text-[11px] text-slate-400">
            各作成は既存の作成画面へ移動します（機能はそのまま利用します）。
          </p>
        </section>

        {/* 最近の案件から作成 */}
        <section>
          <h2 className="mb-2 px-1 text-sm font-bold text-[var(--nu-text)]">最近の案件から作成</h2>
          {!ready ? (
            <div className="h-16 animate-pulse rounded-2xl bg-white" />
          ) : recentProjects.length === 0 ? (
            <p className="px-1 text-xs text-slate-400">案件がまだありません。</p>
          ) : (
            <ul className="space-y-2">
              {recentProjects.map((p) => (
                <li key={p.projectId}>
                  <Link
                    href={`/new/projects/${encodeURIComponent(p.projectId)}`}
                    className="flex items-center gap-3 rounded-2xl border border-[var(--nu-border)] bg-white p-3 shadow-sm active:bg-[var(--nu-bg)]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--nu-primary-bg)] text-lg">
                      📁
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--nu-text)]">
                        {p.projectName || "（名称未設定の案件）"}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {p.clientName || p.customerName || "元請・顧客未設定"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusBadgeClass(
                        p.status,
                      )}`}
                    >
                      {PROJECT_STATUS_LABELS[p.status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 最近の作成物 */}
        <section>
          <h2 className="mb-2 px-1 text-sm font-bold text-[var(--nu-text)]">最近の作成物</h2>
          {!ready ? (
            <div className="h-16 animate-pulse rounded-2xl bg-white" />
          ) : recentDocs.length === 0 ? (
            <p className="px-1 text-xs text-slate-400">まだ作成物がありません。</p>
          ) : (
            <ul className="space-y-2">
              {recentDocs.map((d) => (
                <li key={d.key}>
                  <Link
                    href={d.href}
                    className="flex items-center gap-3 rounded-2xl border border-[var(--nu-border)] bg-white p-3 shadow-sm active:bg-[var(--nu-bg)]"
                  >
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${
                        d.kind === "見積"
                          ? "bg-amber-50 text-amber-700 ring-amber-200"
                          : "bg-rose-50 text-rose-700 ring-rose-200"
                      }`}
                    >
                      {d.kind}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--nu-text)]">
                      {d.title}
                    </p>
                    <span className="shrink-0 text-sm font-bold text-[var(--nu-primary-dk)]">
                      {formatYen(d.amount)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
