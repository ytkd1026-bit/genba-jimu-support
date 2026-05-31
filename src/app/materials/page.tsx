import Link from "next/link";

// TODO: 将来的に /materials/calculate を作り、案件別の材料計算専用ページにする。
// TODO: 将来的に /materials/orders を作り、材料発注PDF一覧専用ページにする。

const menuCards = [
  {
    icon: "📐",
    title: "材料計算",
    desc: "案件を検索して必要数量を計算",
    href: "/projects/sample/materials",
    accent: true,
  },
  {
    icon: "📦",
    title: "材料発注確認",
    desc: "作成済みの材料発注PDFを確認",
    href: "/projects/sample/materials",
    accent: false,
  },
  {
    icon: "⏰",
    title: "材料アラート確認",
    desc: "施工日前の材料発注漏れを確認",
    href: "/schedule",
    accent: false,
  },
];

export default function MaterialsMenuPage() {
  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        <header className="mb-6">
          <Link href="/" className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← ホームへ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">材料・発注管理</h1>
          <p className="mt-1 text-sm text-stone-500">
            材料計算・発注確認・搬入予定を管理します。
          </p>
        </header>

        <div className="space-y-3">

          {menuCards.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className={`flex items-center gap-4 rounded-2xl p-5 shadow-sm active:opacity-75 ${
                card.accent
                  ? "bg-[#8B4A3C] text-white"
                  : "bg-white ring-1 ring-stone-100"
              }`}
            >
              <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-3xl ${
                card.accent ? "bg-white/10" : "bg-[#fdf0ec]"
              }`}>
                {card.icon}
              </span>
              <div className="flex flex-col gap-0.5">
                <span className={`text-base font-bold ${card.accent ? "text-white" : "text-stone-800"}`}>
                  {card.title}
                </span>
                <span className={`text-sm leading-snug ${card.accent ? "text-amber-100" : "text-stone-500"}`}>
                  {card.desc}
                </span>
              </div>
              <span className={`ml-auto shrink-0 text-xl ${card.accent ? "text-white/50" : "text-stone-300"}`}>
                ›
              </span>
            </Link>
          ))}

          {/* 材料・発注の流れ */}
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
            <h2 className="mb-2 text-sm font-bold text-stone-700">材料・発注の流れ</h2>
            <p className="text-sm leading-relaxed text-stone-500">
              材料計算で案件を選び、必要数量とロス率を確認してから材料発注PDFを作成します。<br />
              材料発注確認では作成済みのPDFを一覧で確認できます。<br />
              施工日前の発注漏れはスケジュールのアラートにも表示されます。
            </p>
          </div>

          {/* 材料発注アラートの通知について */}
          <div className="rounded-2xl bg-stone-50 p-4 shadow-sm ring-1 ring-stone-200">
            <h3 className="mb-1.5 text-sm font-bold text-stone-600">🔔 材料発注アラートの通知について</h3>
            <p className="text-sm leading-relaxed text-stone-500">
              現在はアプリ内の画面表示のみです。<br />
              今後、Googleカレンダー・iPhoneカレンダー・LINE通知・メール通知への連携を検討します。
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
