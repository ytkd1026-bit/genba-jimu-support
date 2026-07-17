"use client";

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import { getCustomers, saveCustomer, deleteCustomer, type Customer } from "@/app/utils/customers";
import { draftKey } from "@/app/utils/draftStorage";
import { useAutoDraft } from "@/hooks/useAutoDraft";
import { SaveStatusBar } from "@/components/SaveStatusBar";

const EMPTY_FORM = {
  name: "",
  contactName: "",
  tel: "",
  email: "",
  address: "",
  memo: "",
};

// 得意先フォームの自動下書き（入力消失対策）。
// この画面は自動下書き未適用だったため、ページが再読み込みされると
// 入力途中の内容が全消失していた（他の入力画面と同じ保護を適用する）。
type CustomerDraftData = {
  form: typeof EMPTY_FORM;
  editId: string | null;
  showForm: boolean;
};

const CUSTOMER_DRAFT_KEY = draftKey("customer", "new");

const labelCls = "mb-1 block text-sm font-bold text-stone-700";
const inputCls = "w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-2 focus:ring-[#8B4A3C]/20";

export default function CustomersPage() {
  const [customers, setCustomers]   = useState<Customer[]>([]);
  const [showForm,  setShowForm]    = useState(false);
  const [editId,    setEditId]      = useState<string | null>(null);
  const [form,      setForm]        = useState(EMPTY_FORM);
  const [savedMsg,  setSavedMsg]    = useState("");
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);

  useEffect(() => {
    setCustomers(getCustomers());
  }, []);

  // ── 自動下書き保存（フォーム表示中のみ） ────────────────────
  const draftData = useMemo<CustomerDraftData>(
    () => ({ form, editId, showForm }),
    [form, editId, showForm],
  );
  const { saveStatus, savedAt, clearDraft, restoredDraft } = useAutoDraft<CustomerDraftData>(
    CUSTOMER_DRAFT_KEY, "customer", "new", draftData,
    { enabled: showForm, debounceMs: 800 },
  );

  // 前回、保存せずにページが閉じられた／再読み込みされた場合のみ下書きが残っている
  useEffect(() => {
    if (restoredDraft?.data?.showForm) setShowRestoreBanner(true);
  }, [restoredDraft]);

  function handleRestoreDraft() {
    if (!restoredDraft?.data) return;
    setForm(restoredDraft.data.form);
    setEditId(restoredDraft.data.editId);
    setShowForm(true);
    setShowRestoreBanner(false);
  }

  function handleDiscardDraft() {
    clearDraft();
    setShowRestoreBanner(false);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleAddNew() {
    setForm(EMPTY_FORM);
    setEditId(null);
    setShowForm(true);
  }

  function handleEdit(c: Customer) {
    setForm({
      name:        c.name,
      contactName: c.contactName,
      tel:         c.tel,
      email:       c.email,
      address:     c.address,
      memo:        c.memo,
    });
    setEditId(c.id);
    setShowForm(true);
  }

  function handleCancel() {
    setShowForm(false);
    setEditId(null);
    setForm(EMPTY_FORM);
    clearDraft(); // 意図的な破棄のため下書きも削除
  }

  function handleSave() {
    if (!form.name.trim()) {
      setSavedMsg("会社名・元請名を入力してください。");
      setTimeout(() => setSavedMsg(""), 3000);
      return;
    }
    const now = new Date().toLocaleString("ja-JP");
    const customer: Customer = {
      id:          editId ?? `cust-${Date.now()}`,
      name:        form.name.trim(),
      contactName: form.contactName.trim(),
      tel:         form.tel.trim(),
      email:       form.email.trim(),
      address:     form.address.trim(),
      memo:        form.memo.trim(),
      createdAt:   now,
    };
    saveCustomer(customer);
    setCustomers(getCustomers());
    setShowForm(false);
    setEditId(null);
    setForm(EMPTY_FORM);
    clearDraft(); // 本保存が完了したため自動下書きは削除する
    setSavedMsg(editId ? "得意先を更新しました。" : "得意先を登録しました。");
    setTimeout(() => setSavedMsg(""), 4000);
  }

  function handleDelete(id: string, name: string) {
    if (!window.confirm(`「${name}」を削除しますか？`)) return;
    deleteCustomer(id);
    setCustomers(getCustomers());
  }

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        <header className="mb-4">
          <Link href="/projects/new"
            className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← 新規案件登録へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">得意先管理</h1>
          <p className="mt-1 text-sm text-stone-500">
            案件でよく使う元請・発注先を登録します。
          </p>
        </header>

        <div className="space-y-3">

          {/* 保存メッセージ */}
          {savedMsg && (
            <div className="rounded-xl bg-green-50 px-4 py-3 ring-1 ring-green-200">
              <p className="text-sm font-bold text-green-700">{savedMsg}</p>
            </div>
          )}

          {/* 下書き復元バナー（再読み込み等で入力が中断された場合） */}
          {showRestoreBanner && restoredDraft && (
            <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
              <p className="text-xs font-bold text-amber-800">保存されていない得意先の入力があります。</p>
              <p className="mt-0.5 text-xs text-amber-700">
                最終更新：{new Date(restoredDraft.updatedAt).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" })}
              </p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={handleRestoreDraft}
                  className="min-h-[44px] flex-1 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white active:opacity-80">
                  下書きを復元する
                </button>
                <button type="button" onClick={handleDiscardDraft}
                  className="min-h-[44px] flex-1 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-700 active:opacity-80">
                  破棄する
                </button>
              </div>
            </div>
          )}

          {/* 自動下書きの保存状態（フォーム表示中のみ動作） */}
          <SaveStatusBar status={saveStatus} savedAt={savedAt} />

          {/* 追加ボタン */}
          {!showForm && (
            <button
              type="button"
              onClick={handleAddNew}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80"
            >
              <span className="text-xl leading-none">＋</span>
              得意先を追加
            </button>
          )}

          {/* 登録・編集フォーム */}
          {showForm && (
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-2 ring-[#8B4A3C]/30">
              <div className="bg-[#8B4A3C] px-4 py-3">
                <h2 className="text-sm font-bold text-white">
                  {editId ? "得意先を編集" : "得意先を新規登録"}
                </h2>
                <p className="mt-0.5 text-xs text-amber-100">
                  よく使う元請・発注先を登録しておくと、案件登録がスムーズになります。
                </p>
              </div>
              <div className="space-y-4 p-4">
                <div>
                  <label className={labelCls}>
                    会社名・元請名 <span className="text-[#8B4A3C]">*</span>
                  </label>
                  <input
                    name="name" type="text" value={form.name} onChange={handleChange}
                    placeholder="例：△△工務店" className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>担当者名</label>
                  <input
                    name="contactName" type="text" value={form.contactName} onChange={handleChange}
                    placeholder="例：山田様" className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>電話番号</label>
                  <input
                    name="tel" type="tel" value={form.tel} onChange={handleChange}
                    placeholder="例：06-0000-0000" className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>メールアドレス</label>
                  <input
                    name="email" type="email" value={form.email} onChange={handleChange}
                    placeholder="例：info@example.com" className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>住所</label>
                  <input
                    name="address" type="text" value={form.address} onChange={handleChange}
                    placeholder="例：大阪府堺市〇〇区" className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>メモ</label>
                  <textarea
                    name="memo" rows={3} value={form.memo} onChange={handleChange}
                    placeholder="例：月末締め翌月末払い、担当者の注意点など"
                    className={inputCls + " resize-none"}
                  />
                </div>
                <div className="flex gap-2.5">
                  <button type="button" onClick={handleCancel}
                    className="flex-1 rounded-xl border border-stone-200 bg-white py-3 text-sm font-bold text-stone-500 active:opacity-80">
                    キャンセル
                  </button>
                  <button type="button" onClick={handleSave}
                    className="flex-1 rounded-xl bg-[#8B4A3C] py-3 text-sm font-bold text-white active:opacity-80">
                    {editId ? "更新する" : "登録する"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 得意先一覧 */}
          {customers.length === 0 && !showForm ? (
            <div className="rounded-2xl border-2 border-dashed border-stone-200 px-4 py-10 text-center">
              <p className="text-sm text-stone-500">得意先はまだ登録されていません。</p>
              <p className="mt-1.5 text-sm text-stone-500">
                案件でよく使う元請・発注先を登録しておくと、案件登録がスムーズになります。
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {customers.map((c) => (
                <div key={c.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-100">
                  <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-4 py-2.5">
                    <p className="text-sm font-bold text-stone-800">{c.name}</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleEdit(c)}
                        className="rounded-lg border border-stone-200 px-3 py-1 text-xs font-bold text-stone-600 active:opacity-70">
                        編集
                      </button>
                      <button type="button" onClick={() => handleDelete(c.id, c.name)}
                        className="rounded-lg border border-red-200 px-3 py-1 text-xs font-bold text-red-400 active:opacity-70">
                        削除
                      </button>
                    </div>
                  </div>
                  <div className="px-4 py-3 space-y-0.5">
                    {c.contactName && (
                      <p className="text-xs text-stone-600">担当：{c.contactName}</p>
                    )}
                    {c.tel && (
                      <p className="text-xs text-stone-500">TEL：{c.tel}</p>
                    )}
                    {c.address && (
                      <p className="text-xs text-stone-400">{c.address}</p>
                    )}
                    {c.memo && (
                      <p className="text-xs text-stone-400 line-clamp-2">{c.memo}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pb-8 pt-2 space-y-2.5">
            <Link href="/projects/new"
              className="flex w-full items-center justify-center rounded-2xl border border-[#8B4A3C] bg-white py-3.5 text-sm font-bold text-[#8B4A3C] shadow-sm active:opacity-80">
              新規案件登録へ戻る
            </Link>
            <Link href="/"
              className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-3 text-sm font-bold text-stone-400 shadow-sm active:opacity-80">
              ホームへ戻る
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
