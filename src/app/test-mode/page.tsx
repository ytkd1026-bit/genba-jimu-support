"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { getTestMode, setTestMode, TEST_MODE_LABELS, type TestMode } from "@/app/utils/testMode";

const MODES: { id: TestMode; title: string; desc: string; icon: string }[] = [
  {
    id: "first_user",
    title: "初回ユーザーテストモード",
    icon: "👷",
    desc: "初めて使う職人目線で、案件登録から見積・材料・請求・収支・スケジュールまで触れます。サンプル表示は最小限にし、必要な機能・不要な機能を確認します。",
  },
  {
    id: "demo",
    title: "デモデータモード",
    icon: "📊",
    desc: "サンプル案件・サンプル請求・サンプル材料・サンプル予定を表示します。説明や営業用の確認に使います。",
  },
  {
    id: "normal",
    title: "通常開発モード",
    icon: "⚙️",
    desc: "開発中の通常表示に戻します。",
  },
];

export default function TestModePage() {
  const [currentMode, setCurrentMode] = useState<TestMode>("normal");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setCurrentMode(getTestMode());
  }, []);

  function handleSelect(mode: TestMode) {
    setTestMode(mode);
    setCurrentMode(mode);
    setMessage("モードを変更しました");
    setTimeout(() => setMessage(""), 3000);
  }

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        <header className="mb-6">
          <Link href="/" className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← ホームへ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">初回ユーザーテストモード</h1>
          <p className="mt-1 text-sm text-stone-500">
            職人仲間にテストプレイしてもらうためのモードを切り替えます。
          </p>
        </header>

        <div className="space-y-4">

          {/* 現在のモード */}
          <div className="rounded-2xl bg-[#8B4A3C] p-4 shadow-sm text-white">
            <p className="text-xs text-amber-200">現在のモード</p>
            <p className="mt-1 text-base font-bold">{TEST_MODE_LABELS[currentMode]}</p>
          </div>

          {/* 変更通知 */}
          {message && (
            <div className="rounded-2xl bg-green-50 px-4 py-3 text-sm font-bold text-green-700 ring-1 ring-green-200">
              {message}
            </div>
          )}

          {/* テスト時の注意 */}
          <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
            <h2 className="mb-1.5 text-sm font-bold text-amber-800">テスト時の注意</h2>
            <p className="text-xs leading-relaxed text-amber-700">
              このアプリは現在MVP検証中です。
              実際の請求書・見積書として使う前に、金額・宛名・住所・税額・振込先を必ず確認してください。
              スキャン読取や仮読取結果は誤認識する可能性があります。
            </p>
          </div>

          {/* モード選択カード */}
          {MODES.map((m) => {
            const isSelected = currentMode === m.id;
            return (
              <div key={m.id} className={`overflow-hidden rounded-2xl shadow-sm ring-1 ${isSelected ? "ring-[#8B4A3C]" : "ring-stone-100"} bg-white`}>
                <div className={`flex items-center gap-3 px-4 py-3 ${isSelected ? "bg-[#fdf0ec]" : ""}`}>
                  <span className="text-2xl">{m.icon}</span>
                  <div>
                    <p className="text-sm font-bold text-stone-800">{m.title}</p>
                    {isSelected && (
                      <span className="inline-block rounded-full bg-[#8B4A3C] px-2 py-0.5 text-[10px] font-bold text-white">
                        現在選択中
                      </span>
                    )}
                  </div>
                </div>
                <div className="px-4 py-3 space-y-3 border-t border-stone-100">
                  <p className="text-xs leading-relaxed text-stone-500">{m.desc}</p>
                  <button
                    type="button"
                    onClick={() => handleSelect(m.id)}
                    disabled={isSelected}
                    className={`w-full rounded-xl py-2.5 text-sm font-bold transition-colors ${
                      isSelected
                        ? "bg-stone-100 text-stone-400 cursor-not-allowed"
                        : "bg-[#8B4A3C] text-white active:opacity-80"
                    }`}
                  >
                    {isSelected ? "選択中" : "このモードにする"}
                  </button>
                </div>
              </div>
            );
          })}

          {/* 下部ボタン群 */}
          <div className="space-y-2.5 pt-2 pb-8">
            <Link href="/"
              className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-3.5 text-sm font-bold text-stone-600 shadow-sm active:opacity-80">
              ホームへ戻る
            </Link>
            <Link href="/scan"
              className="flex w-full items-center justify-center rounded-2xl bg-[#8B4A3C] py-3.5 text-sm font-bold text-white shadow-sm active:opacity-80">
              スキャン登録へ進む
            </Link>
            <Link href="/projects/register"
              className="flex w-full items-center justify-center rounded-2xl border border-[#8B4A3C] bg-white py-3.5 text-sm font-bold text-[#8B4A3C] shadow-sm active:opacity-80">
              案件検索・登録へ進む
            </Link>
            <Link href="/test-feedback"
              className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-3.5 text-sm font-bold text-stone-600 shadow-sm active:opacity-80">
              テスト感想入力へ進む
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
