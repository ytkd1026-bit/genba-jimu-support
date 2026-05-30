"use client";

// TODO: Supabase連携後、schedule_events テーブルに予定を保存する
// TODO: projects の現調予定日、施工予定日、請求日、入金予定日と連動する
// TODO: 材料発注画面の搬入予定日と連動する
// TODO: Googleカレンダー連携を検討する
// TODO: ホーム画面の「今週の予定」はこの schedule_events から取得する

// TODO: 本実装では施工予定日から3日前を基準に材料発注アラートを出す。
// TODO: 3日前が土日祝にかかる場合、木曜17:00または金曜09:00に前倒し警告する。
// TODO: 日本の祝日判定は後工程で holiday-jp 等のライブラリまたは祝日マスタで対応する。
// TODO: Push通知・LINE通知・メール通知は次工程で対応する。

import Link from "next/link";

// ─── 型定義 ──────────────────────────────────────────────────

type EventKind =
  | "現調"
  | "施工"
  | "材料発注"
  | "材料搬入"
  | "請求"
  | "入金予定";

type EventStatus = "予定" | "未確認" | "要確認" | "未入金" | "完了";

type MaterialOrderStatus = "未発注" | "発注済み";
type AlertType = "施工3日前" | "土日祝前倒し" | "確認済み";

interface ScheduleEvent {
  id: string;
  date: string;
  weekday: string;
  time: string;
  kind: EventKind;
  projectName: string;
  clientName: string;
  siteAddress: string;
  status: EventStatus;
}

interface MaterialAlert {
  id: string;
  projectName: string;
  contractorName: string;
  constructionDate: string;
  materialOrderStatus: MaterialOrderStatus;
  materialDeliveryDate: string;
  alertType: AlertType;
  alertDate: string;
  alertMessage: string;
}

interface AlertItem {
  id: string;
  projectName: string;
  message: string;
}

// ─── 仮データ ─────────────────────────────────────────────────

const TODAY_EVENTS: { time: string; projectName: string; kind: EventKind }[] = [
  { time: "09:00", projectName: "〇〇マンション クロス貼替", kind: "現調" },
  { time: "13:00", projectName: "△△邸 CF貼替",             kind: "材料発注" },
  { time: "17:00", projectName: "□□店舗 床補修",           kind: "請求" },
];

// 材料発注アラート仮データ
// alertType: "施工3日前"     → 施工日3日前で未発注
// alertType: "土日祝前倒し"  → 土日祝が挟まるため前倒しで警告
// alertType: "確認済み"      → 発注済み
const MATERIAL_ALERTS: MaterialAlert[] = [
  {
    id: "ma-1",
    projectName: "〇〇マンション クロス貼替",
    contractorName: "△△工務店",
    constructionDate: "2026/06/03",
    materialOrderStatus: "未発注",
    materialDeliveryDate: "2026/06/02",
    alertType: "施工3日前",
    alertDate: "2026/05/31",
    alertMessage: "施工日の3日前です。材料発注を確認してください。",
  },
  {
    id: "ma-2",
    projectName: "△△邸 CF貼替",
    contractorName: "△△工務店",
    constructionDate: "2026/06/09",
    materialOrderStatus: "未発注",
    materialDeliveryDate: "未定",
    alertType: "土日祝前倒し",
    alertDate: "2026/06/06 09:00",
    alertMessage: "土日を挟むため、金曜9:00までに材料発注を確認してください。",
  },
  {
    id: "ma-3",
    projectName: "□□店舗 床補修",
    contractorName: "□□リフォーム",
    constructionDate: "2026/06/10",
    materialOrderStatus: "発注済み",
    materialDeliveryDate: "2026/06/09",
    alertType: "確認済み",
    alertDate: "-",
    alertMessage: "材料発注済みです。搬入予定日を確認してください。",
  },
];

const WEEK_EVENTS: ScheduleEvent[] = [
  {
    id: "ev-1",
    date: "2026/06/01", weekday: "月",
    time: "09:00", kind: "現調",
    projectName: "〇〇マンション クロス貼替",
    clientName: "△△工務店",
    siteAddress: "大阪府堺市〇〇区",
    status: "予定",
  },
  {
    id: "ev-2",
    date: "2026/06/02", weekday: "火",
    time: "10:00", kind: "材料搬入",
    projectName: "△△邸 CF貼替",
    clientName: "△△工務店",
    siteAddress: "大阪府堺市△△区",
    status: "未確認",
  },
  {
    id: "ev-3",
    date: "2026/06/03", weekday: "水",
    time: "08:30", kind: "施工",
    projectName: "〇〇マンション クロス貼替",
    clientName: "△△工務店",
    siteAddress: "大阪府堺市〇〇区",
    status: "予定",
  },
  {
    id: "ev-4",
    date: "2026/06/05", weekday: "金",
    time: "17:00", kind: "請求",
    projectName: "□□店舗 床補修",
    clientName: "□□リフォーム",
    siteAddress: "大阪府大阪市□□区",
    status: "要確認",
  },
  {
    id: "ev-5",
    date: "2026/06/30", weekday: "火",
    time: "-", kind: "入金予定",
    projectName: "△△工務店 5月分一括請求",
    clientName: "△△工務店",
    siteAddress: "-",
    status: "未入金",
  },
];

