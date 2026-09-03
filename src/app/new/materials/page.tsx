"use client";

// 新UI 発注（/new/materials）
// 旧 /materials（ハブ）を新UIデザインで置き換える入口画面。
// ・既存ロジック/データはそのまま再利用（savedMaterialOrders を読むだけ）。
// ・材料計算などの深い機能は既存画面へ遷移（機能の二重実装はしない）。
// ・拾い出し（/new/takeoff）からの「発注候補」もここで確認できる。

import Link from "next/link";
import { useEffect, useState } from "react";
import PageHeader from "../_components/PageHeader";
import {
  getSavedMaterialOrders,
  type SavedMaterialOrder,
} from "@/app/utils/savedMaterialOrders";

const MENU = [
  { icon: "🎙", title: "拾い出しから発注候補を作る", desc: "音声採寸→数量→発注候補", href: "/new/takeoff", primary: true, old: false },
  { icon: "📐", title: "材料計算", desc: "案件を選んで必要数量を計算", href: "/projects/sample/materials", primary: false, old: true },
  { icon: "⏰", title: "材料アラート確認", desc: "施工日前の発注漏れを確認", href: "/schedule", primary: false, old: true },
];

export default function NewMaterialsPage() {
  const [ready, setReady] = useState(false);
  const [orders, setOrders] = useState<SavedMaterialOrder[]>([]);

  useEffect(() => {
    setOrders(getSavedMaterialOrders());
    setReady(true);
  }, []);

  return (
    <div>
      <PageHeader title="発注" subtitle="材料の数量計算と発注候補の管理" back="/new/create" />

      <div className="space-y-4 px-4 py-4">
        {/* メニュー */}
        <section className="space-y-2">
          {MENU.map((m) => (
            <Link
              key={m.title}
              href={m.href}
              className={`flex items-center gap-3 rounded-2xl border p-4 shadow-sm active:opacity-85 ${
                m.primary
                  ? "border-transparent bg-[var(--nu-primary)] text-[var(--nu-on-primary)]"
                  : "border-[var(--nu-border)] bg-white"
              }`}
            >
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl ${
                  m.primary ? "bg-white/15" : "bg-[var(--nu-primary-bg)]"
                }`}
              >
                {m.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-bold ${m.primary ? "" : "text-[var(--nu-text)]"}`}>
                  {m.title}
                </span>
                <span className={`block text-xs ${m.primary ? "opacity-85" : "text-slate-500"}`}>
                  {m.desc}
                  {m.old && "（既存画面へ移動）"}
                </span>
              </span>
              <span className={`shrink-0 text-lg ${m.primary ? "opacity-70" : "text-slate-300"}`}>›</span>
            </Link>
          ))}
        </section>

        {/* 発注候補・保存済み材料リスト（既存データの読み取り表示） */}
        <section>
          <h2 className="mb-2 px-1 text-sm font-bold text-[var(--nu-text)]">保存済みの材料リスト</h2>
          {!ready ? (
            <div className="h-16 animate-pulse rounded-2xl bg-white" />
          ) : orders.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[var(--nu-border)] bg-white px-4 py-6 text-center text-sm text-slate-500">
              保存済みの材料リストはまだありません。<br />
              拾い出しの「発注候補へ追加」か、材料計算から作成できます。
            </p>
          ) : (
            <ul className="space-y-2">
              {orders.slice(0, 10).map((o) => (
                <li key={o.id} className="rounded-2xl border border-[var(--nu-border)] bg-white p-3.5 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--nu-text)]">
                      {o.projectName || "（案件名なし）"}
                    </p>
                    <span className="shrink-0 rounded-full bg-[var(--nu-primary-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--nu-primary-dk)]">
                      {o.rows.length}行
                    </span>
                  </div>
                  <ul className="mt-1.5 space-y-0.5">
                    {o.rows.slice(0, 3).map((r) => (
                      <li key={r.id} className="flex justify-between text-xs text-slate-600">
                        <span className="min-w-0 truncate">
                          {[r.koujiType, r.itemName].filter(Boolean).join(" ") || "（品目未設定）"}
                        </span>
                        <span className="shrink-0 font-semibold text-[var(--nu-text)]">
                          {r.qty}{r.unit}
                        </span>
                      </li>
                    ))}
                    {o.rows.length > 3 && (
                      <li className="text-[11px] text-slate-400">ほか{o.rows.length - 3}行</li>
                    )}
                  </ul>
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    {new Date(o.updatedAt).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" })} 更新
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
