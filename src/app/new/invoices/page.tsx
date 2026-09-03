"use client";

// 新UI 請求書（/new/invoices）
// 旧 /invoices（ハブ）を新UIデザインで置き換える入口画面。
// ・既存ロジック/データはそのまま再利用（savedInvoices / projects を読むだけ）。
// ・未請求確認・請求書作成の深い機能は既存画面へ遷移（二重実装しない）。

import Link from "next/link";
import { useEffect, useState } from "react";
import PageHeader from "../_components/PageHeader";
import { loadProjects, loadInvoices, formatYen, type Project, type SavedInvoice } from "../_lib/data";

const MENU = [
  { icon: "⚠️", title: "未請求確認", desc: "請求漏れを確認する", href: "/new/invoices/unbilled", primary: true },
  { icon: "📄", title: "単体請求書作成", desc: "1案件ごとの請求書を作る", href: "/new/invoices/single", primary: false },
  { icon: "📋", title: "一括請求書作成", desc: "元請ごとにまとめて請求する", href: "/new/invoices/bulk", primary: false },
];

export default function NewInvoicesPage() {
  const [ready, setReady] = useState(false);
  const [unbilledCount, setUnbilledCount] = useState(0);
  const [recent, setRecent] = useState<SavedInvoice[]>([]);

  useEffect(() => {
    const projects: Project[] = loadProjects();
    setUnbilledCount(projects.filter((p) => p.status === "completed").length);
    setRecent(
      loadInvoices()
        .slice()
        .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
        .slice(0, 5),
    );
    setReady(true);
  }, []);

  return (
    <div>
      <PageHeader title="請求書" subtitle="未請求の確認と請求書の作成" back="/new/create" />

      <div className="space-y-4 px-4 py-4">
        {/* 未請求サマリー */}
        <section className="rounded-2xl border border-[var(--nu-border)] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">未請求（施工完了）の案件</p>
              <p className={`mt-0.5 text-2xl font-bold ${unbilledCount > 0 ? "text-rose-600" : "text-[var(--nu-primary-dk)]"}`}>
                {ready ? `${unbilledCount}件` : "…"}
              </p>
            </div>
            {unbilledCount > 0 && (
              <Link
                href="/new/projects?filter=unbilled"
                className="rounded-xl bg-[var(--nu-primary-bg)] px-3 py-2 text-xs font-semibold text-[var(--nu-primary-dk)] active:opacity-80"
              >
                案件を見る ›
              </Link>
            )}
          </div>
        </section>

        {/* メニュー */}
        <section className="space-y-2">
          {MENU.map((m) => (
            <Link
              key={m.title}
              href={m.href}
              className={`flex items-center gap-3 rounded-2xl border p-4 shadow-sm active:opacity-85 ${
                m.primary
                  ? "border-transparent bg-[var(--nu-primary)] text-[var(--nu-on-primary)]"
                  : "border-[var(--nu-border)] bg-white"
              }`}
            >
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl ${
                  m.primary ? "bg-white/15" : "bg-[var(--nu-primary-bg)]"
                }`}
              >
                {m.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-bold ${m.primary ? "" : "text-[var(--nu-text)]"}`}>
                  {m.title}
                </span>
                <span className={`block text-xs ${m.primary ? "opacity-85" : "text-slate-500"}`}>
                  {m.desc}（既存画面へ移動）
                </span>
              </span>
              <span className={`shrink-0 text-lg ${m.primary ? "opacity-70" : "text-slate-300"}`}>›</span>
            </Link>
          ))}
        </section>

        {/* 最近の請求書（既存データの読み取り表示） */}
        <section>
          <h2 className="mb-2 px-1 text-sm font-bold text-[var(--nu-text)]">最近の請求書</h2>
          {!ready ? (
            <div className="h-16 animate-pulse rounded-2xl bg-white" />
          ) : recent.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[var(--nu-border)] bg-white px-4 py-6 text-center text-sm text-slate-500">
              保存済みの請求書はまだありません。
            </p>
          ) : (
            <ul className="space-y-2">
              {recent.map((inv) => (
                <li key={inv.id} className="flex items-center gap-3 rounded-2xl border border-[var(--nu-border)] bg-white p-3.5 shadow-sm">
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${
                      inv.status === "issued"
                        ? "bg-[var(--nu-primary-bg)] text-[var(--nu-primary-dk)] ring-[var(--nu-border)]"
                        : "bg-amber-50 text-amber-700 ring-amber-200"
                    }`}
                  >
                    {inv.status === "issued" ? "発行済" : "下書き"}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--nu-text)]">
                    {inv.projectName || inv.invoiceNo || "請求書"}
                  </p>
                  <span className="shrink-0 text-sm font-bold text-[var(--nu-primary-dk)]">
                    {formatYen(inv.total || 0)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
