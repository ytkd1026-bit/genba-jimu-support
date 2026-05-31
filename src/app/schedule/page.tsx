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
import { useState } from "react";

// ─── 定数 ────────────────────────────────────────────────────
const CALENDAR_YEAR        = 2026;
const CALENDAR_MONTH       = 6;
const CALENDAR_MONTH_LABEL = "2026年6月";
const DAYS_IN_MONTH        = 30;
const MONTH_START_OFFSET   = 0; // June 1, 2026 = Monday → col 0

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"] as const;

// ─── 型定義 ──────────────────────────────────────────────────
type EventKind =
  | "現調" | "施工" | "材料発注" | "材料搬入" | "請求" | "入金予定";

type EventStatus = "予定" | "未確認" | "要確認" | "未入金" | "完了";
type MaterialOrderStatus = "未発注" | "発注済み";
type AlertType = "施工3日前" | "土日祝前倒し" | "確認済み";
type CalBadge = "現調" | "施工" | "材料" | "請求" | "入金" | "警告";

interface ScheduleEvent {
  id: string;
  date: string;        // "YYYY/MM/DD"
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
  constructionDate: string; // "YYYY/MM/DD"
  materialOrderStatus: MaterialOrderStatus;
  materialDeliveryDate: string;
  alertType: AlertType;
  alertDate: string;
  alertMessage: string;
}

// ─── 仮データ ─────────────────────────────────────────────────
const MONTH_EVENTS: ScheduleEvent[] = [
  {
    id: "ev-1", date: "2026/06/01", weekday: "月", time: "09:00", kind: "現調",
    projectName: "〇〇マンション クロス貼替", clientName: "△△工務店",
    siteAddress: "大阪府堺市〇〇区", status: "予定",
  },
  {
    id: "ev-2", date: "2026/06/02", weekday: "火", time: "10:00", kind: "材料搬入",
    projectName: "△△邸 CF貼替", clientName: "△△工務店",
    siteAddress: "大阪府堺市△△区", status: "未確認",
  },
  {
    id: "ev-3", date: "2026/06/03", weekday: "水", time: "08:30", kind: "施工",
    projectName: "〇〇マンション クロス貼替", clientName: "△△工務店",
    siteAddress: "大阪府堺市〇〇区", status: "予定",
  },
  {
    id: "ev-4", date: "2026/06/05", weekday: "金", time: "17:00", kind: "請求",
    projectName: "□□店舗 床補修", clientName: "□□リフォーム",
    siteAddress: "大阪府大阪市□□区", status: "要確認",
  },
  {
    id: "ev-5", date: "2026/06/09", weekday: "火", time: "08:00", kind: "施工",
    projectName: "△△邸 CF貼替", clientName: "△△工務店",
    siteAddress: "大阪府堺市△△区", status: "予定",
  },
  {
    id: "ev-6", date: "2026/06/10", weekday: "水", time: "09:00", kind: "施工",
    projectName: "□□店舗 床補修", clientName: "□□リフォーム",
    siteAddress: "大阪府大阪市□□区", status: "予定",
  },
  {
    id: "ev-7", date: "2026/06/12", weekday: "金", time: "10:00", kind: "現調",
    projectName: "◇◇マンション 雑工事", clientName: "〇〇建設",
    siteAddress: "大阪府堺市□□区", status: "予定",
  },
  {
    id: "ev-8", date: "2026/06/15", weekday: "月", time: "09:00", kind: "材料搬入",
    projectName: "◇◇マンション 雑工事", clientName: "〇〇建設",
    siteAddress: "大阪府堺市□□区", status: "未確認",
  },
  {
    id: "ev-9", date: "2026/06/17", weekday: "水", time: "08:30", kind: "施工",
    projectName: "◇◇マンション 雑工事", clientName: "〇〇建設",
    siteAddress: "大阪府堺市□□区", status: "予定",
  },
  {
    id: "ev-10", date: "2026/06/20", weekday: "土", time: "-", kind: "材料発注",
    projectName: "△△邸 CF貼替", clientName: "△△工務店",
    siteAddress: "大阪府堺市△△区", status: "未確認",
  },
  {
    id: "ev-11", date: "2026/06/25", weekday: "木", time: "17:00", kind: "請求",
    projectName: "◇◇マンション 雑工事", clientName: "〇〇建設",
    siteAddress: "大阪府堺市□□区", status: "予定",
  },
  {
    id: "ev-12", date: "2026/06/30", weekday: "火", time: "-", kind: "入金予定",
    projectName: "△△工務店 5月分一括請求", clientName: "△△工務店",
    siteAddress: "-", status: "未入金",
  },
];

