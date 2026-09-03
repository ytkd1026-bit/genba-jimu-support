"use client";

import Link from "next/link";
import PageHeader from "@/app/new/_components/PageHeader";
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
    router.push("/new/projects");
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
    <div className="">
      <PageHeader title="保存済み見積" subtitle="作成済みの見積を確認" back="/new/create" />
      <div className="px-4 py-4">

        <div className="space-y-3">

          {/* 検索フォーム */}
          <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
            <input
              type="text"
              placeholder="案件名・提出先・工事内容で検索"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-[var(--nu-border)] bg-[var(--nu-bg)] px-3 py-2.5 text-sm text-[var(--nu-text)] placeholder:text-slate-300 focus:border-[var(--nu-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--nu-primary)]/30"
            />
          </div>

          {/* 空状態 */}
          {estimates.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-[var(--nu-border)] px-4 py-10 text-center">
              <p className="text-sm text-slate-500">保存済み見積はまだありません。</p>
              <p className="mt-1.5 text-sm text-slate-500">見積作成から下書き保存してください。</p>
              <div className="mt-6">
                <Link href="/new/projects"
                  className="inline-flex items-center justify-center rounded-2xl bg-[var(--nu-primary)] px-6 py-3 text-sm font-bold text-white shadow-sm active:opacity-80">
                  見積作成へ
                </Link>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-[var(--nu-border)] py-8 text-center">
              <p className="text-sm text-slate-400">「{searchQuery}」に一致する見積はありません。</p>
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

          <Link href="/new/projects"
            className="flex w-full items-center justify-center rounded-2xl bg-[var(--nu-primary)] py-4 text-sm font-bold text-white shadow-sm active:opacity-80">
            新しく見積を作る
          </Link>

          <div className="pb-8">
            <Link href="/new"
              className="flex w-full items-center justify-center rounded-2xl border border-[var(--nu-border)] bg-white py-3 text-sm font-bold text-slate-400 shadow-sm active:opacity-80">
              ホームへ戻る
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
