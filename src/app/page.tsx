"use client";

// TODO: 検索はSupabase連携後に projects / customers / invoices / schedule_events を横断検索する
// TODO: 請求書発行は、案件検索から対象案件を開いて行う設計にする
// TODO: 今週の予定は schedule_events から取得する
// TODO: 進捗管理は project_progress から取得する

import Link from "next/link";
import { useEffect, useState } from "react";
import { getTestMode, TEST_MODE_LABELS, type TestMode } from "@/app/utils/testMode";

// ─── 主要ボタン ───────────────────────────────────────────────
const mainButtons = [
  { label: "案件検索・登録",   desc: "案件を探す・新しく作る",   icon: "🔍", href: "/projects/register" },
  { label: "請求書関係",       desc: "未請求確認・請求書作成",   icon: "📄", href: "/invoices" },
  { label: "見積・注文書関係", desc: "見積書・注文書を作成",     icon: "📝", href: "/estimates" },
  { label: "材料・発注管理",   desc: "材料計算・発注確認",       icon: "📦", href: "/materials" },
  { label: "スケジュール",     desc: "カレンダーで予定を確認",   icon: "📅", href: "/schedule" },
  { label: "月次収支報告",     desc: "売上・支出・未請求を確認", icon: "📊", href: "/reports/monthly" },
];

// ─── デモ用仮データ ────────────────────────────────────────────
const progressCases = [
  { name: "〇〇マンション クロス貼替", status: "見積中" },
  { name: "△△邸 CF貼替",             status: "請求待ち" },
];

const weeklyEvents = [
  { date: "2026/06/01", weekday: "月", time: "09:00", kind: "現調",    project: "〇〇マンション クロス貼替" },
  { date: "2026/06/02", weekday: "火", time: "10:00", kind: "材料搬入", project: "△△邸 CF貼替" },
  { date: "2026/06/03", weekday: "水", time: "08:30", kind: "施工",    project: "〇〇マンション クロス貼替" },
  { date: "2026/06/05", weekday: "金", time: "17:00", kind: "請求",    project: "□□店舗 床補修" },
];

const unprocessed = [
  { label: "見積未提出", count: 2 },
  { label: "請求待ち",   count: 1 },
];

const monthlySummary = [
  { label: "売上", amount: "450,000円" },
  { label: "支出", amount: "180,000円" },
  { label: "粗利", amount: "270,000円" },
];

// ─── バッジ色 ─────────────────────────────────────────────────
const KIND_STYLE: Record<string, string> = {
  現調:     "bg-blue-100 text-blue-800",
  施工:     "bg-[#8B4A3C]/10 text-[#8B4A3C]",
  材料発注: "bg-amber-100 text-amber-800",
  材料搬入: "bg-orange-100 text-orange-800",
  請求:     "bg-purple-100 text-purple-800",
  入金予定: "bg-green-100 text-green-800",
};

const STATUS_STYLE: Record<string, string> = {
  見積中:   "bg-amber-100 text-amber-800",
  請求待ち: "bg-red-100 text-red-700",
  入金予定: "bg-green-100 text-green-700",
  入金済み: "bg-stone-100 text-stone-600",
};

