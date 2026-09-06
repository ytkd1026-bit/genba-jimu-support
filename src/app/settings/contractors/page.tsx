"use client";

// 元請マスタ管理
//
// 一度登録した元請を見積作成で使い回す（毎回入力しない）。将来の初回設定導線にも組み込む。
// 見積へは contractorId で関連付けるため、ここが元請情報の正本になる。

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { type Contractor } from "@/app/utils/contractorMaster";
import { newRecordIsTestData } from "@/app/utils/devData";
import { contractorRepository } from "@/app/repositories/contractorRepository";

const inputCls =
  "w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-base text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-2 focus:ring-[#8B4A3C]/20";
const labelCls = "mb-1 block text-xs font-bold text-stone-600";

type FormState = {
  id: string | null;
  name: string;
  contactName: string;
  postalCode: string;
  address: string;
  tel: string;
  email: string;
  closingDay: string;
  paymentTerms: string;
  note: string;
  active: boolean;
};

const EMPTY: FormState = {
  id: null, name: "", contactName: "", postalCode: "", address: "", tel: "", email: "",
  closingDay: "", paymentTerms: "", note: "", active: true,
};

function toForm(c: Contractor): FormState {
  return {
    id: c.id, name: c.name, contactName: c.contactName, postalCode: c.postalCode, address: c.address,
    tel: c.tel, email: c.email, closingDay: c.closingDay, paymentTerms: c.paymentTerms, note: c.note, active: c.active,
  };
}

