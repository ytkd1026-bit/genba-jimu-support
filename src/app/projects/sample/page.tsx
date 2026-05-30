"use client";

// TODO: Supabase連携後、進捗状態を projects.status または project_progress に保存する。
// TODO: 注文書返送済み、材料発注済み、請求済み、入金済みは月次収支と連動する。
// TODO: 一括請求対象フラグは invoice_items 作成時に利用する。

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

// ---- 型 ----

type ProgressState = {
  見積作成済み: boolean;
  見積送付済み: boolean;
  注文書返送済み: boolean;
  材料発注済み: boolean;
  施工予定: boolean;
  施工完了: boolean;
  単体請求済み: boolean;
  一括請求対象: boolean;
  入金済み: boolean;
};

type ProgressKey = keyof ProgressState;

// ---- 仮データ ----

const projectInfo = [
  { label: "元請け・顧客名", value: "△△工務店" },
  { label: "現場住所", value: "大阪府堺市〇〇区" },
  { label: "工事種別", value: "クロス" },
  { label: "工事内容", value: "洋室クロス貼替、洗面所CF貼替" },
  { label: "見積状態", value: "作成中" },
  { label: "請求状態", value: "未請求" },
  { label: "施工予定日", value: "2026/06/03" },
];

const workButtons = [
  { label: "見積書を作る", desc: "単価・数量・利益を入力", icon: "📝", href: "/projects/sample/estimate" },
  { label: "材料計算", desc: "m数・㎡数から必要材料を確認", icon: "📐", href: "/projects/sample/materials" },
  { label: "原価・利益計算", desc: "人工・材料・経費・粗利を確認", icon: "💰", href: null },
  { label: "稟議書を作る", desc: "元請け提出用の説明資料", icon: "📋", href: null },
  { label: "請求書を作る", desc: "見積内容から請求書へ", icon: "🧾", href: "/projects/sample/invoice" },
  { label: "スケジュールを見る", desc: "現調・施工・請求予定を確認", icon: "📅", href: null },
];

const INITIAL_PROGRESS: ProgressState = {
  見積作成済み: true,
  見積送付済み: true,
  注文書返送済み: false,
  材料発注済み: false,
  施工予定: true,
  施工完了: false,
  単体請求済み: false,
  一括請求対象: true,
  入金済み: false,
};

// ---- ユーティリティ ----

function getNextAction(p: ProgressState): string {
  if (!p.見積作成済み) return "見積書を作成してください。";
  if (!p.見積送付済み) return "見積書を元請・施主へ送付してください。";
  if (!p.注文書返送済み) return "注文書または発注確認の返送待ちです。";
  if (!p.材料発注済み) return "材料発注を確認してください。";
  if (!p.施工完了) return "施工予定と材料搬入日を確認してください。";
  if (!p.単体請求済み && p.施工完了) return "この案件の請求処理を確認してください。";
  if (!p.入金済み && p.単体請求済み) return "入金確認を行ってください。";
  return "この案件は完了しています。";
}

function getStatusLabel(rate: number): string {
  if (rate === 100) return "完了";
  if (rate >= 71) return "完了間近";
  if (rate >= 31) return "進行中";
  return "準備中";
}

function getStatusColors(rate: number): string {
  if (rate === 100) return "bg-green-100 text-green-800";
  if (rate >= 71) return "bg-blue-100 text-blue-800";
  if (rate >= 31) return "bg-amber-100 text-amber-800";
  return "bg-stone-100 text-stone-600";
}

function getBarColor(rate: number): string {
  if (rate === 100) return "bg-green-500";
  if (rate >= 71) return "bg-blue-400";
  if (rate >= 31) return "bg-amber-400";
  return "bg-stone-400";
}

// ---- コンポーネント ----

