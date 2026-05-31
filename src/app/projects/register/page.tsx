import Link from "next/link";

const menuCards = [
  {
    icon: "🔍",
    title: "案件検索",
    desc: "日付・案件名・元請名で探す",
    href: "/#project-search",
    accent: false,
  },
  {
    icon: "📝",
    title: "新規案件登録",
    desc: "手入力で案件を作る",
    href: "/projects/new",
    accent: false,
  },
  {
    icon: "📄",
    title: "書類・データから案件登録",
    desc: "PDF・FAX・LINE画像から案件の下書きを作る",
    href: "/projects/import",
    accent: true,
  },
  {
    icon: "📋",
    title: "登録案件一覧",
    desc: "登録済みの案件から選んで作業を開始",
    href: "#registered-projects",
    accent: false,
  },
];

const REGISTERED_PROJECTS = [
  {
    id: "p1",
    projectName: "〇〇マンション クロス貼替",
    clientName:  "△△工務店",
    siteAddress: "大阪府堺市〇〇区",
    workContent: "洋室クロス貼替・洗面所CF貼替",
    status:      "見積中",
    href:        "/projects/sample",
  },
  {
    id: "p2",
    projectName: "△△邸 CF貼替",
    clientName:  "△△工務店",
    siteAddress: "大阪府堺市△△区",
    workContent: "洗面所CF貼替",
    status:      "未請求",
    href:        "/projects/sample",
  },
];

const STATUS_STYLE: Record<string, string> = {
  見積中:   "bg-amber-100 text-amber-800",
  未請求:   "bg-red-100 text-red-700",
  請求待ち: "bg-purple-100 text-purple-800",
  完了:     "bg-green-100 text-green-700",
};

export default function ProjectRegisterPage() {
  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        <header className="mb-6">
          <Link href="/" className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← ホームへ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">案件検索・登録</h1>
          <p className="mt-1 text-sm text-stone-500">
            案件を探す、または新しく登録します。
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

          <div className="rounded-2xl bg-yellow-50 p-4 ring-1 ring-yellow-200">
            <p className="text-xs leading-relaxed text-yellow-700">
              書類・データからの自動読取は今後順次対応予定です。
              現在は手入力での確認・修正が必要です。
            </p>
          </div>

          {/* ── 登録案件一覧 ── */}
          <section id="registered-projects" className="scroll-mt-4 space-y-3 pt-2">
            <div className="border-b border-stone-200 pb-2">
              <h2 className="text-base font-bold text-stone-800">登録案件一覧</h2>
              <p className="mt-0.5 text-xs text-stone-500">案件を選んで、すぐ作業を開始できます。</p>
            </div>

            {REGISTERED_PROJECTS.map((p) => (
              <div key={p.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-100">
                {/* カードヘッダー */}
                <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[p.status] ?? "bg-stone-100 text-stone-600"}`}>
                    {p.status}
                  </span>
                  <span className="text-xs text-stone-400">{p.clientName}</span>
                </div>
                {/* 案件情報 */}
                <div className="px-4 py-3 space-y-0.5">
                  <p className="text-sm font-bold text-stone-800 leading-tight">{p.projectName}</p>
                  <p className="text-xs text-stone-400">{p.siteAddress}</p>
                  <p className="text-xs text-stone-500">{p.workContent}</p>
                </div>
                {/* アクションボタン */}
                <div className="grid grid-cols-3 gap-1.5 border-t border-stone-100 px-4 py-3">
                  <Link href={p.href}
                    className="flex items-center justify-center rounded-xl border border-stone-200 bg-white px-2 py-2 text-center text-xs font-bold text-stone-600 active:opacity-80">
                    案件詳細<br />を見る
                  </Link>
                  <Link href="/projects/sample/estimate"
                    className="flex items-center justify-center rounded-xl bg-[#8B4A3C] px-2 py-2 text-center text-xs font-bold text-white active:opacity-80">
                    見積作成<br />を開始
                  </Link>
                  <Link href="/projects/sample/single-invoice"
                    className="flex items-center justify-center rounded-xl border border-[#8B4A3C] bg-white px-2 py-2 text-center text-xs font-bold text-[#8B4A3C] active:opacity-80">
                    請求書<br />作成へ
                  </Link>
                </div>
              </div>
            ))}
          </section>

        </div>
      </div>
    </div>
  );
}
