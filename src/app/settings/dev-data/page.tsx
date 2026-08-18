"use client";

// テストデータ管理（仕様1〜4）
//
// テスト用に登録した元請・単価・案件（isTestData: true）だけを一括削除できる。
// テストデータかどうかは実行環境（NODE_ENV）ではなく、データ自身が保持する。
// 本番ビルドで登録しても、登録時の区分（isTestData）は変わらない。
// 本番利用データ（isTestData なし／false）は削除対象にしない。

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  countTestData,
  deleteTestData,
  isTestDataMode,
  setTestDataMode,
  type DevDataCounts,
} from "@/app/utils/devData";

export default function DevDataPage() {
  const [counts, setCounts] = useState<DevDataCounts>({ contractors: 0, masters: 0, projects: 0 });
  const [testMode, setTestMode] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  function reload() {
    setCounts(countTestData());
    setTestMode(isTestDataMode());
  }
  useEffect(() => {
    reload();
  }, []);

  const total = counts.contractors + counts.masters + counts.projects;

  function handleToggleMode() {
    const next = !testMode;
    setTestDataMode(next);
    setTestMode(next);
    setMsg(next ? "以後の新規データはテストデータとして保存します。" : "以後の新規データは本番データとして保存します。");
    setTimeout(() => setMsg(null), 5000);
  }

  function handleDelete() {
    if (total === 0) return;
    if (!confirm(`テストデータ（元請${counts.contractors}件・単価${counts.masters}件・案件${counts.projects}件）を削除します。本番データは残ります。よろしいですか？`)) return;
    const removed = deleteTestData();
    reload();
    setMsg(`テストデータを削除しました（元請${removed.contractors}・単価${removed.masters}・案件${removed.projects}）。`);
    setTimeout(() => setMsg(null), 6000);
  }

  return (
    <div className="min-h-screen bg-[#fdf8f2] pb-16">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">
        <header className="mb-3">
          <Link href="/" className="mb-2 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">← ホームへ戻る</Link>
          <h1 className="text-xl font-bold text-stone-800">テストデータ管理</h1>
          <p className="mt-1 text-sm text-stone-500">
            テスト用に登録したデータだけを削除します。テストか本番かはデータ自身が持つため、本番ビルドで登録しても区分は変わりません。
          </p>
        </header>

        {msg && <div className="mb-3 rounded-xl bg-green-50 px-3 py-2 text-xs font-bold text-green-700 ring-1 ring-green-200">{msg}</div>}

        {/* 登録モード切替 */}
        <div className="mb-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-stone-800">新規データをテストデータとして登録</p>
              <p className="mt-0.5 text-xs text-stone-500">
                {testMode ? "ON：これから作る元請・単価・案件はテストデータになります。" : "OFF：これから作るデータは本番データになります。"}
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleMode}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${testMode ? "bg-[#8B4A3C]" : "bg-stone-300"}`}
              aria-pressed={testMode}
            >
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${testMode ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
        </div>

        {/* 一括削除 */}
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
          <h2 className="mb-2 text-sm font-bold text-stone-700">テストデータの一括削除</h2>
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-center justify-between"><span className="text-stone-600">テスト用の元請</span><span className="font-bold text-stone-800">{counts.contractors}件</span></li>
            <li className="flex items-center justify-between"><span className="text-stone-600">テスト用の単価マスタ</span><span className="font-bold text-stone-800">{counts.masters}件</span></li>
            <li className="flex items-center justify-between"><span className="text-stone-600">テスト用の案件（＋工事項目）</span><span className="font-bold text-stone-800">{counts.projects}件</span></li>
          </ul>
          <button
            type="button"
            onClick={handleDelete}
            disabled={total === 0}
            className="mt-4 min-h-[48px] w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white active:opacity-80 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            {total === 0 ? "削除できるテストデータはありません" : `テストデータを一括削除する（${total}件）`}
          </button>
          <p className="mt-2 text-xs text-stone-400">
            本番データ（テスト印なし）は対象外です。会社設定は個別に「事業者設定」で初期化してください。
          </p>
        </div>
      </div>
    </div>
  );
}