export default function SampleProjectPage() {
  const router = useRouter();
  const [progress, setProgress] = useState<ProgressState>(INITIAL_PROGRESS);

  const keys = Object.keys(progress) as ProgressKey[];
  const trueCount = keys.filter((k) => progress[k]).length;
  const rate = Math.round((trueCount / keys.length) * 100);
  const nextAction = getNextAction(progress);

  function toggleProgress(key: ProgressKey) {
    setProgress((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleWorkButton(href: string | null) {
    if (href) {
      router.push(href);
    } else {
      alert("次工程で作成します");
    }
  }

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        {/* ヘッダー */}
        <header className="mb-4">
          <Link
            href="/"
            className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75"
          >
            ← ホームへ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">
            〇〇マンション クロス貼替
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            この案件の見積・材料・原価・請求を管理します。
          </p>
        </header>

        {/* 案件概要カード */}
        <div className="mb-3 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">
            案件概要
          </h2>
          <ul className="space-y-2">
            {projectInfo.map((item) => (
              <li key={item.label} className="flex items-start gap-2 text-sm">
                <span className="w-28 shrink-0 text-stone-500">{item.label}</span>
                <span className="font-medium text-stone-800">{item.value}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── 進捗管理セクション ── */}
        <section className="mb-3 space-y-3">

          {/* 進捗カード */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-stone-700">進捗管理</h2>
                <p className="mt-0.5 text-xs text-stone-400">
                  見積・材料・施工・請求・入金の状態を確認します。
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${getStatusColors(rate)}`}
              >
                {getStatusLabel(rate)}
              </span>
            </div>

            {/* 進捗バー */}
            <div className="mb-1 h-2.5 w-full rounded-full bg-stone-100">
              <div
                className={`h-2.5 rounded-full transition-all ${getBarColor(rate)}`}
                style={{ width: `${rate}%` }}
              />
            </div>
            <p className="mb-4 text-right text-xs text-stone-400">
              進捗率：{rate}%
            </p>

            {/* チェックリスト */}
            <ul className="space-y-1.5">
              {keys.map((key) => {
                const done = progress[key];
                return (
                  <li key={key}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 active:bg-stone-50">
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => toggleProgress(key)}
                        className="h-5 w-5 shrink-0 cursor-pointer accent-[#8B4A3C]"
                      />
                      <span
                        className={`text-sm font-medium ${
                          done ? "text-green-700 line-through" : "text-amber-700"
                        }`}
                      >
                        {key}
                      </span>
                      {done ? (
                        <span className="ml-auto text-xs text-green-500">✓</span>
                      ) : (
                        <span className="ml-auto text-xs text-amber-400">未</span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* 次にやる作業カード */}
          <div className="rounded-2xl bg-[#8B4A3C] p-4 shadow-sm text-white">
            <p className="mb-1 text-xs font-bold text-amber-200">次にやる作業</p>
            <p className="text-base font-bold leading-snug">{nextAction}</p>
          </div>

          {/* 未処理チェック注意カード */}
          <div className="rounded-2xl bg-yellow-50 p-4 shadow-sm ring-1 ring-yellow-200">
            <h3 className="mb-1.5 text-sm font-bold text-yellow-800">
              ⚠️ 未処理チェック
            </h3>
            <p className="text-sm leading-relaxed text-yellow-700">
              注文書返送・材料発注・請求・入金は忘れやすい項目です。
              現場完了後に必ず確認してください。
            </p>
          </div>

          {/* 請求・収支ボタン */}
          <div className="space-y-2.5">
            <Link
              href="/projects/sample/single-invoice"
              className="flex w-full items-center justify-center rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80"
            >
              この案件だけ請求書を作る
            </Link>
            <Link
              href="/projects/sample/invoice"
              className="flex w-full items-center justify-center rounded-2xl border border-[#8B4A3C] bg-white py-4 text-base font-bold text-[#8B4A3C] shadow-sm active:opacity-80"
            >
              一括請求に含める
            </Link>
            <Link
              href="/reports/monthly"
              className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-4 text-base font-bold text-stone-600 shadow-sm active:opacity-80"
            >
              月次収支で確認
            </Link>
          </div>

        </section>
        {/* ── /進捗管理セクション ── */}

        {/* 作業メニュー */}
        <section className="mb-6 space-y-2.5">
          <h2 className="text-sm font-bold text-stone-700">作業メニュー</h2>
          {workButtons.map((btn) => (
            <button
              key={btn.label}
              type="button"
              onClick={() => handleWorkButton(btn.href)}
              className="flex w-full items-center gap-4 rounded-2xl bg-white px-4 py-4 text-left shadow-sm ring-1 ring-stone-100 active:opacity-75"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#fdf0ec] text-2xl">
                {btn.icon}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-base font-bold text-stone-800">{btn.label}</span>
                <span className="text-xs text-stone-500">{btn.desc}</span>
              </span>
              <span className="ml-auto shrink-0 text-stone-300">›</span>
            </button>
          ))}
        </section>

        {/* ホームへ戻る */}
        <div className="pb-8">
          <Link
            href="/"
            className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-4 text-base font-bold text-stone-600 shadow-sm active:opacity-80"
          >
            ホームへ戻る
          </Link>
        </div>

      </div>
    </div>
  );
}
