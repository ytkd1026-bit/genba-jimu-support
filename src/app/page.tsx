"use client";

// TODO: 検索はSupabase連携後に projects / customers / invoices / schedule_events を横断検索する
// TODO: 請求書発行は、案件検索から対象案件を開いて行う設計にする
// TODO: 今週の予定は schedule_events から取得する
// TODO: 進捗管理は project_progress から取得する

import Link from "next/link";
import { useEffect, useState } from "react";
import { getTestMode, TEST_MODE_LABELS, type TestMode } from "@/app/utils/testMode";
import { isSetupCompleted, migrateLegacySetupState } from "@/app/utils/appSetup";
import { isSupabaseConfigured } from "@/app/lib/supabase/client";
import { activeBackend } from "@/app/lib/supabase/backend";
import { authRepository } from "@/app/lib/supabase/authRepository";
import { companyRepository } from "@/app/repositories/companyRepository";
import { countLocalBusinessData, migrateLocalToCloud } from "@/app/repositories/migrationRepository";
import type { Phase1MigrationProgress } from "@/app/lib/supabase/migrationState";

// ─── よく使う作業（作業名で案内） ─────────────────────────────
const primaryActions = [
  { title: "見積を作る",           desc: "元請と工事項目を選ぶだけ。案件登録は自動です。", icon: "📋", href: "/estimate/new" },
  { title: "新しい案件を登録する", desc: "現場名・元請・住所を登録します。",       icon: "📝", href: "/projects/new" },
  { title: "請求書を作る",         desc: "完了した案件の請求書を作ります。",       icon: "📄", href: "/projects/sample/single-invoice" },
  { title: "未請求を確認する",     desc: "請求漏れがないか確認します。",           icon: "⚠️", href: "/invoices/unbilled" },
  { title: "材料を計算する",       desc: "クロス・CF・FTなどの材料を拾います。",   icon: "📐", href: "/projects/sample/materials" },
];

// ─── メニューから探す（従来の機能別入口。ここからも同じ画面へ行ける） ─
const menuButtons = [
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

function MigrationStatusRow({
  label,
  local,
  cloud,
  completed,
}: {
  label: string;
  local: number;
  cloud: number;
  completed: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}：local {local} / cloud {cloud}</span>
      <span className={completed ? "font-bold text-teal-600" : "font-bold text-amber-700"}>
        {completed ? "移行済" : "未移行"}
      </span>
    </div>
  );
}