// 要確認：材料発注アラートの未発注・前倒し分を先頭に追加
const ALERT_ITEMS: AlertItem[] = [
  {
    id: "al-mat-1",
    projectName: "△△邸 CF貼替",
    message: "土日を挟むため、金曜9:00までに材料発注を確認してください。",
  },
  {
    id: "al-mat-2",
    projectName: "〇〇マンション クロス貼替",
    message: "施工日の3日前です。材料発注を確認してください。",
  },
  { id: "al-1", projectName: "△△邸 CF貼替",              message: "材料搬入日を確認してください。" },
  { id: "al-2", projectName: "〇〇マンション クロス貼替", message: "注文書返送待ちです。" },
  { id: "al-3", projectName: "△△工務店 5月分一括請求",   message: "2026/06/30 入金予定です。" },
];

// ─── 種別カラー ───────────────────────────────────────────────

const KIND_STYLE: Record<EventKind, string> = {
  現調:     "bg-blue-100 text-blue-800",
  施工:     "bg-[#8B4A3C]/10 text-[#8B4A3C]",
  材料発注: "bg-amber-100 text-amber-800",
  材料搬入: "bg-orange-100 text-orange-800",
  請求:     "bg-purple-100 text-purple-800",
  入金予定: "bg-green-100 text-green-800",
};

const STATUS_STYLE: Record<EventStatus, string> = {
  予定:   "bg-stone-100 text-stone-600",
  未確認: "bg-amber-100 text-amber-800",
  要確認: "bg-red-100 text-red-700",
  未入金: "bg-amber-100 text-amber-800",
  完了:   "bg-green-100 text-green-700",
};

// 材料アラートカードのスタイル
function materialAlertCardStyle(alert: MaterialAlert): string {
  if (alert.alertType === "土日祝前倒し") return "bg-red-50 ring-1 ring-red-300";
  if (alert.materialOrderStatus === "未発注")  return "bg-amber-50 ring-1 ring-amber-300";
  return "bg-green-50 ring-1 ring-green-200";
}

function materialAlertBadgeStyle(alert: MaterialAlert): string {
  if (alert.alertType === "土日祝前倒し") return "bg-red-100 text-red-800";
  if (alert.materialOrderStatus === "未発注")  return "bg-amber-100 text-amber-800";
  return "bg-green-100 text-green-800";
}

function materialOrderBadgeStyle(status: MaterialOrderStatus): string {
  return status === "発注済み"
    ? "bg-green-100 text-green-800"
    : "bg-red-100 text-red-700";
}

// ─── ハンドラー ───────────────────────────────────────────────

function handleViewSwitch() {
  alert("表示切替は次工程で追加します。");
}

function handleAddEvent() {
  alert("予定追加機能は次工程で追加します。");
}

// ─── ページ ───────────────────────────────────────────────────

