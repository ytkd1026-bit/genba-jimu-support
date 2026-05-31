"use client";

// TODO: 将来的にCSV出力、Supabase保存、料金プラン集計に連携する

import Link from "next/link";
import { useState, useEffect } from "react";

const STORAGE_KEY = "genba_jimu_test_feedbacks";

const SHOKUSHU_OPTIONS = ["クロス", "床", "大工", "設備", "電気", "塗装", "多能工", "その他"];

const NENSHO_OPTIONS = [
  "500万円未満",
  "500万〜1,000万円",
  "1,000万〜2,000万円",
  "2,000万〜3,000万円",
  "3,000万円以上",
];

const FEATURE_OPTIONS = [
  "スキャン登録",
  "案件登録",
  "見積作成",
  "見積書兼注文書",
  "材料計算",
  "材料発注確認",
  "単体請求書",
  "一括請求書",
  "未請求一覧",
  "月次収支報告",
  "スケジュール",
  "レシート読取",
  "事業者設定",
];

type Feedback = {
  id: string;
  testerName: string;
  shokushu: string;
  nensho: string;
  usefulFeatures: string[];
  unnecessaryFeatures: string[];
  confusingScreens: string;
  plan550: string;
  plan1980: string;
  plan3300: string;
  plan9800: string;
  overallComment: string;
  savedAt: string;
};

const EMPTY_FORM = {
  testerName: "",
  shokushu: "",
  nensho: "",
  usefulFeatures: [] as string[],
  unnecessaryFeatures: [] as string[],
  confusingScreens: "",
  plan550: "",
  plan1980: "",
  plan3300: "",
  plan9800: "",
  overallComment: "",
};

function CheckboxGroup({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
}) {
  function toggle(val: string) {
    onChange(
      selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val]
    );
  }
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {options.map((opt) => {
        const checked = selected.includes(opt);
        return (
          <label key={opt} className="flex cursor-pointer items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm active:opacity-70">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(opt)}
              className="h-4 w-4 accent-[#8B4A3C]"
            />
            <span className={checked ? "font-bold text-[#8B4A3C]" : "text-stone-700"}>{opt}</span>
          </label>
        );
      })}
    </div>
  );
}

