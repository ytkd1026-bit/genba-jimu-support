"use client";

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import {
  getSavedEstimates,
  deleteEstimate,
  duplicateEstimate,
  setSelectedEstimateId,
  STATUS_LABELS,
  STATUS_STYLES,
  type SavedEstimate,
} from "@/app/utils/savedEstimates";
import { useRouter } from "next/navigation";

function fmtYen(n: number): string {
  return "¥" + n.toLocaleString("ja-JP");
}

export default function SavedEstimatesPage() {
  const router = useRouter();
  const [estimates,    setEstimates]    = useState<SavedEstimate[]>([]);
  const [searchQuery,  setSearchQuery]  = useState("");

  useEffect(() => {
    setEstimates(getSavedEstimates());
  }, []);

  function handleOpen(id: string) {
    setSelectedEstimateId(id);
    router.push("/projects/sample/estimate");
  }

  function handleDuplicate(id: string) {
    duplicateEstimate(id);
    setEstimates(getSavedEstimates());
  }

  function handleDelete(id: string) {
    if (!window.confirm("この見積を削除しますか？")) return;
    deleteEstimate(id);
    setEstimates(getSavedEstimates());
  }

  // ⑯ 部分入力検索（案件名・提出先・工事内容・現場住所）
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return estimates;
    return estimates.filter((e) =>
      e.projectName.toLowerCase().includes(q) ||
      e.clientName.toLowerCase().includes(q) ||
      e.workDescription.toLowerCase().includes(q) ||
      e.siteAddress.toLowerCase().includes(q)
    );
  }, [estimates, searchQuery]);

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        <header className="mb-4">
          <Link href="/estimates"
            className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← 見積・注文書関係へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">保存済み見積一覧</h1>
          <p className="mt-1 text-sm text-stone-500">
            下書き保存・保存済みの見積を確認できます。
          </p>
        </header>

        <div className="space-y-3">

          {/* ⑯ 検索フォーム */}
          <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
            <input
              type="text"
              placeholder="案件名・提出先・工事内容で検索"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-1 focus:ring-[#8B4A3C]/30"
            />
          </div>

          {/* 空状態 */}
          {estimates.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-stone-200 px-4 py-10 text-center">
              <p className="text-sm text-stone-500">保存済み見積はまだありません。</p>
              <p className="mt-1.5 text-sm text-stone-500">見積作成から下書き保存してください。</p>
              <div className="mt-6">
                <Link
                  href="/projects/sample/estimate"
                  className="inline-flex items-center justify-center rounded-2xl bg-[#8B4A3C] px-6 py-3 text-sm font-bold text-white shadow-sm active:opacity-80"
                >
                  見積作成へ
                </Link>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-stone-200 py-8 text-center">
              <p className="text-sm text-stone-400">「{searchQuery}」に一致する見積はありません。</p>
            </div>
          ) : (
            filtered.map((est) => (
              <div key={est.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-100">

                {/* カードヘッダー */}
                <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLES[est.status]}`}>
                      {STATUS_LABELS[est.status]}
                    </span>
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
                      v{est.version}
                    </span>
                  </div>
                  <span className="text-xs text-stone-400">{est.updatedAt}</span>
                </div>

                {/* カード本文 */}
                <div className="px-4 py-3 space-y-1">

                  {/* ⑭ 案件名クリックで見積を開く */}
                  <button
                    type="button"
                    onClick={() => handleOpen(est.id)}
                    className="text-left text-sm font-bold text-[#8B4A3C] underline underline-offset-2 leading-tight active:opacity-70"
                  >
                    {est.projectName || "（案件名なし）"}
                  </button>

                  {est.clientName && (
                    <p className="text-xs text-stone-500">{est.clientName}</p>
                  )}
                  {est.siteAddress && (
                    <p className="text-xs text-stone-400">{est.siteAddress}</p>
                  )}
                  {est.workDescription && (
                    <p className="line-clamp-1 text-xs text-stone-400">{est.workDescription}</p>
                  )}

                  {/* ⑬ 小計・消費税・税込小計 */}
                  <div className="mt-1.5 divide-y divide-stone-100 rounded-lg border border-stone-100">
                    <div className="flex items-center justify-between px-3 py-1.5">
                      <span className="text-xs text-stone-500">小計</span>
                      <span className="text-xs font-medium text-stone-700">{fmtYen(est.subtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between px-3 py-1.5">
                      <span className="text-xs text-stone-500">消費税（10%）</span>
                      <span className="text-xs font-medium text-stone-600">{fmtYen(est.tax)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-b-lg bg-[#fdf0ec] px-3 py-1.5">
                      <span className="text-xs font-bold text-[#8B4A3C]">税込合計</span>
                      <span className="text-base font-bold text-[#8B4A3C]">{fmtYen(est.total)}</span>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-0.5 text-xs text-stone-400">
                    <span>作成日：{est.createdAt}</span>
                    {est.createdAt !== est.updatedAt && (
                      <span>更新日：{est.updatedAt}</span>
                    )}
                  </div>
                </div>

                {/* アクションボタン */}
                <div className="grid grid-cols-2 gap-1.5 border-t border-stone-100 px-4 py-3">
                  {/* ⑮ 見積を修正する */}
                  <button
                    type="button"
                    onClick={() => handleOpen(est.id)}
                    className="flex min-h-[44px] items-center justify-center rounded-xl bg-[#8B4A3C] px-2 py-2 text-center text-xs font-bold text-white active:opacity-80"
                  >
                    見積を修正する
                  </button>
                  <Link
                    href="/projects/sample/estimate"
                    className="flex min-h-[44px] items-center justify-center rounded-xl border border-[#8B4A3C] bg-white px-2 py-2 text-center text-xs font-bold text-[#8B4A3C] active:opacity-80"
                  >
                    PDF作成へ進む
                  </Link>
                  <Link
                    href="/projects/sample"
                    className="flex min-h-[44px] items-center justify-center rounded-xl border border-stone-200 bg-white px-2 py-2 text-center text-xs font-bold text-stone-600 active:opacity-80"
                  >
                    案件詳細を見る
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDuplicate(est.id)}
                    className="flex min-h-[44px] items-center justify-center rounded-xl border border-stone-200 bg-white px-2 py-2 text-center text-xs font-bold text-stone-600 active:opacity-80"
                  >
                    複製して新規見積
                  </button>
                </div>

                {/* 削除 */}
                <div className="border-t border-stone-100 px-4 py-2">
                  <button
                    type="button"
                    onClick={() => handleDelete(est.id)}
                    className="w-full min-h-[36px] rounded-xl py-1.5 text-xs font-bold text-red-400 active:text-red-600 active:opacity-80"
                  >
                    削除
                  </button>
                </div>
              </div>
            ))
          )}

          <Link
            href="/projects/sample/estimate"
            className="flex w-full items-center justify-center rounded-2xl bg-[#8B4A3C] py-4 text-sm font-bold text-white shadow-sm active:opacity-80"
          >
            新しく見積を作る
          </Link>

          <div className="pb-8">
            <Link
              href="/"
              className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-3 text-sm font-bold text-stone-400 shadow-sm active:opacity-80"
            >
              ホームへ戻る
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
