import Link from "next/link";

const registerOptions = [
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
];

export default function ProjectRegisterPage() {
  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        {/* ヘッダー */}
        <header className="mb-6">
          <Link
            href="/"
            className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75"
          >
            ← ホームへ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">案件登録</h1>
          <p className="mt-1 text-sm text-stone-500">
            手入力または元請書類・データから案件を登録します。
          </p>
        </header>

        {/* 登録方法の選択カード */}
        <div className="space-y-3">
          {registerOptions.map((opt) => (
            <Link
              key={opt.title}
              href={opt.href}
              className={`flex items-center gap-4 rounded-2xl p-5 shadow-sm active:opacity-75 ${
                opt.accent
                  ? "bg-[#8B4A3C] text-white"
                  : "bg-white ring-1 ring-stone-100"
              }`}
            >
              <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-3xl ${
                opt.accent ? "bg-white/10" : "bg-[#fdf0ec]"
              }`}>
                {opt.icon}
              </span>
              <div className="flex flex-col gap-0.5">
                <span className={`text-base font-bold ${opt.accent ? "text-white" : "text-stone-800"}`}>
                  {opt.title}
                </span>
                <span className={`text-sm leading-snug ${opt.accent ? "text-amber-100" : "text-stone-500"}`}>
                  {opt.desc}
                </span>
              </div>
              <span className={`ml-auto shrink-0 text-xl ${opt.accent ? "text-white/50" : "text-stone-300"}`}>
                ›
              </span>
            </Link>
          ))}
        </div>

        {/* 補足 */}
        <div className="mt-6 rounded-2xl bg-yellow-50 p-4 ring-1 ring-yellow-200">
          <p className="text-xs leading-relaxed text-yellow-700">
            書類・データからの自動読取は今後順次対応予定です。
            現在は手入力での確認・修正が必要です。
          </p>
        </div>

      </div>
    </div>
  );
}