// ─── コンポーネント ───────────────────────────────────────────
export default function Home() {
  const [mode,    setMode]    = useState<TestMode>("normal");
  const [infoMsg, setInfoMsg] = useState("");
  const [setupDone, setSetupDone] = useState(false); // 判定失敗時も未設定として入口を残す
  const [cloudConfigured, setCloudConfigured] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false); // 表示がクラウド正本か（緑チップ）
  const [showMigrate, setShowMigrate] = useState(false);
  const [localCounts, setLocalCounts] = useState<{ contractors: number; masters: number; company: number }>({ contractors: 0, masters: 0, company: 0 });
  const [migrationProgress, setMigrationProgress] = useState<Phase1MigrationProgress | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState<string | null>(null);

  async function refreshHomeState() {
    // 非同期判定の途中失敗やhydration停止でも、設定済み扱いにしない。
    setSetupDone(false);
    try {
      const configured = isSupabaseConfigured();
      setCloudConfigured(configured);
      let signedIn = false;
      if (configured) {
        const user = await authRepository.getUser();
        setSignedInEmail(user?.email ?? null);
        signedIn = !!user;
      }
      const be = await activeBackend();
      setSyncing(be.mode === "supabase" && signedIn);
      setMigrationProgress(be.migrationProgress);

      const companySetup = await companyRepository.cloudSetupStatus();
      const scopeExists = !!companySetup.userId && !!companySetup.organizationId;
      const companyComplete =
        companySetup.organizationExists &&
        companySetup.companySettingsExists &&
        companySetup.companyNameExists;
      let scopedSetupCompleted = false;
      if (scopeExists && companyComplete) {
        scopedSetupCompleted = isSetupCompleted(companySetup.userId!, companySetup.organizationId!);
        if (!scopedSetupCompleted) {
          scopedSetupCompleted = migrateLegacySetupState(companySetup.userId!, companySetup.organizationId!);
        }
      }
      setSetupDone(scopeExists && companyComplete && scopedSetupCompleted);

      const counts = countLocalBusinessData();
      setLocalCounts(counts);
      setShowMigrate(signedIn && be.needsMigration && be.migrationProgress?.allCompleted !== true);
    } catch {
      setSetupDone(false);
    }
  }

  useEffect(() => {
    // localStorage由来のためSSR初期値にはできない。マウント後に現在モードへ同期する。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(getTestMode());
    void refreshHomeState();
  }, []);

  const isDemo = mode === "demo";

  function showInfo(msg: string) {
    setInfoMsg(msg);
    setTimeout(() => setInfoMsg(""), 4000);
  }

  async function handleMigrate() {
    if (migrating) return;
    setMigrating(true);
    setMigrateMsg("クラウドへ移行中…");
    const res = await migrateLocalToCloud();
    setMigrating(false);
    if (res.ok) {
      setMigrateMsg(`クラウドへ移行しました（会社情報${res.migrated.company ? "1件" : "0件"}・元請${res.migrated.contractors}件・単価${res.migrated.masters}件）。`);
      setShowMigrate(false);
      await refreshHomeState(); // 正本をクラウドへ切替後の状態を再表示
    } else {
      setMigrateMsg(`移行はまだ完了していません：${res.errors[0] ?? "クラウド状態を確認してください。"}`);
      setMigrationProgress(res.progress);
    }
    setTimeout(() => setMigrateMsg(null), 8000);
  }

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-3 sm:max-w-lg">

        {/* アカウント状態（端末間共有） */}
        <div className="mb-2 flex justify-end">
          <Link href="/auth" className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-600 active:opacity-80">
            {cloudConfigured
              ? signedInEmail
                ? syncing
                  ? <><span className="h-2 w-2 rounded-full bg-green-500" />クラウド同期中</>
                  : <><span className="h-2 w-2 rounded-full bg-amber-500" />ログイン中（未移行）</>
                : <><span className="h-2 w-2 rounded-full bg-stone-300" />ログイン</>
              : <><span className="h-2 w-2 rounded-full bg-stone-300" />この端末のみ</>}
          </Link>
        </div>

        {/* クラウド移行バナー（この端末に既存データがあり未移行のとき。移行するまで既存データは消さない） */}
        {showMigrate && (
          <div className="mb-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-amber-300">
            <p className="text-sm font-bold text-stone-800">この端末に既存データがあります。クラウドへ移行してください</p>
            <p className="mt-0.5 text-xs text-stone-500">移行するまで、この端末の自社情報・元請・単価はこれまで通り表示されます。移行すると他の端末（iPhone等）と共有できます。テスト用データの区分は保持されます。</p>
            <div className="mt-2 space-y-1 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600">
              <MigrationStatusRow label="自社情報" local={migrationProgress?.categories.company.localCount ?? localCounts.company} cloud={migrationProgress?.categories.company.cloudCount ?? 0} completed={migrationProgress?.categories.company.completed ?? false} />
              <MigrationStatusRow label="元請" local={migrationProgress?.categories.contractors.localCount ?? localCounts.contractors} cloud={migrationProgress?.categories.contractors.cloudCount ?? 0} completed={migrationProgress?.categories.contractors.completed ?? false} />
              <MigrationStatusRow label="単価マスタ" local={migrationProgress?.categories.unitPrice.localCount ?? localCounts.masters} cloud={migrationProgress?.categories.unitPrice.cloudCount ?? 0} completed={migrationProgress?.categories.unitPrice.completed ?? false} />
              {migrationProgress && !migrationProgress.cloudLoaded && <p className="pt-1 font-bold text-red-600">クラウド件数を取得できませんでした。接続を確認してください。</p>}
            </div>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={handleMigrate} disabled={migrating} className="min-h-[44px] flex-1 rounded-xl bg-[#8B4A3C] px-3 py-2 text-xs font-bold text-white active:opacity-80 disabled:opacity-50">{migrating ? "移行中…" : "クラウドへ移行する"}</button>
              <button type="button" onClick={() => setShowMigrate(false)} className="min-h-[44px] rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-500 active:opacity-80">後で</button>
            </div>
          </div>
        )}
        {migrateMsg && <div className="mb-3 rounded-xl bg-stone-50 px-3 py-2 text-xs font-bold text-stone-600 ring-1 ring-stone-200">{migrateMsg}</div>}

        {/* ヘッダー */}
        <header className="mb-3 text-center">
          <h1 className="text-2xl font-bold text-stone-800 tracking-wide">現場の事務サポ</h1>
          <p className="mt-0.5 text-sm text-stone-500">見積・材料・請求・予定を、スマホでひとまとめ。</p>
        </header>

        {/* 初期設定バナー（未完了のときのみ） */}
        {!setupDone && (
          <Link href="/setup" className="mb-3 flex items-center gap-3 rounded-2xl bg-[#1e3a5f] px-4 py-3.5 text-white shadow-sm active:opacity-80">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xl">⚙️</span>
            <div className="min-w-0">
              <p className="text-sm font-bold">はじめに初期設定をしましょう</p>
              <p className="mt-0.5 text-xs leading-snug text-blue-100">自社情報・元請・単価を一度登録すれば、見積が毎回すぐ作れます。</p>
            </div>
            <span className="ml-auto shrink-0 text-white/50">›</span>
          </Link>
        )}

        {/* よく使う作業（作業名で案内） */}
        <section className="mb-3 space-y-2">
          <h2 className="px-1 text-xs font-bold text-stone-400">よく使う作業</h2>
          {primaryActions.map((action) => (
            <Link
              key={action.title}
              href={action.href}
              className="flex items-center gap-3 rounded-2xl bg-[#8B4A3C] px-4 py-3.5 text-white shadow-sm active:opacity-80"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xl">
                {action.icon}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold">{action.title}</p>
                <p className="mt-0.5 text-xs leading-snug text-amber-100">{action.desc}</p>
              </div>
              <span className="ml-auto shrink-0 text-white/50">›</span>
            </Link>
          ))}
        </section>

        {/* スキャン登録 エントリー */}
        <Link
          href="/scan"
          className="mb-1.5 flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-stone-100 active:opacity-75"
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
        <Link
          href="/scan/drafts"
          className="mb-3 flex items-center justify-between rounded-2xl bg-white px-4 py-2.5 shadow-sm ring-1 ring-stone-100 active:opacity-75"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#fdf0ec] text-sm">
              📋
            </span>
            <p className="text-sm font-bold text-stone-600">スキャン下書き一覧</p>
          </div>
          <span className="text-stone-300 text-sm">›</span>
        </Link>

        {/* メニューから探す（機能別の入口。よく使う作業と同じ画面へ行けます） */}
        <section className="mb-3">
          <h2 className="mb-2 px-1 text-xs font-bold text-stone-400">メニューから探す</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {menuButtons.map((btn) => (
              <Link
                key={btn.label}
                href={btn.href}
                className="flex min-h-[76px] w-full flex-col items-center justify-center gap-0.5 rounded-2xl bg-white px-3 py-3 text-stone-700 shadow-sm ring-1 ring-stone-100 active:opacity-80"
              >
                <span className="text-2xl leading-none">{btn.icon}</span>
                <span className="text-sm font-bold">{btn.label}</span>
                <span className="text-center text-xs text-stone-400 leading-tight">{btn.desc}</span>
              </Link>
            ))}
          </div>
        </section>

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
              <Link href="/setup" className="flex items-center justify-between rounded-xl px-2 py-2.5 active:bg-stone-50">
                <div>
                  <p className="text-sm font-bold text-stone-700">🚀 初期設定・基本設定</p>
                  <p className="text-xs text-stone-400">自社情報・元請・単価をまとめて登録</p>
                </div>
                <span className="text-stone-300">›</span>
              </Link>
              <Link href="/settings/company" className="flex items-center justify-between rounded-xl px-2 py-2.5 active:bg-stone-50">
                <div>
                  <p className="text-sm font-bold text-stone-700">⚙️ 事業者設定</p>
                  <p className="text-xs text-stone-400">自社情報・振込先・インボイス番号・標準粗利率</p>
                </div>
                <span className="text-stone-300">›</span>
              </Link>
              <Link href="/settings/contractors" className="flex items-center justify-between rounded-xl px-2 py-2.5 active:bg-stone-50">
                <div>
                  <p className="text-sm font-bold text-stone-700">🏢 元請マスタ</p>
                  <p className="text-xs text-stone-400">元請を登録して見積で選ぶだけにする</p>
                </div>
                <span className="text-stone-300">›</span>
              </Link>
              <Link href="/settings/unit-master" className="flex items-center justify-between rounded-xl px-2 py-2.5 active:bg-stone-50">
                <div>
                  <p className="text-sm font-bold text-stone-700">💴 単価マスタ</p>
                  <p className="text-xs text-stone-400">自社単価を登録・編集する</p>
                </div>
                <span className="text-stone-300">›</span>
              </Link>
              <Link href="/settings/dev-data" className="flex items-center justify-between rounded-xl px-2 py-2.5 active:bg-stone-50">
                <div>
                  <p className="text-sm font-bold text-stone-700">🧹 テストデータ管理</p>
                  <p className="text-xs text-stone-400">テスト用に登録したデータを一括削除</p>
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
                <button type="button"
                  onClick={() => showInfo("テンプレ集は次工程で実装します。")}
                  className="flex-1 rounded-xl border border-stone-200 py-2 text-xs font-bold text-stone-400 active:opacity-70">
                  📋 テンプレ集
                </button>
                <button type="button"
                  onClick={() => showInfo("使い方ガイドは次工程で実装します。")}
                  className="flex-1 rounded-xl border border-stone-200 py-2 text-xs font-bold text-stone-400 active:opacity-70">
                  📖 使い方を見る
                </button>
              </div>
              {infoMsg && (
                <div className="mx-2 mt-1 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500 ring-1 ring-stone-200">
                  {infoMsg}
                </div>
              )}
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