export default function TestFeedbackPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setFeedbacks(JSON.parse(raw) as Feedback[]);
    } catch {
      setFeedbacks([]);
    }
  }, []);

  function handleField(name: string, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSave() {
    const entry: Feedback = {
      ...form,
      id: Date.now().toString(),
      savedAt: new Date().toLocaleString("ja-JP"),
    };
    const next = [...feedbacks, entry];
    setFeedbacks(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setForm(EMPTY_FORM);
    setSavedMsg("感想を仮保存しました。");
    setTimeout(() => setSavedMsg(""), 4000);
  }

  const labelCls = "mb-1 block text-sm font-bold text-stone-700";
  const inputCls = "w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-2 focus:ring-[#8B4A3C]/20";
  const textareaCls = inputCls + " resize-none";

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        <header className="mb-6">
          <Link href="/" className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← ホームへ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">テストプレイ感想入力</h1>
          <p className="mt-1 text-sm text-stone-500">
            使ってみて必要な機能・不要な機能・分かりにくい画面を記録します。
          </p>
        </header>

        <div className="space-y-4">

          {/* テスト時の注意 */}
          <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
            <h2 className="mb-1.5 text-sm font-bold text-amber-800">テスト時の注意</h2>
            <p className="text-xs leading-relaxed text-amber-700">
              このアプリは現在MVP検証中です。
              実際の請求書・見積書として使う前に、金額・宛名・住所・税額・振込先を必ず確認してください。
              スキャン読取や仮読取結果は誤認識する可能性があります。
            </p>
          </div>

          {/* 入力フォーム */}
          <div className="rounded-2xl bg-white p-4 shadow-sm space-y-5">
            <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">感想を入力</h2>

            {/* テスター名 */}
            <div>
              <label className={labelCls}>テスター名</label>
              <input type="text" value={form.testerName}
                onChange={(e) => handleField("testerName", e.target.value)}
                placeholder="例：クロス職人Aさん" className={inputCls} />
            </div>

            {/* 職種 */}
            <div>
              <label className={labelCls}>職種</label>
              <select value={form.shokushu}
                onChange={(e) => handleField("shokushu", e.target.value)}
                className={inputCls}>
                <option value="">選択してください</option>
                {SHOKUSHU_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* 年商規模 */}
            <div>
              <label className={labelCls}>年商規模</label>
              <select value={form.nensho}
                onChange={(e) => handleField("nensho", e.target.value)}
                className={inputCls}>
                <option value="">選択してください</option>
                {NENSHO_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            {/* よく使いそうな機能 */}
            <div>
              <label className={labelCls}>よく使いそうな機能</label>
              <CheckboxGroup
                options={FEATURE_OPTIONS}
                selected={form.usefulFeatures}
                onChange={(v) => setForm((prev) => ({ ...prev, usefulFeatures: v }))}
              />
            </div>

            {/* いらないと思った機能 */}
            <div>
              <label className={labelCls}>いらないと思った機能</label>
              <CheckboxGroup
                options={FEATURE_OPTIONS}
                selected={form.unnecessaryFeatures}
                onChange={(v) => setForm((prev) => ({ ...prev, unnecessaryFeatures: v }))}
              />
            </div>

            {/* 分かりにくかった画面 */}
            <div>
              <label className={labelCls}>分かりにくかった画面</label>
              <textarea rows={3} value={form.confusingScreens}
                onChange={(e) => handleField("confusingScreens", e.target.value)}
                placeholder="例：見積作成のボタンがわかりにくかった"
                className={textareaCls} />
            </div>

            {/* 料金プランごとの要望 */}
            <div className="space-y-3 rounded-xl bg-stone-50 p-3">
              <p className="text-xs font-bold text-stone-600">料金プランごとに「欲しい機能」を教えてください</p>
              {[
                { key: "plan550",  label: "月550円なら欲しい機能" },
                { key: "plan1980", label: "月1,980円なら欲しい機能" },
                { key: "plan3300", label: "月3,300円なら欲しい機能" },
                { key: "plan9800", label: "月9,800円なら欲しい機能" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="mb-1 block text-xs font-bold text-stone-600">{label}</label>
                  <textarea rows={2} value={form[key as keyof typeof form] as string}
                    onChange={(e) => handleField(key, e.target.value)}
                    placeholder="自由に書いてください"
                    className="w-full resize-none rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-1 focus:ring-[#8B4A3C]/20" />
                </div>
              ))}
            </div>

            {/* 全体感想 */}
            <div>
              <label className={labelCls}>全体感想</label>
              <textarea rows={4} value={form.overallComment}
                onChange={(e) => handleField("overallComment", e.target.value)}
                placeholder="使ってみた感想、改善要望など自由に書いてください"
                className={textareaCls} />
            </div>

            {/* 保存ボタン */}
            <button type="button" onClick={handleSave}
              className="w-full rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80">
              感想を仮保存
            </button>

            {/* 保存後メッセージ */}
            {savedMsg && (
              <div className="rounded-xl bg-green-50 px-4 py-3 text-sm font-bold text-green-700 ring-1 ring-green-200">
                {savedMsg}
              </div>
            )}
          </div>

          {/* 料金プラン検証の目的 */}
          <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200">
            <h2 className="mb-1.5 text-sm font-bold text-stone-700">料金プラン検証の目的</h2>
            <p className="text-xs leading-relaxed text-stone-500">
              このテスト結果をもとに、550円・1,980円・3,300円・9,800円の各プランにどの機能を入れるか検討します。
              「便利そう」ではなく「お金を払ってでも使いたい機能」を確認するためのテストです。
            </p>
          </div>

          {/* 保存済み感想一覧 */}
          {feedbacks.length > 0 && (
            <div className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
              <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">
                保存済み感想一覧
                <span className="ml-2 text-xs font-normal text-stone-400">（{feedbacks.length}件）</span>
              </h2>
              <div className="space-y-3">
                {feedbacks.map((fb) => (
                  <div key={fb.id} className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-stone-800">{fb.testerName || "（名前なし）"}</p>
                      <p className="text-xs text-stone-400">{fb.savedAt}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {fb.shokushu && (
                        <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs text-stone-600">{fb.shokushu}</span>
                      )}
                      {fb.nensho && (
                        <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs text-stone-600">{fb.nensho}</span>
                      )}
                    </div>
                    {fb.usefulFeatures.length > 0 && (
                      <div>
                        <p className="text-xs text-stone-500">よく使いそう：</p>
                        <p className="text-xs text-stone-700">{fb.usefulFeatures.join("・")}</p>
                      </div>
                    )}
                    {fb.unnecessaryFeatures.length > 0 && (
                      <div>
                        <p className="text-xs text-stone-500">いらない：</p>
                        <p className="text-xs text-stone-700">{fb.unnecessaryFeatures.join("・")}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pb-8 pt-2">
            <Link href="/"
              className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-4 text-base font-bold text-stone-600 shadow-sm active:opacity-80">
              ホームへ戻る
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