// ─── コンポーネント ───────────────────────────────────────────
export default function Home() {
  const [mode, setMode] = useState<TestMode>("normal");

  useEffect(() => {
    setMode(getTestMode());
  }, []);

  const isDemo = mode === "demo";

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-3 sm:max-w-lg">

        {/* ヘッダー */}
        <header className="mb-3 text-center">
          <h1 className="text-2xl font-bold text-stone-800 tracking-wide">現場の事務サポ</h1>
          <p className="mt-0.5 text-sm text-stone-500">見積・材料・請求・予定を、スマホでひとまとめ。</p>
        </header>

        {/* メインボタン 2×3 */}
        <section className="mb-3 grid grid-cols-2 gap-2.5">
          {mainButtons.map((btn) => (
            <Link
              key={btn.label}
              href={btn.href}
              className="flex min-h-[76px] w-full flex-col items-center justify-center gap-0.5 rounded-2xl bg-[#8B4A3C] px-3 py-3 text-white shadow-sm active:opacity-80"
            >
              <span className="text-2xl leading-none">{btn.icon}</span>
              <span className="text-sm font-bold">{btn.label}</span>
              <span className="text-center text-xs text-amber-100 leading-tight">{btn.desc}</span>
            </Link>
          ))}
        </section>

        {/* スキャン登録 エントリー */}
        <Link
          href="/scan"
          className="mb-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-stone-100 active:opacity-75"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fdf0ec] text-xl">
              📷
            </span>
            <div>
              <p className="text-sm font-bold text-stone-800">スキャン登録</p>
              <p className="text-xs text-stone-400">PDF・画像・レシートを読み取る</p>
            </div>
          </div>
          <span className="text-stone-300">›</span>
        </Link>

        {/* 情報カード一覧 */}
        <section className="space-y-2.5">

          {/* 未請求一覧へのショートカット */}
          <Link
            href="/invoices/unbilled"
            className="flex items-center justify-between rounded-2xl bg-[#fff8f5] p-3 shadow-sm ring-1 ring-[#8B4A3C]/20 active:opacity-75"
          >
            <div>
              <p className="text-sm font-bold text-[#8B4A3C]">⚠️ 未請求一覧</p>
              <p className="text-xs text-stone-500">請求漏れを確認・請求書を作る</p>
            </div>
            <span className="text-stone-300 text-lg">›</span>
          </Link>

          {isDemo ? (
            <>
              {/* 進捗管理 */}
              <div className="rounded-2xl bg-white p-3 shadow-sm">
                <h2 className="mb-0.5 border-b border-stone-100 pb-1.5 text-sm font-bold text-stone-700">進捗管理</h2>
                <p className="mb-2 text-xs text-stone-400">進行中の案件状態を確認します。</p>
                <ul className="space-y-1.5">
                  {progressCases.map((c) => (
                    <li key={c.name} className="flex items-center justify-between text-sm">
                      <span className="text-stone-800">{c.name}</span>
                      <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[c.status] ?? "bg-stone-100 text-stone-600"}`}>
                        {c.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 今週の予定 */}
              <div className="rounded-2xl bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between border-b border-stone-100 pb-1.5">
                  <h2 className="text-sm font-bold text-stone-700">今週の予定</h2>
                  <Link href="/schedule" className="text-xs text-[#8B4A3C] hover:opacity-75">スケジュールを見る →</Link>
                </div>
                <div className="space-y-2">
                  {weeklyEvents.map((ev, i) => (
                    <div key={i} className="rounded-xl border border-stone-100 bg-stone-50 px-3 py-2">
                      <p className="mb-1 text-xs font-bold text-stone-500">{ev.date}（{ev.weekday}）</p>
                      <div className="flex items-center gap-2">
                        <span className="w-10 shrink-0 text-xs text-stone-400">{ev.time}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${KIND_STYLE[ev.kind] ?? "bg-stone-100 text-stone-600"}`}>
                          {ev.kind}
                        </span>
                        <span className="text-sm text-stone-700 leading-tight">{ev.project}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 未処理 */}
              <div className="rounded-2xl bg-[#fff8f5] p-3 shadow-sm ring-1 ring-[#8B4A3C]/20">
                <h2 className="mb-2 border-b border-[#8B4A3C]/15 pb-1.5 text-sm font-bold text-[#8B4A3C]">⚠️ 未処理</h2>
                <ul className="space-y-1.5">
                  {unprocessed.map((u) => (
                    <li key={u.label} className="flex items-center justify-between">
                      <span className="text-sm text-stone-800">{u.label}</span>
                      <span className="rounded-full bg-[#8B4A3C] px-3 py-0.5 text-sm font-bold text-white">{u.count}件</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 今月の数字 */}
              <div className="rounded-2xl bg-white p-3 shadow-sm">
                <h2 className="mb-2 border-b border-stone-100 pb-1.5 text-sm font-bold text-stone-700">今月の数字</h2>
                <ul className="space-y-1.5">
                  {monthlySummary.map((m) => (
                    <li key={m.label} className="flex items-center justify-between text-sm">
                      <span className="text-stone-500">{m.label}</span>
                      <span className="font-bold text-stone-800">{m.amount}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-stone-200 px-4 py-8 text-center">
              <p className="text-sm text-stone-500">まだ案件・請求・予定は登録されていません。</p>
              <p className="mt-1.5 text-sm text-stone-500">まずは「スキャン登録」または「案件検索・登録」から始めてください。</p>
            </div>
          )}

          {/* 管理メニュー（小さめリンク） */}
          <div className="rounded-2xl bg-white p-3 shadow-sm">
            <h2 className="mb-2 border-b border-stone-100 pb-1.5 text-xs font-bold uppercase tracking-wide text-stone-400">
              管理
            </h2>
            <div className="space-y-1">
              <Link href="/settings/company" className="flex items-center justify-between rounded-xl px-2 py-2.5 active:bg-stone-50">
                <div>
                  <p className="text-sm font-bold text-stone-700">⚙️ 事業者設定</p>
                  <p className="text-xs text-stone-400">自社情報・振込先・インボイス番号</p>
                </div>
                <span className="text-stone-300">›</span>
              </Link>
              <Link href="/test-mode" className="flex items-center justify-between rounded-xl px-2 py-2.5 active:bg-stone-50">
                <div>
                  <p className="text-sm font-bold text-stone-700">🧪 初回ユーザーテストモード</p>
                  <p className="text-xs text-stone-400">職人仲間向けのテストプレイ設定</p>
                </div>
                <span className="text-stone-300">›</span>
              </Link>
              <div className="flex gap-2 px-2 pt-1">
                <button type="button" className="flex-1 rounded-xl border border-stone-200 py-2 text-xs font-bold text-stone-400 active:opacity-70">
                  📋 テンプレ集
                </button>
                <button type="button" className="flex-1 rounded-xl border border-stone-200 py-2 text-xs font-bold text-stone-400 active:opacity-70">
                  📖 使い方を見る
                </button>
              </div>
            </div>
          </div>

        </section>

        {/* 現在のモード表示 */}
        <div className="mt-4 mb-2 text-center">
          <p className="text-xs text-stone-400">現在：{TEST_MODE_LABELS[mode]}</p>
        </div>

      </div>
    </div>
  );
}
