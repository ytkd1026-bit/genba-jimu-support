import Link from "next/link";

// TODO: 将来的に /invoices/single を作り、単体請求書一覧専用ページにする。
// TODO: 将来的に /invoices/bulk を作り、元請別・請求月別に一括請求書一覧を確認できるようにする。

const menuCards = [
  {
    icon: "⚠️",
    title: "未請求確認",
    desc: "請求漏れを確認する",
    href: "/invoices/unbilled",
    accent: true,
  },
  {
    icon: "📄",
    title: "単体請求書作成",
    desc: "1案件ごとの請求書を作る",
    href: "/projects/sample/single-invoice",
    accent: false,
  },
  {
    icon: "📋",
    title: "一括請求書作成",
    desc: "元請ごとにまとめて請求する",
    href: "/projects/sample/invoice",
    accent: false,
  },
];

export default function InvoicesMenuPage() {
  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        <header className="mb-6">
          <Link href="/" className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← ホームへ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">請求書関係</h1>
          <p className="mt-1 text-sm text-stone-500">
            未請求確認・単体請求書・一括請求書を管理します。
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

          {/* 請求書の流れ */}
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
            <h2 className="mb-2 text-sm font-bold text-stone-700">請求書の流れ</h2>
            <p className="text-sm leading-relaxed text-stone-500">
              未請求確認で請求漏れを確認し、単体請求書または一括請求書を作成します。<br />
              作成前に画面上の確認カードで内容を確認し、PDF出力後は一覧確認から再確認できます。
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
