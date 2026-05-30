import Link from "next/link";

const mainButtons = [
  {
    label: "新規案件登録",
    desc: "手入力で案件を作る",
    icon: "📋",
    href: "/projects/new",
  },
  {
    label: "元請書類から案件登録",
    desc: "PDF・FAX・LINE画像から案件の下書きを作る",
    icon: "📄",
    href: "/projects/import",
  },
  {
    label: "スケジュール",
    desc: "現調・施工・請求予定を確認",
    icon: "📅",
    href: null,
  },
  {
    label: "月次収支報告",
    desc: "売上・支出・未請求・未入金を確認",
    icon: "📊",
    href: "/reports/monthly",
  },
  {
    label: "テンプレ集",
    desc: "見積・請求・LINE文面",
    icon: "📝",
    href: null,
  },
  {
    label: "使い方を見る",
    desc: "初めての方はこちら",
    icon: "📖",
    href: null,
  },
];

const recentCases = [
  { name: "〇〇マンション クロス貼替", status: "見積中" },
  { name: "△△邸 CF貼替", status: "請求待ち" },
];

const weeklySchedule = [
  { day: "月曜", task: "現調" },
  { day: "水曜", task: "材料発注" },
  { day: "金曜", task: "請求書送付" },
];

const unprocessed = [
  { label: "見積未提出", count: 2 },
  { label: "請求待ち", count: 1 },
];

const monthlySummary = [
  { label: "売上", amount: "450,000円" },
  { label: "支出", amount: "180,000円" },
  { label: "粗利", amount: "270,000円" },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-3 sm:max-w-lg">

        {/* ヘッダー */}
        <header className="mb-3 text-center">
          <h1 className="text-2xl font-bold text-stone-800 tracking-wide">
            現場の事務サポ
          </h1>
          <p className="mt-0.5 text-sm text-stone-500">
            見積・材料・請求・予定を、スマホでひとまとめ。
          </p>
        </header>

        {/* メインボタン 2×2 */}
        <section className="mb-3 grid grid-cols-2 gap-2.5">
          {mainButtons.map((btn) => {
            const inner = (
              <>
                <span className="text-2xl leading-none">{btn.icon}</span>
                <span className="text-sm font-bold">{btn.label}</span>
                <span className="text-center text-xs text-amber-100 leading-tight">
                  {btn.desc}
                </span>
              </>
            );
            const cls =
              "flex min-h-[76px] w-full flex-col items-center justify-center gap-0.5 rounded-2xl bg-[#8B4A3C] px-3 py-3 text-white shadow-sm active:opacity-80";
            return btn.href ? (
              <Link key={btn.label} href={btn.href} className={cls}>
                {inner}
              </Link>
            ) : (
              <button key={btn.label} type="button" className={cls}>
                {inner}
              </button>
            );
          })}
        </section>

        {/* 情報カード一覧 */}
        <section className="space-y-2.5">

          {/* 最近の案件 */}
          <div className="rounded-2xl bg-white p-3 shadow-sm">
            <h2 className="mb-2 border-b border-stone-100 pb-1.5 text-sm font-bold text-stone-700">
              最近の案件
            </h2>
            <ul className="space-y-1.5">
              {recentCases.map((c) => (
                <li key={c.name} className="flex items-center justify-between text-sm">
                  <span className="text-stone-800">{c.name}</span>
                  <span className="ml-2 shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                    {c.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* 今週の予定 */}
          <div className="rounded-2xl bg-white p-3 shadow-sm">
            <h2 className="mb-2 border-b border-stone-100 pb-1.5 text-sm font-bold text-stone-700">
              今週の予定
            </h2>
            <ul className="space-y-1.5">
              {weeklySchedule.map((s) => (
                <li key={s.day} className="flex items-center gap-3 text-sm">
                  <span className="w-10 shrink-0 text-xs font-bold text-[#8B4A3C]">
                    {s.day}
                  </span>
                  <span className="text-stone-800">{s.task}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 未処理 */}
          <div className="rounded-2xl bg-[#fff8f5] p-3 shadow-sm ring-1 ring-[#8B4A3C]/20">
            <h2 className="mb-2 border-b border-[#8B4A3C]/15 pb-1.5 text-sm font-bold text-[#8B4A3C]">
              ⚠️ 未処理
            </h2>
            <ul className="space-y-1.5">
              {unprocessed.map((u) => (
                <li key={u.label} className="flex items-center justify-between">
                  <span className="text-sm text-stone-800">{u.label}</span>
                  <span className="rounded-full bg-[#8B4A3C] px-3 py-0.5 text-sm font-bold text-white">
                    {u.count}件
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* 今月の数字 */}
          <div className="rounded-2xl bg-white p-3 shadow-sm">
            <h2 className="mb-2 border-b border-stone-100 pb-1.5 text-sm font-bold text-stone-700">
              今月の数字
            </h2>
            <ul className="space-y-1.5">
              {monthlySummary.map((m) => (
                <li key={m.label} className="flex items-center justify-between text-sm">
                  <span className="text-stone-500">{m.label}</span>
                  <span className="font-bold text-stone-800">{m.amount}</span>
                </li>
              ))}
            </ul>
          </div>

        </section>
      </div>
    </div>
  );
}