const MATERIAL_ALERTS: MaterialAlert[] = [
  {
    id: "ma-1",
    projectName: "〇〇マンション クロス貼替", contractorName: "△△工務店",
    constructionDate: "2026/06/03", materialOrderStatus: "未発注",
    materialDeliveryDate: "2026/06/02", alertType: "施工3日前",
    alertDate: "2026/05/31",
    alertMessage: "施工日の3日前です。材料発注を確認してください。",
  },
  {
    id: "ma-2",
    projectName: "△△邸 CF貼替", contractorName: "△△工務店",
    constructionDate: "2026/06/09", materialOrderStatus: "未発注",
    materialDeliveryDate: "未定", alertType: "土日祝前倒し",
    alertDate: "2026/06/06 09:00",
    alertMessage: "土日を挟むため、金曜9:00までに材料発注を確認してください。",
  },
  {
    id: "ma-3",
    projectName: "□□店舗 床補修", contractorName: "□□リフォーム",
    constructionDate: "2026/06/10", materialOrderStatus: "発注済み",
    materialDeliveryDate: "2026/06/09", alertType: "確認済み",
    alertDate: "-",
    alertMessage: "材料発注済みです。搬入予定日を確認してください。",
  },
];

// ─── スタイル ─────────────────────────────────────────────────
const CAL_BADGE_STYLE: Record<CalBadge, string> = {
  現調: "bg-blue-100 text-blue-800",
  施工: "bg-[#8B4A3C]/10 text-[#8B4A3C]",
  材料: "bg-amber-100 text-amber-800",
  請求: "bg-purple-100 text-purple-800",
  入金: "bg-green-100 text-green-800",
  警告: "bg-red-100 text-red-700",
};

const CAL_BADGE_KEYS: CalBadge[] = ["現調", "施工", "材料", "請求", "入金", "警告"];

const KIND_TO_CAL: Record<EventKind, CalBadge> = {
  現調:     "現調",
  施工:     "施工",
  材料発注: "材料",
  材料搬入: "材料",
  請求:     "請求",
  入金予定: "入金",
};

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

// ─── ユーティリティ ───────────────────────────────────────────
function parseDateToDayNum(dateStr: string): number | null {
  const normalized = dateStr.replace(/-/g, "/");
  const parts = normalized.split("/");
  if (parts.length < 3) return null;
  const y = parseInt(parts[0]);
  const m = parseInt(parts[1]);
  const d = parseInt(parts[2]);
  if (y === CALENDAR_YEAR && m === CALENDAR_MONTH) return d;
  return null;
}

function materialAlertCardStyle(al: MaterialAlert): string {
  if (al.alertType === "土日祝前倒し")       return "bg-red-50 ring-1 ring-red-300";
  if (al.materialOrderStatus === "未発注") return "bg-amber-50 ring-1 ring-amber-300";
  return "bg-green-50 ring-1 ring-green-200";
}
function materialAlertBadgeStyle(al: MaterialAlert): string {
  if (al.alertType === "土日祝前倒し")       return "bg-red-100 text-red-800";
  if (al.materialOrderStatus === "未発注") return "bg-amber-100 text-amber-800";
  return "bg-green-100 text-green-800";
}
function materialOrderBadgeStyle(s: MaterialOrderStatus): string {
  return s === "発注済み" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700";
}
function alertTextStyle(al: MaterialAlert): string {
  if (al.alertType === "土日祝前倒し")       return "text-red-700";
  if (al.materialOrderStatus === "未発注") return "text-amber-800";
  return "text-green-700";
}

// ─── カレンダーデータ事前計算（モジュール初期化時） ────────────
function buildDayBadgesMap(): Record<number, CalBadge[]> {
  const map: Record<number, Set<CalBadge>> = {};
  for (const ev of MONTH_EVENTS) {
    const day = parseDateToDayNum(ev.date);
    if (day === null) continue;
    if (!map[day]) map[day] = new Set();
    map[day].add(KIND_TO_CAL[ev.kind]);
  }
  for (const al of MATERIAL_ALERTS) {
    if (al.materialOrderStatus === "未発注") {
      const day = parseDateToDayNum(al.constructionDate);
      if (day !== null) {
        if (!map[day]) map[day] = new Set();
        map[day].add("警告");
      }
    }
  }
  const result: Record<number, CalBadge[]> = {};
  for (const key of Object.keys(map)) {
    const d = parseInt(key);
    result[d] = Array.from(map[d]);
  }
  return result;
}

const DAY_BADGES_MAP = buildDayBadgesMap();

const GRID_SIZE = Math.ceil((MONTH_START_OFFSET + DAYS_IN_MONTH) / 7) * 7;
const CALENDAR_CELLS: (number | null)[] = Array.from({ length: GRID_SIZE }, (_, i) => {
  const day = i - MONTH_START_OFFSET + 1;
  return day > 0 && day <= DAYS_IN_MONTH ? day : null;
});

