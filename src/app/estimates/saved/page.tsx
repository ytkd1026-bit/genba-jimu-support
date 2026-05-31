"use client";

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  getSavedEstimates,
  deleteEstimate,
  duplicateEstimate,
  setSelectedEstimateId,
  type SavedEstimate,
} from "@/app/utils/savedEstimates";
import { matchesKeyword } from "@/app/utils/search";
import SavedEstimateCard from "@/app/components/SavedEstimateCard";

export default function SavedEstimatesPage() {
  const router = useRouter();
  const [estimates,   setEstimates]   = useState<SavedEstimate[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setEstimates(getSavedEstimates());
  }, []);

  // 見積を開く（修正・PDF共通）
  function handleOpen(id: string) {
    setSelectedEstimateId(id);
    router.push("/projects/sample/estimate");
  }

  // 削除（confirm はコンポーネント側で実行済み）
  function handleDelete(id: string) {
    deleteEstimate(id);
    setEstimates(getSavedEstimates());
  }

  // 複製（メッセージはコンポーネント側で表示済み）
  function handleDuplicate(id: string) {
    duplicateEstimate(id);
    setEstimates(getSavedEstimates());
  }

  // 部分一致検索（案件名・提出先・現場住所・工事内容）
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return estimates;
    return estimates.filter((e) =>
      matchesKeyword([e.projectName, e.clientName, e.workDescription, e.siteAddress], searchQuery)
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

          {/* 検索フォーム */}
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
                <Link href="/projects/sample/estimate"
                  className="inline-flex items-center justify-center rounded-2xl bg-[#8B4A3C] px-6 py-3 text-sm font-bold text-white shadow-sm active:opacity-80">
                  見積作成へ
                </Link>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-stone-200 py-8 text-center">
              <p className="text-sm text-stone-400">「{searchQuery}」に一致する見積はありません。</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((est) => (
                <SavedEstimateCard
                  key={est.id}
                  est={est}
                  onOpen={handleOpen}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                />
              ))}
            </div>
          )}

          <Link href="/projects/sample/estimate"
            className="flex w-full items-center justify-center rounded-2xl bg-[#8B4A3C] py-4 text-sm font-bold text-white shadow-sm active:opacity-80">
            新しく見積を作る
          </Link>

          <div className="pb-8">
            <Link href="/"
              className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-3 text-sm font-bold text-stone-400 shadow-sm active:opacity-80">
              ホームへ戻る
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