export default function ContractorsPage() {
  const [items, setItems] = useState<Contractor[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [msg, setMsg] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  async function reload() {
    try {
      setItems(await contractorRepository.list());
    } catch {
      setMsg("読み込みに失敗しました（通信エラー）。");
      setTimeout(() => setMsg(null), 4000);
    }
  }
  useEffect(() => {
    void reload();
  }, []);

  const editing = form.id !== null;
  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function resetForm() {
    setForm(EMPTY);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setMsg("元請名は必須です。");
      setTimeout(() => setMsg(null), 4000);
      return;
    }
    setSaving(true);
    setMsg("保存中…");
    let res: { ok: boolean; error?: string };
    if (form.id) {
      const existing = items.find((c) => c.id === form.id);
      res = await contractorRepository.upsert({
        id: form.id,
        name: form.name.trim(),
        contactName: form.contactName.trim(),
        postalCode: form.postalCode.trim(),
        address: form.address.trim(),
        tel: form.tel.trim(),
        email: form.email.trim(),
        closingDay: form.closingDay.trim(),
        paymentTerms: form.paymentTerms.trim(),
        note: form.note.trim(),
        active: form.active,
        isTestData: existing?.isTestData ?? newRecordIsTestData(),
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } else {
      res = await contractorRepository.create({
        name: form.name.trim(),
        contactName: form.contactName.trim(),
        postalCode: form.postalCode.trim(),
        address: form.address.trim(),
        tel: form.tel.trim(),
        email: form.email.trim(),
        closingDay: form.closingDay.trim(),
        paymentTerms: form.paymentTerms.trim(),
        note: form.note.trim(),
        active: form.active,
        isTestData: newRecordIsTestData(),
      });
    }
    setSaving(false);
    if (res.ok) {
      await reload();
      resetForm();
      setMsg(form.id ? "元請を更新しました。" : "元請を追加しました。");
    } else {
      setMsg(`保存できませんでした（通信エラー）：${res.error ?? ""}`);
    }
    setTimeout(() => setMsg(null), 5000);
  }

  async function handleDelete(id: string) {
    if (!confirm("この元請を削除しますか？（過去に発行した見積の提出先情報は保持されます）")) return;
    const res = await contractorRepository.remove(id);
    if (!res.ok) {
      setMsg(`削除できませんでした（通信エラー）：${res.error ?? ""}`);
      setTimeout(() => setMsg(null), 5000);
      return;
    }
    await reload();
    if (form.id === id) resetForm();
  }

  async function toggleActive(c: Contractor) {
    await contractorRepository.upsert({ ...c, active: !c.active });
    await reload();
  }

  const sorted = useMemo(() => items.slice().sort((a, b) => a.name.localeCompare(b.name, "ja")), [items]);

  return (
    <div className="min-h-screen bg-[#fdf8f2] pb-16">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">
        <header className="mb-3">
          <Link href="/" className="mb-2 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">← ホームへ戻る</Link>
          <h1 className="text-xl font-bold text-stone-800">元請マスタ</h1>
          <p className="mt-1 text-sm text-stone-500">一度登録した元請は、見積作成で選ぶだけになります。毎回入力する必要はありません。</p>
        </header>

        {msg && <div className="mb-3 rounded-xl bg-green-50 px-3 py-2 text-xs font-bold text-green-700 ring-1 ring-green-200">{msg}</div>}

        <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
          <h2 className="mb-3 text-sm font-bold text-stone-700">{editing ? "元請を編集" : "元請を追加"}</h2>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className={labelCls}>元請名 / 会社名 *</label>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="株式会社〇〇" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>担当者名</label>
              <input value={form.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="〇〇 様" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>電話番号</label>
              <input value={form.tel} onChange={(e) => set("tel", e.target.value)} placeholder="06-0000-0000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>郵便番号</label>
              <input value={form.postalCode} onChange={(e) => set("postalCode", e.target.value)} placeholder="〒000-0000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>メール</label>
              <input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="example@example.com" className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>住所</label>
              <input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="大阪府〇〇市〇〇" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>締日</label>
              <input value={form.closingDay} onChange={(e) => set("closingDay", e.target.value)} placeholder="末日 / 20日" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>支払条件</label>
              <input value={form.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} placeholder="翌月末払い" className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>備考</label>
              <input value={form.note} onChange={(e) => set("note", e.target.value)} className={inputCls} />
            </div>
            <div className="col-span-2 flex items-center">
              <label className="flex min-h-[44px] items-center gap-2 text-sm text-stone-700">
                <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} className="h-5 w-5 accent-[#8B4A3C]" />
                有効
              </label>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={handleSave} disabled={saving} className="min-h-[48px] flex-1 rounded-xl bg-[#8B4A3C] px-4 py-3 text-sm font-bold text-white active:opacity-80 disabled:opacity-50">{editing ? "更新する" : "追加する"}</button>
            {editing && <button type="button" onClick={resetForm} className="min-h-[48px] rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold text-stone-600 active:opacity-80">新規に戻す</button>}
          </div>
        </div>

        <div className="space-y-2">
          {sorted.length === 0 && <p className="text-sm text-stone-400">まだ元請が登録されていません。</p>}
          {sorted.map((c) => (
            <div key={c.id} className={`rounded-xl bg-white p-3 shadow-sm ring-1 ${c.active ? "ring-stone-100" : "opacity-60 ring-stone-200"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-stone-800">{c.name}{c.contactName ? <span className="ml-1 text-xs font-normal text-stone-400">/ {c.contactName}</span> : null}</p>
                  <p className="mt-0.5 text-xs text-stone-500">{[c.tel, c.email, c.address].filter(Boolean).join("・") || "連絡先未登録"}</p>
                  {(c.closingDay || c.paymentTerms) && <p className="mt-0.5 text-[11px] text-stone-400">締日{c.closingDay || "—"}・{c.paymentTerms || "支払条件未設定"}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <button type="button" onClick={() => setForm(toForm(c))} className="text-xs font-bold text-[#8B4A3C]">編集</button>
                  <button type="button" onClick={() => toggleActive(c)} className="text-xs text-stone-400">{c.active ? "無効化" : "有効化"}</button>
                  <button type="button" onClick={() => handleDelete(c.id)} className="text-xs text-stone-300 hover:text-red-500">削除</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
