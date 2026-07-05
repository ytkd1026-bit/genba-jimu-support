"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSavedMaterialOrders, type SavedMaterialOrder } from "@/app/utils/savedMaterialOrders";

function fmtYen(n: number): string {
  return "¥" + Math.floor(n).toLocaleString("ja-JP");
}

export default function SavedMaterialOrdersPage() {
  const [orders, setOrders] = useState<SavedMaterialOrder[]>([]);

  useEffect(() => {
    setOrders(getSavedMaterialOrders());
  }, []);

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        <header className="mb-4">
          <Link href="/materials" className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← 材料・発注管理へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">保存済み材料計算一覧</h1>
          <p className="mt-1 text-sm text-stone-500">
            「材料計算を保存」した内容を確認できます。
          </p>
        </header>

        <div className="space-y-3">
          {orders.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-stone-200 px-4 py-10 text-center">
              <p className="text-sm text-stone-500">保存済みの材料計算はまだありません。</p>
              <p className="mt-1.5 text-sm text-stone-500">材料計算画面から「材料計算を保存」してください。</p>
              <div className="mt-6">
                <Link href="/projects/sample/materials"
                  className="inline-flex items-center justify-center rounded-2xl bg-teal-600 px-6 py-3 text-sm font-bold text-white shadow-sm active:opacity-80">
                  材料計算へ
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((o) => (
                <div key={o.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-teal-100">
                  <div className="flex items-center justify-between border-b border-teal-50 bg-teal-50 px-4 py-2.5">
                    <span className="rounded bg-teal-100 px-2 py-0.5 text-xs font-bold text-teal-700">
                      材料行 {o.rows.length}件
                    </span>
                    <span className="text-xs text-stone-400">{o.updatedAt}</span>
                  </div>
                  <div className="px-4 py-3 space-y-1">
                    <p className="text-sm font-bold text-stone-800 leading-tight">
                      {o.projectName || "（案件未選択）"}
                    </p>
                    <div className="mt-1.5 rounded-lg bg-[#fdf0ec] px-3 py-1.5 text-right">
                      <span className="text-xs text-[#8B4A3C]">材料費合計　</span>
                      <span className="text-base font-bold text-[#8B4A3C]">{fmtYen(o.totalMaterialCost)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Link href="/projects/sample/materials"
            className="flex w-full items-center justify-center rounded-2xl bg-teal-600 py-4 text-sm font-bold text-white shadow-sm active:opacity-80">
            新しく材料計算する
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
