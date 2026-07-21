"use client";

// S-7 請求漏れ・入力漏れ 警告カード（読取専用・データ非破壊）。
// ホーム/一覧から呼び、該当があるものだけ表示する。装飾は最小限。

import Link from "next/link";
import { useEffect, useState } from "react";
import { computeProjectWarnings, type ProjectWarnings } from "@/app/utils/projectWarnings";

type Item = {
  key: keyof ProjectWarnings | "overdue";
  label: string;
  count: number;
  href: string;
  hint: string;
};

export function ProjectWarningCards() {
  const [w, setW] = useState<ProjectWarnings | null>(null);

  useEffect(() => {
    // クライアントで localStorage を読んで集計する（SSR安全のためマウント後に実行）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setW(computeProjectWarnings());
  }, []);

  if (!w) return null;

  const items: Item[] = [
    { key: "unbilled", label: "完了したのに未請求", count: w.unbilled.length, href: "/projects/list", hint: "施工完了・請求前の案件" },
    { key: "overdue", label: "支払期限が過ぎた未入金", count: w.overdue.length, href: "/projects/list", hint: "支払期限を過ぎています" },
    { key: "unpaid", label: "請求済み・未入金", count: w.unpaid.length, href: "/projects/list", hint: "入金の確認待ち" },
    { key: "costMissing", label: "原価が未入力", count: w.costMissing.length, href: "/projects/list", hint: "原価を1円も入れていない案件" },
  ];
  const shown = items.filter((i) => i.count > 0);

  if (shown.length === 0 && !w.settingsIncomplete) {
    return (
      <div className="mb-4 rounded-2xl bg-green-50 px-4 py-3 ring-1 ring-green-200">
        <p className="text-sm font-bold text-green-700">✓ 請求漏れ・入力漏れはありません</p>
      </div>
    );
  }

  return (
    <div className="mb-4 space-y-2">
      <p className="px-1 text-xs font-bold text-stone-500">確認が必要です</p>

      {w.settingsIncomplete && (
        <Link href="/settings/company"
          className="flex items-center justify-between rounded-2xl bg-amber-50 px-4 py-3 shadow-sm ring-1 ring-amber-200 active:opacity-80">
          <div className="min-w-0">
            <p className="text-sm font-bold text-amber-800">会社情報が未設定です</p>
            <p className="mt-0.5 text-xs text-amber-700">屋号・インボイス番号・振込先を登録してください</p>
          </div>
          <span className="shrink-0 text-amber-700">設定へ →</span>
        </Link>
      )}

      {shown.map((i) => (
        <Link key={i.key} href={i.href}
          className="flex items-center justify-between rounded-2xl bg-red-50 px-4 py-3 shadow-sm ring-1 ring-red-200 active:opacity-80">
          <div className="min-w-0">
            <p className="text-sm font-bold text-red-700">{i.label}</p>
            <p className="mt-0.5 text-xs text-red-500">{i.hint}</p>
          </div>
          <span className="shrink-0 rounded-full bg-red-600 px-2.5 py-0.5 text-sm font-bold text-white">{i.count}件</span>
        </Link>
      ))}
    </div>
  );
}
