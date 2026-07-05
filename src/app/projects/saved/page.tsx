"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSavedProjects, type SavedProject } from "@/app/utils/savedProjects";

export default function SavedProjectsPage() {
  const [projects, setProjects] = useState<SavedProject[]>([]);

  useEffect(() => {
    setProjects(getSavedProjects());
  }, []);

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        <header className="mb-4">
          <Link href="/projects/register" className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← 案件検索・登録へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">保存済み案件一覧</h1>
          <p className="mt-1 text-sm text-stone-500">
            「案件として保存」した案件を確認できます。
          </p>
        </header>

        <div className="space-y-3">
          {projects.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-stone-200 px-4 py-10 text-center">
              <p className="text-sm text-stone-500">保存済みの案件はまだありません。</p>
              <p className="mt-1.5 text-sm text-stone-500">案件登録から「案件として保存」してください。</p>
              <div className="mt-6">
                <Link href="/projects/new"
                  className="inline-flex items-center justify-center rounded-2xl bg-[#8B4A3C] px-6 py-3 text-sm font-bold text-white shadow-sm active:opacity-80">
                  案件登録へ
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {projects.map((p) => (
                <div key={p.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-100">
                  <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-4 py-2.5">
                    <span className="rounded-full bg-[#8B4A3C]/10 px-2 py-0.5 text-xs font-bold text-[#8B4A3C]">
                      {p.mitsumoriState}
                    </span>
                    <span className="text-xs text-stone-400">{p.updatedAt}</span>
                  </div>
                  <div className="px-4 py-3 space-y-1">
                    <p className="text-sm font-bold text-stone-800 leading-tight">
                      {p.projectName || "（案件名なし）"}
                    </p>
                    {p.clientName && <p className="text-xs text-stone-500">{p.clientName}</p>}
                    {p.address && <p className="text-xs text-stone-400">{p.address}</p>}
                    {p.sekouDate && <p className="text-xs text-stone-400">施工予定日：{p.sekouDate.replace(/-/g, "/")}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <Link href="/projects/new"
            className="flex w-full items-center justify-center rounded-2xl bg-[#8B4A3C] py-4 text-sm font-bold text-white shadow-sm active:opacity-80">
            新しく案件を登録する
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