export default function SchedulePage() {
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
          <h1 className="text-xl font-bold text-stone-800">スケジュール</h1>
          <p className="mt-1 text-sm text-stone-500">
            現調・施工・材料・請求・入金予定を確認します。
          </p>
        </header>

        <div className="space-y-3">

          {/* ── 今日の予定 ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">
              今日の予定
            </h2>
            {TODAY_EVENTS.length === 0 ? (
              <p className="text-sm text-stone-400">今日の予定はありません。</p>
            ) : (
              <ul className="space-y-2">
                {TODAY_EVENTS.map((ev, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <span className="w-12 shrink-0 text-xs font-bold text-stone-500">{ev.time}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${KIND_STYLE[ev.kind]}`}>
                      {ev.kind}
                    </span>
                    <span className="text-sm text-stone-800">{ev.projectName}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── 材料発注アラート ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-0.5 border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">
              🔔 材料発注アラート
            </h2>
            <p className="mb-3 text-xs text-stone-400">
              施工日から逆算して、材料発注の確認が必要な案件を表示します。
            </p>
            <div className="space-y-2.5">
              {MATERIAL_ALERTS.map((alert) => (
                <div
                  key={alert.id}
                  className={`rounded-xl p-3 ${materialAlertCardStyle(alert)}`}
                >
                  {/* バッジ行 */}
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${materialAlertBadgeStyle(alert)}`}>
                      {alert.alertType}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${materialOrderBadgeStyle(alert.materialOrderStatus)}`}>
                      {alert.materialOrderStatus}
                    </span>
                    {alert.alertDate !== "-" && (
                      <span className="ml-auto text-xs text-stone-500">
                        ⏰ {alert.alertDate}
                      </span>
                    )}
                  </div>

                  {/* 案件名・元請 */}
                  <p className="mb-1 text-sm font-bold text-stone-800 leading-tight">
                    {alert.projectName}
                  </p>
                  <p className="mb-0.5 text-xs text-stone-400">{alert.contractorName}</p>

                  {/* 施工日・搬入日 */}
                  <div className="mb-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="text-xs text-stone-500">
                      施工日：{alert.constructionDate}
                    </span>
                    <span className="text-xs text-stone-500">
                      搬入予定：{alert.materialDeliveryDate}
                    </span>
                  </div>

                  {/* メッセージ */}
                  <p className={`mb-2 text-sm font-bold leading-snug ${
                    alert.alertType === "土日祝前倒し"
                      ? "text-red-700"
                      : alert.materialOrderStatus === "未発注"
                        ? "text-amber-800"
                        : "text-green-700"
                  }`}>
                    {alert.alertMessage}
                  </p>

                  {/* 案件を見るボタン */}
                  <Link
                    href="/projects/sample"
                    className="inline-flex items-center gap-1 rounded-lg bg-[#8B4A3C]/10 px-3 py-1.5 text-xs font-bold text-[#8B4A3C] active:opacity-70"
                  >
                    案件を見る →
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* ── 今週の予定 ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">
              今週の予定
            </h2>
            <div className="space-y-2.5">
              {WEEK_EVENTS.map((ev) => (
                <div
                  key={ev.id}
                  className="rounded-xl border border-stone-100 bg-stone-50 p-3"
                >
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-bold text-stone-500">
                      {ev.date}（{ev.weekday}）
                    </span>
                    {ev.time !== "-" && (
                      <span className="text-xs text-stone-400">{ev.time}</span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${KIND_STYLE[ev.kind]}`}>
                      {ev.kind}
                    </span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[ev.status]}`}>
                      {ev.status}
                    </span>
                  </div>
                  <p className="mb-0.5 text-sm font-bold text-stone-800 leading-tight">
                    {ev.projectName}
                  </p>
                  <p className="text-xs text-stone-400">{ev.clientName}</p>
                  {ev.siteAddress !== "-" && (
                    <p className="text-xs text-stone-400">{ev.siteAddress}</p>
                  )}
                  <div className="mt-2">
                    <Link
                      href="/projects/sample"
                      className="inline-flex items-center gap-1 rounded-lg bg-[#8B4A3C]/10 px-3 py-1.5 text-xs font-bold text-[#8B4A3C] active:opacity-70"
                    >
                      案件を見る →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── 要確認（材料発注アラート含む） ── */}
          <div className="rounded-2xl bg-yellow-50 p-4 shadow-sm ring-1 ring-yellow-200">
            <h2 className="mb-3 border-b border-yellow-200 pb-2 text-sm font-bold text-yellow-800">
              ⚠️ 要確認
            </h2>
            <ul className="space-y-2.5">
              {ALERT_ITEMS.map((item) => (
                <li key={item.id} className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="mb-0.5 text-xs font-bold text-stone-600">{item.projectName}</p>
                  <p className="text-sm text-amber-800">{item.message}</p>
                  <div className="mt-1.5">
                    <Link
                      href="/projects/sample"
                      className="inline-flex items-center gap-1 rounded-lg bg-[#8B4A3C]/10 px-3 py-1.5 text-xs font-bold text-[#8B4A3C] active:opacity-70"
                    >
                      案件を見る →
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* ── 表示切替ボタン ── */}
          <div className="flex gap-2">
            {(["今日", "今週", "今月"] as const).map((label) => (
              <button
                key={label}
                type="button"
                onClick={handleViewSwitch}
                className="flex-1 rounded-xl border border-stone-200 bg-white py-2.5 text-sm font-bold text-stone-600 shadow-sm active:opacity-70"
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── 予定を追加 ── */}
          <button
            type="button"
            onClick={handleAddEvent}
            className="w-full rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80"
          >
            ＋ 予定を追加
          </button>

          {/* ── 通知機能について ── */}
          <div className="rounded-2xl bg-stone-50 p-4 shadow-sm ring-1 ring-stone-200">
            <h3 className="mb-1.5 text-sm font-bold text-stone-600">📵 通知機能について</h3>
            <p className="text-sm leading-relaxed text-stone-500">
              現在は画面上の警告表示のみです。
              今後、LINE通知・メール通知・Googleカレンダー通知に対応予定です。
            </p>
          </div>

          {/* ── ホームへ戻る ── */}
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
    </div>
  );
}
