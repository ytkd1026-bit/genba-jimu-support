"use client";

import Link from "next/link";
import { useState } from "react";
import {
  STATUS_LABELS,
  STATUS_STYLES,
  type SavedEstimate,
} from "@/app/utils/savedEstimates";

type Props = {
  est: SavedEstimate;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
};

export default function SavedEstimateCard({ est, onOpen, onDelete, onDuplicate }: Props) {
  const [dupMsg, setDupMsg] = useState("");

  function handleDelete() {
    if (!window.confirm("この見積を削除しますか？")) return;
    onDelete(est.id);
  }

  function handleDuplicate() {
    onDuplicate(est.id);
    setDupMsg("見積を複製しました。");
    setTimeout(() => setDupMsg(""), 4000);
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-100">

      {/* ヘッダー */}
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

      {/* 本文 */}
      <div className="px-4 py-3 space-y-1">
        {/* 案件名 → 押すと見積を開く */}
        <button
          type="button"
          onClick={() => onOpen(est.id)}
          className="block text-left text-sm font-bold text-[#8B4A3C] underline underline-offset-2 leading-tight active:opacity-70"
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

        {/* 税込合計のみ表示（小計・消費税は非表示） */}
        <div className="mt-1.5 rounded-lg bg-[#fdf0ec] px-3 py-1.5 text-right">
          <span className="text-xs text-[#8B4A3C]">税込合計　</span>
          <span className="text-base font-bold text-[#8B4A3C]">
            ¥{est.total.toLocaleString("ja-JP")}
          </span>
        </div>
      </div>

      {/* 複製後メッセージ */}
      {dupMsg && (
        <div className="mx-4 mb-1 rounded-lg bg-green-50 px-3 py-2 ring-1 ring-green-200">
          <p className="text-xs font-bold text-green-700">{dupMsg}</p>
        </div>
      )}

      {/* アクションボタン */}
      <div className="grid grid-cols-2 gap-1.5 border-t border-stone-100 px-4 py-3">
        <button
          type="button"
          onClick={() => onOpen(est.id)}
          className="flex min-h-[44px] items-center justify-center rounded-xl bg-[#8B4A3C] px-2 py-2 text-center text-xs font-bold text-white active:opacity-80"
        >
          見積を修正する
        </button>
        <button
          type="button"
          onClick={() => onOpen(est.id)}
          className="flex min-h-[44px] items-center justify-center rounded-xl border border-[#8B4A3C] bg-white px-2 py-2 text-center text-xs font-bold text-[#8B4A3C] active:opacity-80"
        >
          PDF作成へ進む
        </button>
        <Link
          href="/projects/sample"
          className="flex min-h-[44px] items-center justify-center rounded-xl border border-stone-200 bg-white px-2 py-2 text-center text-xs font-bold text-stone-600 active:opacity-80"
        >
          案件詳細を見る
        </Link>
        <button
          type="button"
          onClick={handleDuplicate}
          className="flex min-h-[44px] items-center justify-center rounded-xl border border-stone-200 bg-white px-2 py-2 text-center text-xs font-bold text-stone-600 active:opacity-80"
        >
          複製して新規見積
        </button>
      </div>

      {/* 削除 */}
      <div className="border-t border-stone-100 px-4 py-2">
        <button
          type="button"
          onClick={handleDelete}
          className="w-full min-h-[36px] rounded-xl py-1.5 text-xs font-bold text-red-400 active:text-red-600 active:opacity-80"
        >
          削除
        </button>
      </div>
    </div>
  );
}
