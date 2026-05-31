import Link from "next/link";

const menuCards = [
  {
    icon: "📋",
    title: "見積書作成",
    desc: "見積書・注文書PDFを作成",
    href: "/projects/sample/estimate",
    accent: true,
  },
  {
    icon: "📝",
    title: "下書き確認",
    desc: "作成途中の見積下書きを確認",
    href: "/projects/sample/estimate",
    accent: false,
  },
  {
    // TODO: 将来的に /estimates/saved を作り、保存済み見積一覧を表示する。
    icon: "🗂️",
    title: "保存済み見積確認",
    desc: "過去に作成・保存した見積を確認",
    href: "/projects/sample/estimate",
    accent: false,
  },
];

export default function EstimatesMenuPage() {
  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        <header className="mb-6">
          <Link href="/" className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← ホームへ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">見積・注文書関係</h1>
          <p className="mt-1 text-sm text-stone-500">
            見積書・注文書・保存用PDFを作成します。
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

          {/* 見積・注文書の流れ */}
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
            <h2 className="mb-2 text-sm font-bold text-stone-700">見積・注文書の流れ</h2>
            <p className="text-sm leading-relaxed text-stone-500">
              見積書作成画面内で、見積PDF・見積書兼注文書PDF・保存用PDFを出力できます。<br />
              保存用PDFは内部管理用のため、元請・施主には提出しないでください。
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
