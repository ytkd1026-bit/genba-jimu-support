"use client";

// 請求漏れ防止の警告カード（S-7）
// ホーム画面に表示し、お金の取りこぼしにつながる状態を案件リンクつきで知らせる。
// 判定は utils/billingAlerts.ts に集約している（このコンポーネントは表示のみ）。

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  collectBillingAlerts,
  hasAnyAlert,
  type BillingAlerts,
  type ProjectAlert,
} from "@/app/utils/billingAlerts";

const MAX_LISTED = 3;

function AlertCard({
  icon,
  title,
  tone,
  alerts,
  hrefFor,
}: {
  icon: string;
  title: string;
  tone: "red" | "amber";
  alerts: ProjectAlert[];
  hrefFor: (a: ProjectAlert) => string;
}) {
  if (alerts.length === 0) return null;
  const toneCls =
    tone === "red"
      ? "bg-red-50 ring-red-200"
      : "bg-amber-50 ring-amber-200";
  const titleCls = tone === "red" ? "text-red-700" : "text-amber-800";
  const countCls = tone === "red" ? "bg-red-600" : "bg-amber-600";

  return (
    <div className={`rounded-2xl p-3 shadow-sm ring-1 ${toneCls}`}>
      <div className="flex items-center justify-between">
        <p className={`text-sm font-bold ${titleCls}`}>{icon} {title}</p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold text-white ${countCls}`}>
          {alerts.length}件
        </span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {alerts.slice(0, MAX_LISTED).map((a) => (
          <li key={a.projectId}>
            <Link
              href={hrefFor(a)}
              className="flex items-center justify-between rounded-xl bg-white px-3 py-2 ring-1 ring-stone-100 active:opacity-75"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-stone-800">{a.projectName}</span>
                <span className="block text-xs text-stone-400">{a.projectId}・{a.detail}</span>
              </span>
              <span className="ml-2 shrink-0 text-stone-300">›</span>
            </Link>
          </li>
        ))}
      </ul>
      {alerts.length > MAX_LISTED && (
        <Link href="/projects/list" className={`mt-1.5 block text-right text-xs font-bold ${titleCls}`}>
          他 {alerts.length - MAX_LISTED} 件を案件一覧で見る →
        </Link>
      )}
    </div>
  );
}

export function BillingAlertCards() {
  const [alerts, setAlerts] = useState<BillingAlerts | null>(null);

  // localStorage を読むためマウント後に集計する
  useEffect(() => {
    setAlerts(collectBillingAlerts());
  }, []);

  if (!alerts) return null;

  if (!hasAnyAlert(alerts)) {
    return (
      <div className="rounded-2xl bg-green-50 px-3 py-2.5 ring-1 ring-green-200">
        <p className="text-xs font-bold text-green-700">
          ✓ 請求漏れ・入金漏れ・原価未入力の警告はありません
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <AlertCard
        icon="⏰" title="支払期限超過" tone="red"
        alerts={alerts.overdue}
        hrefFor={(a) => `/projects/${encodeURIComponent(a.projectId)}/invoice`}
      />
      <AlertCard
        icon="⚠️" title="未請求（施工完了）" tone="red"
        alerts={alerts.unbilled}
        hrefFor={(a) => `/projects/${encodeURIComponent(a.projectId)}/invoice`}
      />
      <AlertCard
        icon="💰" title="未入金（請求済み）" tone="amber"
        alerts={alerts.unpaid}
        hrefFor={(a) => `/projects/${encodeURIComponent(a.projectId)}`}
      />
      <AlertCard
        icon="✏️" title="原価未入力" tone="amber"
        alerts={alerts.missingCost}
        hrefFor={(a) => `/projects/${encodeURIComponent(a.projectId)}/work-items`}
      />
      {alerts.companySettingsIssues.length > 0 && (
        <Link
          href="/settings/company"
          className="block rounded-2xl bg-amber-50 p-3 shadow-sm ring-1 ring-amber-200 active:opacity-75"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-amber-800">⚙️ 会社設定が未完了です</p>
            <span className="text-stone-300">›</span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {alerts.companySettingsIssues.map((msg) => (
              <li key={msg} className="text-xs text-amber-700">・{msg}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-amber-600">
            このまま発行するとデモ値が帳票に印字されます。
          </p>
        </Link>
      )}
    </div>
  );
}
