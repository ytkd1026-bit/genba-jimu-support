"use client";

// 新UI 案件詳細（/new/projects/[projectId]）
// 旧 /projects/[projectId] の「旧デザイン」を新UIトーンで置き換える入口。
// データは既存ストア（projectsStore / workItemsStore）を読むだけ。
// 各機能は既存ルートを再利用するが、見積・原価入力は新UI版へ遷移する。

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "../../_components/PageHeader";
import {
  projectsStore,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  BUILDING_TYPE_LABELS,
  type Project,
  type ProjectStatus,
} from "@/app/utils/projects";
import { workItemsStore, computeWorkItemAmounts } from "@/app/utils/workItems";
import { statusBadgeClass } from "../../_lib/theme";
import { formatYen } from "../../_lib/data";

// 工程ステッパー表示順（cancelled は除外して別表示）
const FLOW: ProjectStatus[] = [
  "survey",
  "estimating",
  "submitted",
  "approved",
  "scheduled",
  "in_progress",
  "completed",
  "invoiced",
  "paid",
];

export default function NewProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(params.projectId);

  const [ready, setReady] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [itemCount, setItemCount] = useState(0);
  const [sellingTotal, setSellingTotal] = useState(0);

  useEffect(() => {
    const p = projectsStore.getById(projectId);
    if (!p) {
      setNotFound(true);
      setReady(true);
      return;
    }
    setProject(p);
    const items = workItemsStore.getByProjectId(projectId);
    setItemCount(items.length);
    setSellingTotal(
      items.reduce(
        (s, w) =>
          s +
          computeWorkItemAmounts({
            quantity: w.quantity,
            sellingUnitPrice: w.sellingUnitPrice,
            materialCost: w.materialCost,
            laborCost: w.laborCost,
            subcontractCost: w.subcontractCost,
            expenseCost: w.expenseCost,
            otherCost: w.otherCost,
          }).sellingAmount,
        0,
      ),
    );
    setReady(true);
  }, [projectId]);

  const currentRank = useMemo(
    () => (project ? FLOW.indexOf(project.status) : -1),
    [project],
  );

  if (ready && notFound) {
    return (
      <div>
        <PageHeader title="案件詳細" back="/new/projects" />
        <div className="px-4 py-10 text-center">
          <p className="text-sm font-bold text-[#1f2a2e]">案件が見つかりません。</p>
          <p className="mt-1 font-mono text-xs text-slate-400">{projectId}</p>
          <Link
            href="/new/projects"
            className="mt-4 inline-flex items-center justify-center rounded-xl bg-[var(--nu-primary)] px-5 py-2.5 text-sm font-bold text-white active:bg-[var(--nu-primary-dk)]"
          >
            案件一覧へ戻る
          </Link>
        </div>
      </div>
    );
  }

  if (!ready || !project) {
    return (
      <div>
        <PageHeader title="案件詳細" back="/new/projects" />
        <div className="px-4 py-4">
          <div className="h-40 animate-pulse rounded-2xl bg-white" />
        </div>
      </div>
    );
  }

  const p = project;

  return (
    <div>
      <PageHeader title="案件詳細" subtitle={p.projectId} back="/new/projects" />

      <div className="space-y-4 px-4 py-4">
        {/* ── 見出し・ステータス ── */}
        <section className="rounded-2xl border border-[#e6ebeb] bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <h2 className="min-w-0 flex-1 text-base font-bold text-[#1f2a2e]">
              {p.projectName || "（名称未設定の案件）"}
            </h2>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusBadgeClass(
                p.status,
              )}`}
            >
              {PROJECT_STATUS_LABELS[p.status]}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {PROJECT_TYPE_LABELS[p.projectType]}・{BUILDING_TYPE_LABELS[p.buildingType]}
          </p>

          {/* 工程ステッパー（現在位置まで着色） */}
          {p.status !== "cancelled" && (
            <div className="mt-3 flex items-center gap-1">
              {FLOW.map((s, i) => (
                <span
                  key={s}
                  className="h-1.5 flex-1 rounded-full"
                  style={{
                    background:
                      i <= currentRank ? "var(--nu-primary)" : "var(--nu-primary-bg)",
                  }}
                  title={PROJECT_STATUS_LABELS[s]}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── 見積サマリー ── */}
        <section className="rounded-2xl border border-[#e6ebeb] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">見積（税抜・売価合計）</p>
              <p className="mt-0.5 text-xl font-bold text-[var(--nu-primary-dk)]">
                {itemCount === 0 ? (
                  <span className="text-sm font-medium text-slate-400">未入力</span>
                ) : (
                  formatYen(sellingTotal)
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">工事項目</p>
              <p className="mt-0.5 text-xl font-bold text-[#1f2a2e]">{itemCount}件</p>
            </div>
          </div>
          <Link
            href={`/new/projects/${encodeURIComponent(p.projectId)}/estimate`}
            className="mt-3 flex w-full items-center justify-center rounded-xl bg-[var(--nu-primary)] py-2.5 text-sm font-bold text-white active:bg-[var(--nu-primary-dk)]"
          >
            見積・原価入力を開く
          </Link>
        </section>

        {/* ── 基本情報 ── */}
        <section>
          <h3 className="mb-2 px-1 text-sm font-bold text-[#1f2a2e]">基本情報</h3>
          <dl className="divide-y divide-[#f0f3f3] rounded-2xl border border-[#e6ebeb] bg-white px-4 shadow-sm">
            <InfoRow label="物件名" value={p.propertyName} />
            <InfoRow label="部屋番号" value={p.roomNumber} />
            <InfoRow label="住所" value={p.siteAddress} />
            <InfoRow label="元請" value={p.clientName} />
            <InfoRow label="顧客" value={p.customerName} />
            <InfoRow label="提出先" value={p.submitTo} />
          </dl>
        </section>

        {/* ── 機能（既存機能を再利用。見た目は新UI） ── */}
        <section>
          <h3 className="mb-2 px-1 text-sm font-bold text-[#1f2a2e]">この案件でできること</h3>
          <div className="grid grid-cols-2 gap-3">
            <FeatureLink
              icon="📋"
              label="見積・原価入力"
              href={`/new/projects/${encodeURIComponent(p.projectId)}/estimate`}
              primary
            />
            <FeatureLink
              icon="📝"
              label="案件情報を編集"
              href={`/projects/${encodeURIComponent(p.projectId)}`}
            />
            <FeatureLink
              icon="🔍"
              label="現地調査"
              href={`/projects/${encodeURIComponent(p.projectId)}/survey`}
            />
            <FeatureLink
              icon="📷"
              label="写真台帳"
              href={`/projects/${encodeURIComponent(p.projectId)}/photos`}
            />
            <FeatureLink
              icon="📄"
              label="請求書"
              href={`/projects/${encodeURIComponent(p.projectId)}/invoice`}
            />
            <FeatureLink
              icon="✅"
              label="作業報告"
              href={`/projects/${encodeURIComponent(p.projectId)}/reports`}
            />
          </div>
          <p className="mt-2 px-1 text-[11px] text-slate-400">
            見積・原価入力は新UI版です。その他の機能は既存の画面を利用します。
          </p>
        </section>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <dt className="shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-right text-sm text-[#1f2a2e]">
        {value || "—"}
      </dd>
    </div>
  );
}

function FeatureLink({
  icon,
  label,
  href,
  primary,
}: {
  icon: string;
  label: string;
  href: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-2xl border p-3.5 shadow-sm active:scale-[0.98] ${
        primary
          ? "border-transparent bg-[var(--nu-primary)] text-white"
          : "border-[#e6ebeb] bg-white text-[#1f2a2e]"
      }`}
    >
      <span className="text-xl">{icon}</span>
      <span className="text-sm font-bold">{label}</span>
    </Link>
  );
}
