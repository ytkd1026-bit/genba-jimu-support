"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const DRAFT_PROJECT_KEY = "genba_jimu_new_project_draft";

const KOUJI_TYPES = [
  "クロス", "クッションフロア", "フロアタイル", "長尺シート",
  "タイルカーペット", "ダイノック・化粧シート", "ガラスフィルム", "雑工事", "その他",
];

const MITSUMORI_STATES = ["未作成", "作成中", "提出済み", "受注"];
const SEIKYUU_STATES   = ["未請求", "請求済み", "入金済み"];

const labelCls = "block text-sm font-bold text-stone-700 mb-1";
const inputCls =
  "w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-2 focus:ring-[#8B4A3C]/20";

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="w-28 shrink-0 pt-0.5 text-xs text-stone-400">{label}</span>
      <span className={value ? "text-stone-800" : "text-stone-300"}>{value || "（未入力）"}</span>
    </li>
  );
}

export default function NewProjectPage() {
  const router = useRouter();
  const [savedMsg, setSavedMsg] = useState("");
  const [form, setForm] = useState({
    projectName:    "",
    clientName:     "",
    contactName:    "",
    address:        "",
    koujiType:      "",
    koujiContent:   "",
    scaleNote:      "",
    parkingNote:    "",
    sekouDate:      "",
    mitsumoriState: "未作成",
    seikyuuState:   "未請求",
    memo:           "",
  });

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleDraftSave() {
    try {
      const draft = { ...form, savedAt: new Date().toLocaleString("ja-JP") };
      localStorage.setItem(DRAFT_PROJECT_KEY, JSON.stringify(draft));
      setSavedMsg("案件を下書き保存しました。");
      setTimeout(() => setSavedMsg(""), 4000);
    } catch {
      setSavedMsg("保存に失敗しました。");
    }
  }

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        <header className="mb-4">
          <Link href="/projects/register" className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← 案件検索・登録へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">新規案件登録</h1>
          <p className="mt-1 text-sm text-stone-500">
            現場名・工事内容・予定を登録して、見積と請求の入口を作ります。
          </p>
        </header>

        <div className="space-y-3">

          {/* 基本情報 */}
          <div className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
            <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">基本情報</h2>

            <div>
              <label htmlFor="projectName" className={labelCls}>案件名 <span className="text-[#8B4A3C]">*</span></label>
              <input id="projectName" name="projectName" type="text" value={form.projectName} onChange={handleChange}
                placeholder="例：〇〇マンション クロス貼替" className={inputCls} />
            </div>
            <div>
              <label htmlFor="clientName" className={labelCls}>元請け・顧客名</label>
              <input id="clientName" name="clientName" type="text" value={form.clientName} onChange={handleChange}
                placeholder="例：△△工務店" className={inputCls} />
            </div>
            <div>
              <label htmlFor="contactName" className={labelCls}>担当者</label>
              <input id="contactName" name="contactName" type="text" value={form.contactName} onChange={handleChange}
                placeholder="例：山田様" className={inputCls} />
            </div>
            <div>
              <label htmlFor="address" className={labelCls}>現場住所</label>
              <input id="address" name="address" type="text" value={form.address} onChange={handleChange}
                placeholder="例：大阪府堺市〇〇区" className={inputCls} />
            </div>
            <div>
              <label htmlFor="koujiType" className={labelCls}>工事種別</label>
              <select id="koujiType" name="koujiType" value={form.koujiType} onChange={handleChange} className={inputCls}>
                <option value="">選択してください</option>
                {KOUJI_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="koujiContent" className={labelCls}>工事内容</label>
              <textarea id="koujiContent" name="koujiContent" rows={3} value={form.koujiContent} onChange={handleChange}
                placeholder="例：洋室クロス貼替、洗面所CF貼替など" className={inputCls + " resize-none"} />
            </div>
            <div>
              <label htmlFor="scaleNote" className={labelCls}>工事規模メモ</label>
              <textarea id="scaleNote" name="scaleNote" rows={3} value={form.scaleNote} onChange={handleChange}
                placeholder="例：クロス約50m、CF約8㎡、巾木20枚など" className={inputCls + " resize-none"} />
              <p className="mt-1 text-xs text-stone-400">材料計算・見積のたたき台に使います</p>
            </div>
            <div>
              <label htmlFor="parkingNote" className={labelCls}>駐車場・搬入条件</label>
              <textarea id="parkingNote" name="parkingNote" rows={3} value={form.parkingNote} onChange={handleChange}
                placeholder="例：駐車場なし、EVあり、階段3階、夜間作業不可など" className={inputCls + " resize-none"} />
              <p className="mt-1 text-xs text-stone-400">諸経費・人工・段取りの確認に使います</p>
            </div>
            <div>
              <label htmlFor="sekouDate" className={labelCls}>施工予定日</label>
              <input id="sekouDate" name="sekouDate" type="date" value={form.sekouDate} onChange={handleChange} className={inputCls} />
            </div>
          </div>

          {/* ステータス */}
          <div className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
            <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">ステータス</h2>
            <div>
              <label htmlFor="mitsumoriState" className={labelCls}>見積状態</label>
              <select id="mitsumoriState" name="mitsumoriState" value={form.mitsumoriState} onChange={handleChange} className={inputCls}>
                {MITSUMORI_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="seikyuuState" className={labelCls}>請求状態</label>
              <select id="seikyuuState" name="seikyuuState" value={form.seikyuuState} onChange={handleChange} className={inputCls}>
                {SEIKYUU_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* メモ */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <label htmlFor="memo" className={labelCls}>メモ</label>
            <textarea id="memo" name="memo" rows={4} value={form.memo} onChange={handleChange}
              placeholder="例：元請けへの注意点、施主希望、追加確認事項など" className={inputCls + " resize-none"} />
          </div>

          {/* ── 登録内容確認カード ── */}
          <div className="overflow-hidden rounded-2xl shadow-sm ring-2 ring-[#8B4A3C]/20">
            <div className="bg-[#8B4A3C] px-4 py-3">
              <h2 className="text-sm font-bold text-white">登録内容確認</h2>
              <p className="mt-0.5 text-xs text-amber-100">登録前に内容を確認してください。</p>
            </div>
            <div className="bg-[#fff8f5] p-4">
              <ul className="space-y-2">
                <ConfirmRow label="元請名・顧客名"  value={form.clientName} />
                <ConfirmRow label="担当者"          value={form.contactName} />
                <ConfirmRow label="案件名"          value={form.projectName} />
                <ConfirmRow label="現場住所"        value={form.address} />
                <ConfirmRow label="工事種別"        value={form.koujiType} />
                <ConfirmRow label="工事内容"        value={form.koujiContent} />
                <ConfirmRow label="工事規模メモ"    value={form.scaleNote} />
                <ConfirmRow label="駐車場・搬入条件" value={form.parkingNote} />
                <ConfirmRow label="施工予定日"      value={form.sekouDate.replace(/-/g, "/")} />
                <ConfirmRow label="見積状態"        value={form.mitsumoriState} />
                <ConfirmRow label="請求状態"        value={form.seikyuuState} />
              </ul>
            </div>
          </div>

          {/* ボタン群 */}
          <div className="space-y-3 pb-8 pt-1">
            <button
              type="button"
              onClick={handleDraftSave}
              className="w-full rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80"
            >
              仮保存
            </button>
            {savedMsg && (
              <div className="rounded-xl bg-green-50 px-4 py-3 ring-1 ring-green-200">
                <p className="text-sm font-bold text-green-700">{savedMsg}</p>
              </div>
            )}
            <Link
              href="/projects/sample/estimate"
              className="flex w-full items-center justify-center rounded-2xl border-2 border-[#8B4A3C] bg-white py-4 text-base font-bold text-[#8B4A3C] shadow-sm active:opacity-80"
            >
              見積もり作成開始
            </Link>
            <button
              type="button"
              onClick={() => {
                alert("案件を仮登録しました。案件詳細画面へ進みます。");
                router.push("/projects/sample");
              }}
              className="w-full rounded-2xl border border-stone-300 bg-white py-4 text-base font-bold text-stone-600 shadow-sm active:opacity-80"
            >
              案件詳細へ進む
            </button>
            <Link
              href="/"
              className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-3 text-sm font-bold text-stone-400 shadow-sm active:opacity-80"
            >
              ホームへ戻る
            </Link>
            <div className="flex justify-end pt-1">
              <Link href="/test-feedback" className="text-xs text-stone-400 underline underline-offset-2 hover:text-[#8B4A3C]">
                この画面の感想を書く
              </Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
