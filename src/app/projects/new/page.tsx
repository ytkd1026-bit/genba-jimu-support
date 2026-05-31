"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { getCustomers, type Customer } from "@/app/utils/customers";

const DRAFT_PROJECT_KEY = "genba_jimu_new_project_draft";

// ─── 工事種別（複数選択） ────────────────────────────────────────
const KOUJI_TYPE_OPTIONS = [
  "新築工事",
  "リノベーション工事",
  "リフォーム工事",
  "原状回復工事",
  "その他工事",
];

// ─── 工事内容（複数選択） ────────────────────────────────────────
const KOUJI_CONTENT_OPTIONS = [
  "大工工事",
  "電気工事",
  "設備工事",
  "内装工事",
  "美装工事",
  "リペア工事",
  "その他工事",
];

const MITSUMORI_STATES = ["未作成", "作成中", "提出済み", "受注"];
const SEIKYUU_STATES   = ["未請求", "請求済み", "入金済み"];

const labelCls = "block text-sm font-bold text-stone-700 mb-1";
const inputCls = "w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-2 focus:ring-[#8B4A3C]/20";
const checkboxRowCls = "flex cursor-pointer items-center gap-2.5 rounded-xl border border-stone-100 bg-stone-50 px-3 py-2.5 active:bg-stone-100";

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

  // 得意先
  const [customers,           setCustomers]           = useState<Customer[]>([]);
  const [selectedCustomerId,  setSelectedCustomerId]  = useState<string>("");
  const [showCustomerPicker,  setShowCustomerPicker]  = useState(false);

  // 保存メッセージ
  const [savedMsg, setSavedMsg] = useState("");

  // フォーム
  const [form, setForm] = useState({
    projectName:        "",
    clientName:         "",
    contactName:        "",
    address:            "",
    koujiTypes:         [] as string[],
    koujiTypeOther:     "",
    koujiContents:      [] as string[],
    koujiContentCustom: "",
    koujiContentMemo:   "",
    scaleNote:          "",
    parkingNote:        "",
    sekouDate:          "",
    mitsumoriState:     "未作成",
    seikyuuState:       "未請求",
    memo:               "",
  });

  useEffect(() => {
    setCustomers(getCustomers());
  }, []);

  // ─── テキスト系フィールド ────────────────────────────────────────
  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  // ─── 工事種別トグル ──────────────────────────────────────────────
  function toggleKoujiType(type: string) {
    setForm((prev) => ({
      ...prev,
      koujiTypes: prev.koujiTypes.includes(type)
        ? prev.koujiTypes.filter((t) => t !== type)
        : [...prev.koujiTypes, type],
    }));
  }

  // ─── 工事内容トグル ──────────────────────────────────────────────
  function toggleKoujiContent(content: string) {
    setForm((prev) => ({
      ...prev,
      koujiContents: prev.koujiContents.includes(content)
        ? prev.koujiContents.filter((c) => c !== content)
        : [...prev.koujiContents, content],
    }));
  }

  // ─── 得意先選択 ──────────────────────────────────────────────────
  function handleSelectCustomer(c: Customer) {
    setForm((prev) => ({
      ...prev,
      clientName:  c.name,
      contactName: c.contactName,
    }));
    setSelectedCustomerId(c.id);
    setShowCustomerPicker(false);
  }

  // ─── 確認表示用の結合値 ─────────────────────────────────────────
  function koujiTypeLabel(): string {
    const parts = [...form.koujiTypes];
    if (form.koujiTypeOther.trim()) parts.push(form.koujiTypeOther.trim());
    return parts.join("・");
  }

  function koujiContentLabel(): string {
    const parts = [...form.koujiContents];
    if (form.koujiContentCustom.trim()) parts.push(form.koujiContentCustom.trim());
    return parts.join("・");
  }

  // ─── 下書き保存 ─────────────────────────────────────────────────
  function handleDraftSave() {
    try {
      const draft = {
        ...form,
        koujiTypeLabel:    koujiTypeLabel(),
        koujiContentLabel: koujiContentLabel(),
        savedAt:           new Date().toLocaleString("ja-JP"),
      };
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
          <Link href="/projects/register"
            className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← 案件検索・登録へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">新規案件登録</h1>
          <p className="mt-1 text-sm text-stone-500">
            現場名・工事内容・予定を登録して、見積と請求の入口を作ります。
          </p>
        </header>

        <div className="space-y-3">

          {/* ── 得意先選択 ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <h2 className="text-sm font-bold text-stone-700">元請・得意先を選ぶ</h2>
              <Link href="/customers"
                className="text-xs text-[#8B4A3C] underline underline-offset-2 active:opacity-70">
                得意先一覧へ進む
              </Link>
            </div>

            {customers.length === 0 ? (
              <div className="rounded-xl bg-stone-50 px-4 py-3 text-center">
                <p className="text-xs text-stone-500">得意先が登録されていません。</p>
                <Link href="/customers"
                  className="mt-1.5 inline-block rounded-xl border border-[#8B4A3C] px-4 py-2 text-xs font-bold text-[#8B4A3C] active:opacity-75">
                  得意先を追加する
                </Link>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setShowCustomerPicker((v) => !v)}
                  className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm active:opacity-80"
                >
                  <span className={selectedCustomerId ? "font-bold text-stone-800" : "text-stone-400"}>
                    {selectedCustomerId
                      ? (customers.find((c) => c.id === selectedCustomerId)?.name ?? "得意先を選択")
                      : "得意先を選択"}
                  </span>
                  <span className="text-stone-400">{showCustomerPicker ? "▲" : "▼"}</span>
                </button>

                {showCustomerPicker && (
                  <div className="space-y-1.5">
                    {customers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectCustomer(c)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left active:opacity-80 ${
                          selectedCustomerId === c.id
                            ? "border-[#8B4A3C] bg-[#fff8f5]"
                            : "border-stone-200 bg-white"
                        }`}
                      >
                        <div>
                          <p className="text-sm font-bold text-stone-800">{c.name}</p>
                          {c.contactName && (
                            <p className="text-xs text-stone-500">担当：{c.contactName}</p>
                          )}
                        </div>
                        {selectedCustomerId === c.id && (
                          <span className="ml-auto text-xs font-bold text-[#8B4A3C]">選択中</span>
                        )}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setShowCustomerPicker(false)}
                      className="w-full rounded-xl border border-stone-200 py-2 text-xs font-bold text-stone-400 active:opacity-70"
                    >
                      閉じる
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── 基本情報 ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
            <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">基本情報</h2>

            <div>
              <label htmlFor="projectName" className={labelCls}>
                案件名 <span className="text-[#8B4A3C]">*</span>
              </label>
              <input
                id="projectName" name="projectName" type="text"
                value={form.projectName} onChange={handleChange}
                placeholder="例：〇〇マンション クロス貼替" className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="clientName" className={labelCls}>元請け・顧客名</label>
              <input
                id="clientName" name="clientName" type="text"
                value={form.clientName} onChange={handleChange}
                placeholder="例：△△工務店" className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="contactName" className={labelCls}>担当者</label>
              <input
                id="contactName" name="contactName" type="text"
                value={form.contactName} onChange={handleChange}
                placeholder="例：山田様" className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="address" className={labelCls}>現場住所</label>
              <input
                id="address" name="address" type="text"
                value={form.address} onChange={handleChange}
                placeholder="例：大阪府堺市〇〇区" className={inputCls}
              />
            </div>

            {/* ── 工事種別（複数選択） ── */}
            <div>
              <label className={labelCls}>工事種別（複数選択可）</label>
              <div className="grid grid-cols-2 gap-1.5">
                {KOUJI_TYPE_OPTIONS.map((type) => {
                  const checked = form.koujiTypes.includes(type);
                  return (
                    <label
                      key={type}
                      className={`${checkboxRowCls} ${checked ? "border-[#8B4A3C]/40 bg-[#fff8f5]" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleKoujiType(type)}
                        className="h-4 w-4 shrink-0 accent-[#8B4A3C]"
                      />
                      <span className={`text-sm ${checked ? "font-bold text-[#8B4A3C]" : "text-stone-700"}`}>
                        {type}
                      </span>
                    </label>
                  );
                })}
              </div>
              {/* 自由入力 */}
              <div className="mt-2">
                <label className="mb-1 block text-xs text-stone-500">その他・自由入力</label>
                <input
                  name="koujiTypeOther"
                  type="text"
                  value={form.koujiTypeOther}
                  onChange={handleChange}
                  placeholder="例：解体工事、外構工事など"
                  className={inputCls.replace("text-base", "text-sm")}
                />
              </div>
            </div>

            {/* ── 工事内容（複数選択） ── */}
            <div>
              <label className={labelCls}>工事内容（複数選択可）</label>
              <div className="space-y-1.5">
                {KOUJI_CONTENT_OPTIONS.map((content) => {
                  const checked = form.koujiContents.includes(content);
                  return (
                    <label
                      key={content}
                      className={`${checkboxRowCls} ${checked ? "border-[#8B4A3C]/40 bg-[#fff8f5]" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleKoujiContent(content)}
                        className="h-4 w-4 shrink-0 accent-[#8B4A3C]"
                      />
                      <span className={`text-sm leading-tight ${checked ? "font-bold text-[#8B4A3C]" : "text-stone-700"}`}>
                        {content}
                      </span>
                    </label>
                  );
                })}
              </div>
              {/* 自由入力 */}
              <div className="mt-2">
                <label className="mb-1 block text-xs text-stone-500">その他・自由入力</label>
                <input
                  name="koujiContentCustom"
                  type="text"
                  value={form.koujiContentCustom}
                  onChange={handleChange}
                  placeholder="例：仮設工事、外構工事など"
                  className={inputCls.replace("text-base", "text-sm")}
                />
              </div>
            </div>

            {/* ── 工事内容メモ ── */}
            <div>
              <label htmlFor="koujiContentMemo" className={labelCls}>工事内容メモ</label>
              <textarea
                id="koujiContentMemo" name="koujiContentMemo" rows={3}
                value={form.koujiContentMemo} onChange={handleChange}
                placeholder="例：洋室クロス貼替、洗面所CF貼替、既存CF撤去あり"
                className={inputCls + " resize-none"}
              />
              <p className="mt-1 text-xs text-stone-400">工事の具体的な施工内容・細目を記入してください</p>
            </div>

            <div>
              <label htmlFor="scaleNote" className={labelCls}>工事規模メモ</label>
              <textarea
                id="scaleNote" name="scaleNote" rows={3}
                value={form.scaleNote} onChange={handleChange}
                placeholder="例：クロス約50m、CF約8㎡、巾木20枚など"
                className={inputCls + " resize-none"}
              />
              <p className="mt-1 text-xs text-stone-400">材料計算・見積のたたき台に使います</p>
            </div>

            <div>
              <label htmlFor="parkingNote" className={labelCls}>駐車場・搬入条件</label>
              <textarea
                id="parkingNote" name="parkingNote" rows={3}
                value={form.parkingNote} onChange={handleChange}
                placeholder="例：駐車場なし、EVあり、階段3階、夜間作業不可など"
                className={inputCls + " resize-none"}
              />
              <p className="mt-1 text-xs text-stone-400">諸経費・人工・段取りの確認に使います</p>
            </div>

            <div>
              <label htmlFor="sekouDate" className={labelCls}>施工予定日</label>
              <input
                id="sekouDate" name="sekouDate" type="date"
                value={form.sekouDate} onChange={handleChange}
                className={inputCls}
              />
            </div>
          </div>

          {/* ── ステータス ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
            <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">ステータス</h2>
            <div>
              <label htmlFor="mitsumoriState" className={labelCls}>見積状態</label>
              <select
                id="mitsumoriState" name="mitsumoriState"
                value={form.mitsumoriState} onChange={handleChange} className={inputCls}
              >
                {MITSUMORI_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="seikyuuState" className={labelCls}>請求状態</label>
              <select
                id="seikyuuState" name="seikyuuState"
                value={form.seikyuuState} onChange={handleChange} className={inputCls}
              >
                {SEIKYUU_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* ── メモ ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <label htmlFor="memo" className={labelCls}>メモ</label>
            <textarea
              id="memo" name="memo" rows={4}
              value={form.memo} onChange={handleChange}
              placeholder="例：元請けへの注意点、施主希望、追加確認事項など"
              className={inputCls + " resize-none"}
            />
          </div>

          {/* ── 登録内容確認カード ── */}
          <div className="overflow-hidden rounded-2xl shadow-sm ring-2 ring-[#8B4A3C]/20">
            <div className="bg-[#8B4A3C] px-4 py-3">
              <h2 className="text-sm font-bold text-white">登録内容確認</h2>
              <p className="mt-0.5 text-xs text-amber-100">登録前に内容を確認してください。</p>
            </div>
            <div className="bg-[#fff8f5] p-4">
              <ul className="space-y-2">
                <ConfirmRow label="元請名・顧客名"   value={form.clientName} />
                <ConfirmRow label="担当者"           value={form.contactName} />
                <ConfirmRow label="案件名"           value={form.projectName} />
                <ConfirmRow label="現場住所"         value={form.address} />
                <ConfirmRow label="工事種別"         value={koujiTypeLabel()} />
                <ConfirmRow label="工事内容"         value={koujiContentLabel()} />
                <ConfirmRow label="工事内容メモ"     value={form.koujiContentMemo} />
                <ConfirmRow label="工事規模メモ"     value={form.scaleNote} />
                <ConfirmRow label="駐車場・搬入条件" value={form.parkingNote} />
                <ConfirmRow label="施工予定日"       value={form.sekouDate.replace(/-/g, "/")} />
                <ConfirmRow label="見積状態"         value={form.mitsumoriState} />
                <ConfirmRow label="請求状態"         value={form.seikyuuState} />
              </ul>
            </div>
          </div>

          {/* ── ボタン群 ── */}
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
              <Link href="/test-feedback"
                className="text-xs text-stone-400 underline underline-offset-2 hover:text-[#8B4A3C]">
                この画面の感想を書く
              </Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
