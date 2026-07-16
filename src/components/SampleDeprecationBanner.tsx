"use client";

// sample（旧）フローの廃止予定バナー
// /projects/sample 配下の各画面の先頭に表示し、旧フローであることと
// 移行先（案件管理の新フロー）を利用者に案内する。
// 表示のみで、旧フローの機能・保存データには一切影響しない。

import Link from "next/link";

export function SampleDeprecationBanner({
  alternativeHref = "/projects/list",
  alternativeLabel = "案件一覧（新しい案件管理）を開く",
  note,
}: {
  alternativeHref?: string;
  alternativeLabel?: string;
  /** 画面ごとの補足（例: この画面の機能は案件管理へ統合予定です） */
  note?: string;
}) {
  return (
    <div className="mb-3 rounded-2xl bg-stone-100 p-3 ring-1 ring-stone-300">
      <p className="text-xs font-bold text-stone-600">
        ⚠️ この画面は旧フロー（サンプル）です — 今後のアップデートで廃止予定
      </p>
      <p className="mt-0.5 text-xs text-stone-500">
        {note ??
          "新しい「案件管理」では、案件ごとに調査・写真・工事項目・見積・請求をまとめて管理できます。保存済みのデータはそのまま残ります。"}
      </p>
      <Link
        href={alternativeHref}
        className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#8B4A3C] px-4 py-2 text-xs font-bold text-white active:opacity-80"
      >
        {alternativeLabel} →
      </Link>
    </div>
  );
}
