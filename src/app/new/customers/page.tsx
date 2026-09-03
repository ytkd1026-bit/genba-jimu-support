"use client";

import Link from "next/link";
import PageHeader from "@/app/new/_components/PageHeader";
import { useState, useEffect } from "react";
import { getCustomers, saveCustomer, deleteCustomer, type Customer } from "@/app/utils/customers";

const EMPTY_FORM = {
  name: "",
  contactName: "",
  tel: "",
  email: "",
  address: "",
  memo: "",
};

const labelCls = "mb-1 block text-sm font-bold text-[var(--nu-text)]";
const inputCls = "w-full rounded-xl border border-[var(--nu-border)] bg-white px-4 py-3 text-base text-[var(--nu-text)] placeholder:text-slate-300 focus:border-[var(--nu-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-primary)]/20";

export default function CustomersPage() {
  const [customers, setCustomers]   = useState<Customer[]>([]);
  const [showForm,  setShowForm]    = useState(false);
  const [editId,    setEditId]      = useState<string | null>(null);
  const [form,      setForm]        = useState(EMPTY_FORM);
  const [savedMsg,  setSavedMsg]    = useState("");

  useEffect(() => {
    setCustomers(getCustomers());
  }, []);

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
    setSavedMsg(editId ? "得意先を更新しました。" : "得意先を登録しました。");
    setTimeout(() => setSavedMsg(""), 4000);
  }

  function handleDelete(id: string, name: string) {
    if (!window.confirm(`「${name}」を削除しますか？`)) return;
    deleteCustomer(id);
    setCustomers(getCustomers());
  }

  return (
    <div className="">
      <PageHeader title="取引先管理" subtitle="元請・顧客・協力会社" back="/new/my" />
      <div className="px-4 py-4">

        <div className="space-y-3">

          {/* 保存メッセージ */}
          {savedMsg && (
            <div className="rounded-xl bg-green-50 px-4 py-3 ring-1 ring-green-200">
              <p className="text-sm font-bold text-green-700">{savedMsg}</p>
            </div>
          )}

          {/* 追加ボタン */}
          {!showForm && (
            <button
              type="button"
              onClick={handleAddNew}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--nu-primary)] py-4 text-base font-bold text-white shadow-sm active:opacity-80"
            >
              <span className="text-xl leading-none">＋</span>
              得意先を追加
            </button>
          )}

          {/* 登録・編集フォーム */}
          {showForm && (
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-2 ring-[var(--nu-primary)]/30">
              <div className="bg-[var(--nu-primary)] px-4 py-3">
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
                    会社名・元請名 <span className="text-[var(--nu-primary)]">*</span>
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
                    className="flex-1 rounded-xl border border-[var(--nu-border)] bg-white py-3 text-sm font-bold text-slate-500 active:opacity-80">
                    キャンセル
                  </button>
                  <button type="button" onClick={handleSave}
                    className="flex-1 rounded-xl bg-[var(--nu-primary)] py-3 text-sm font-bold text-white active:opacity-80">
                    {editId ? "更新する" : "登録する"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 得意先一覧 */}
          {customers.length === 0 && !showForm ? (
            <div className="rounded-2xl border-2 border-dashed border-[var(--nu-border)] px-4 py-10 text-center">
              <p className="text-sm text-slate-500">得意先はまだ登録されていません。</p>
              <p className="mt-1.5 text-sm text-slate-500">
                案件でよく使う元請・発注先を登録しておくと、案件登録がスムーズになります。
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {customers.map((c) => (
                <div key={c.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-[var(--nu-border-soft)]">
                  <div className="flex items-center justify-between border-b border-[var(--nu-border-soft)] bg-[var(--nu-bg)] px-4 py-2.5">
                    <p className="text-sm font-bold text-[var(--nu-text)]">{c.name}</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleEdit(c)}
                        className="rounded-lg border border-[var(--nu-border)] px-3 py-1 text-xs font-bold text-slate-600 active:opacity-70">
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
                      <p className="text-xs text-slate-600">担当：{c.contactName}</p>
                    )}
                    {c.tel && (
                      <p className="text-xs text-slate-500">TEL：{c.tel}</p>
                    )}
                    {c.address && (
                      <p className="text-xs text-slate-400">{c.address}</p>
                    )}
                    {c.memo && (
                      <p className="text-xs text-slate-400 line-clamp-2">{c.memo}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pb-8 pt-2 space-y-2.5">
            <Link href="/new/projects/new"
              className="flex w-full items-center justify-center rounded-2xl border border-[var(--nu-primary)] bg-white py-3.5 text-sm font-bold text-[var(--nu-primary)] shadow-sm active:opacity-80">
              新規案件登録へ戻る
            </Link>
            <Link href="/new"
              className="flex w-full items-center justify-center rounded-2xl border border-[var(--nu-border)] bg-white py-3 text-sm font-bold text-slate-400 shadow-sm active:opacity-80">
              ホームへ戻る
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
