"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

const projectInfo = [
  { label: "元請け・顧客名", value: "△△工務店" },
  { label: "現場住所", value: "大阪府堺市〇〇区" },
  { label: "工事種別", value: "クロス" },
  { label: "工事内容", value: "洋室クロス貼替、洗面所CF貼替" },
  { label: "見積状態", value: "作成中" },
  { label: "請求状態", value: "未請求" },
  { label: "施工予定日", value: "2026/06/03" },
];

const workButtons = [
  { label: "見積書を作る", desc: "単価・数量・利益を入力", icon: "📝", href: "/projects/sample/estimate" },
  { label: "材料計算", desc: "m数・㎡数から必要材料を確認", icon: "📐", href: "/projects/sample/materials" },
  { label: "原価・利益計算", desc: "人工・材料・経費・粗利を確認", icon: "💰", href: null },
  { label: "稟議書を作る", desc: "元請け提出用の説明資料", icon: "📋", href: null },
  { label: "請求書を作る", desc: "見積内容から請求書へ", icon: "🧾", href: "/projects/sample/invoice" },
  { label: "スケジュールを見る", desc: "現調・施工・請求予定を確認", icon: "📅", href: null },
];

export default function SampleProjectPage() {
  const router = useRouter();

  function handleWorkButton(label: string, href: string | null) {
    if (href) {
      router.push(href);
    } else {
      alert("次工程で作成します");
    }
  }

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
          <h1 className="text-xl font-bold text-stone-800">
            〇〇マンション クロス貼替
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            この案件の見積・材料・原価・請求を管理します。
          </p>
        </header>

        {/* 案件概要カード */}
        <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">
            案件概要
          </h2>
          <ul className="space-y-2">
            {projectInfo.map((item) => (
              <li key={item.label} className="flex items-start gap-2 text-sm">
                <span className="w-28 shrink-0 text-stone-500">{item.label}</span>
                <span className="font-medium text-stone-800">{item.value}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 作業ボタン */}
        <section className="mb-6 space-y-2.5">
          <h2 className="text-sm font-bold text-stone-700">作業メニュー</h2>
          {workButtons.map((btn) => (
            <button
              key={btn.label}
              type="button"
              onClick={() => handleWorkButton(btn.label, btn.href)}
              className="flex w-full items-center gap-4 rounded-2xl bg-white px-4 py-4 text-left shadow-sm ring-1 ring-stone-100 active:opacity-75"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#fdf0ec] text-2xl">
                {btn.icon}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-base font-bold text-stone-800">{btn.label}</span>
                <span className="text-xs text-stone-500">{btn.desc}</span>
              </span>
              <span className="ml-auto shrink-0 text-stone-300">›</span>
            </button>
          ))}
        </section>

        {/* ホームへ戻るボタン */}
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
  );
}