// ─── ページコンポーネント ─────────────────────────────────────
export default function SchedulePage() {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const selectedEvents = selectedDay !== null
    ? MONTH_EVENTS.filter((ev) => parseDateToDayNum(ev.date) === selectedDay)
    : [];
  const selectedAlerts = selectedDay !== null
    ? MATERIAL_ALERTS.filter((al) => parseDateToDayNum(al.constructionDate) === selectedDay)
    : [];

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        {/* ヘッダー */}
        <header className="mb-4">
          <Link href="/" className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← ホームへ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">スケジュール</h1>
          <p className="mt-1 text-sm text-stone-500">
            カレンダーで現調・施工・材料・請求・入金予定を確認します。
          </p>
        </header>

        <div className="space-y-3">

          {/* ── 月間カレンダー ── */}
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">

            {/* 月ナビゲーション */}
            <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
              <button type="button"
                onClick={() => alert("月移動は次工程で追加します。")}
                className="rounded-xl border border-stone-200 px-3 py-1.5 text-sm font-bold text-stone-600 active:opacity-70">
                ← 前月
              </button>
              <span className="text-base font-bold text-stone-800">{CALENDAR_MONTH_LABEL}</span>
              <button type="button"
                onClick={() => alert("月移動は次工程で追加します。")}
                className="rounded-xl border border-stone-200 px-3 py-1.5 text-sm font-bold text-stone-600 active:opacity-70">
                翌月 →
              </button>
            </div>

            {/* 曜日ヘッダー */}
            <div className="grid grid-cols-7 border-b border-stone-100 bg-stone-50">
              {WEEKDAYS.map((wd, i) => (
                <div key={wd} className={`py-2 text-center text-xs font-bold ${
                  i === 5 ? "text-blue-600" : i === 6 ? "text-red-600" : "text-stone-500"
                }`}>
                  {wd}
                </div>
              ))}
            </div>

            {/* 日付グリッド */}
            <div className="grid grid-cols-7">
              {CALENDAR_CELLS.map((day, idx) => {
                if (day === null) {
                  return (
                    <div key={`pad-${idx}`}
                      className="min-h-[58px] border-b border-r border-stone-50 bg-stone-50/40" />
                  );
                }

                const colIdx = idx % 7;
                const isSat = colIdx === 5;
                const isSun = colIdx === 6;
                const isSelected = selectedDay === day;
                const badges = DAY_BADGES_MAP[day] ?? [];

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDay(isSelected ? null : day)}
                    className={`flex min-h-[58px] w-full flex-col items-center gap-0.5 border-b border-r border-stone-100 px-0.5 py-1.5 transition-colors active:opacity-80 ${
                      isSelected
                        ? "bg-[#8B4A3C]"
                        : "hover:bg-[#fdf0ec]/60"
                    }`}
                  >
                    {/* 日付数字 */}
                    <span className={`text-xs font-bold leading-none ${
                      isSelected
                        ? "text-white"
                        : isSun ? "text-red-600"
                        : isSat ? "text-blue-600"
                        : "text-stone-800"
                    }`}>
                      {day}
                    </span>

                    {/* バッジ */}
                    <div className="flex w-full flex-col items-center gap-px">
                      {badges.slice(0, 2).map((b, bi) => (
                        <span key={bi} className={`w-full truncate rounded text-center text-[8px] font-bold leading-tight py-px ${
                          isSelected
                            ? "bg-white/20 text-white"
                            : CAL_BADGE_STYLE[b]
                        }`}>
                          {b}
                        </span>
                      ))}
                      {badges.length > 2 && (
                        <span className={`text-[8px] leading-none ${isSelected ? "text-white/70" : "text-stone-400"}`}>
                          +{badges.length - 2}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* 凡例 */}
            <div className="flex flex-wrap items-center gap-1.5 border-t border-stone-100 px-4 py-2.5">
              <span className="text-[10px] text-stone-400 shrink-0">凡例：</span>
              {CAL_BADGE_KEYS.map((b) => (
                <span key={b} className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${CAL_BADGE_STYLE[b]}`}>
                  {b === "警告" ? "材料注意" : b}
                </span>
              ))}
            </div>
          </div>

          {/* ── 選択日の予定 ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">
              {selectedDay !== null
                ? `${CALENDAR_MONTH}月${selectedDay}日の予定`
                : "選択日の予定"}
            </h2>

            {selectedDay === null ? (
              <p className="py-6 text-center text-xs text-stone-400">
                カレンダーの日付を選択すると予定が表示されます。
              </p>
            ) : selectedEvents.length === 0 && selectedAlerts.length === 0 ? (
              <p className="py-6 text-center text-xs text-stone-400">
                この日の予定はありません。
              </p>
            ) : (
              <div className="space-y-2.5">
                {/* スケジュールイベント */}
                {selectedEvents.map((ev) => (
                  <div key={ev.id} className="rounded-xl border border-stone-100 bg-stone-50 p-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      {ev.time !== "-" && (
                        <span className="text-xs font-bold text-stone-500">{ev.time}</span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${KIND_STYLE[ev.kind]}`}>
                        {ev.kind}
                      </span>
                      <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[ev.status]}`}>
                        {ev.status}
                      </span>
                    </div>
                    <p className="mb-0.5 text-sm font-bold text-stone-800 leading-tight">{ev.projectName}</p>
                    <p className="text-xs text-stone-400">{ev.clientName}</p>
                    {ev.siteAddress !== "-" && (
                      <p className="text-xs text-stone-400">{ev.siteAddress}</p>
                    )}
                    <div className="mt-2">
                      <Link href="/projects/sample"
                        className="inline-flex items-center gap-1 rounded-lg bg-[#8B4A3C]/10 px-3 py-1.5 text-xs font-bold text-[#8B4A3C] active:opacity-70">
                        案件を見る →
                      </Link>
                    </div>
                  </div>
                ))}

                {/* 施工日に紐づく材料アラート */}
                {selectedAlerts.map((al) => (
                  <div key={al.id} className={`rounded-xl p-3 ${materialAlertCardStyle(al)}`}>
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${materialAlertBadgeStyle(al)}`}>
                        {al.alertType}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${materialOrderBadgeStyle(al.materialOrderStatus)}`}>
                        {al.materialOrderStatus}
                      </span>
                    </div>
                    <p className="mb-0.5 text-sm font-bold text-stone-800">{al.projectName}</p>
                    <p className="mb-1 text-xs text-stone-500">{al.contractorName}</p>
                    <p className={`text-xs font-bold ${alertTextStyle(al)}`}>{al.alertMessage}</p>
                  </div>
                ))}
              </div>
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
              {MATERIAL_ALERTS.map((al) => (
                <div key={al.id} className={`rounded-xl p-3 ${materialAlertCardStyle(al)}`}>
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${materialAlertBadgeStyle(al)}`}>
                      {al.alertType}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${materialOrderBadgeStyle(al.materialOrderStatus)}`}>
                      {al.materialOrderStatus}
                    </span>
                    {al.alertDate !== "-" && (
                      <span className="ml-auto text-xs text-stone-500">⏰ {al.alertDate}</span>
                    )}
                  </div>
                  <p className="mb-1 text-sm font-bold text-stone-800 leading-tight">{al.projectName}</p>
                  <p className="mb-0.5 text-xs text-stone-400">{al.contractorName}</p>
                  <div className="mb-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="text-xs text-stone-500">施工日：{al.constructionDate}</span>
                    <span className="text-xs text-stone-500">搬入予定：{al.materialDeliveryDate}</span>
                  </div>
                  <p className={`mb-2 text-sm font-bold leading-snug ${alertTextStyle(al)}`}>
                    {al.alertMessage}
                  </p>
                  <Link href="/projects/sample"
                    className="inline-flex items-center gap-1 rounded-lg bg-[#8B4A3C]/10 px-3 py-1.5 text-xs font-bold text-[#8B4A3C] active:opacity-70">
                    案件を見る →
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* ── カレンダー連携について ── */}
          <div className="rounded-2xl bg-stone-50 p-4 shadow-sm ring-1 ring-stone-200">
            <h3 className="mb-1.5 text-sm font-bold text-stone-600">📅 カレンダー連携について</h3>
            <p className="mb-3 text-sm leading-relaxed text-stone-500">
              現在はアプリ内カレンダー表示のみです。<br />
              将来的に、Googleカレンダー・iPhoneカレンダーなど、ユーザーが使用しているカレンダーアプリへ予定を書き出せるようにする予定です。
            </p>
            <button
              type="button"
              onClick={() => alert("カレンダー連携は次工程で追加します。")}
              className="w-full rounded-xl border border-stone-200 bg-white py-2.5 text-sm font-bold text-stone-600 shadow-sm active:opacity-70"
            >
              カレンダー連携設定
            </button>
          </div>

          {/* ホームへ戻る */}
          <div className="pb-2">
            <Link href="/"
              className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-4 text-base font-bold text-stone-600 shadow-sm active:opacity-80">
              ホームへ戻る
            </Link>
          </div>

          {/* テスト感想リンク */}
          <div className="flex justify-end pb-8">
            <Link href="/test-feedback" className="text-xs text-stone-400 underline underline-offset-2 hover:text-[#8B4A3C]">
              この画面の感想を書く
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
