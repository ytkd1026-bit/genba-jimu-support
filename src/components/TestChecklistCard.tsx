"use client";

// 実機テストチェックリスト（実機テスト準備用・ホーム表示）
// 基本フローを一巡できたかをテスターが自分でチェックする。
// チェック状態は専用の新キーに保存する（既存の業務データ・保存キーには一切触れない）。

import { useEffect, useState } from "react";

const CHECKLIST_KEY = "genba_jimu_test_checklist_v1";

const ITEMS = [
  "案件登録",
  "現場調査",
  "写真台帳",
  "工事項目・原価",
  "見積作成",
  "見積PDF",
  "請求作成",
  "請求PDF",
  "入金確認",
  "利益管理確認",
  "未請求確認",
  "保存データ確認",
] as const;

function loadChecked(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CHECKLIST_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function TestChecklistCard() {
  const [checked, setChecked] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    setChecked(loadChecked());
  }, []);

  if (checked === null) return null;

  const doneCount = ITEMS.filter((i) => checked[i]).length;

  function toggle(item: string) {
    setChecked((prev) => {
      const next = { ...(prev ?? {}), [item]: !(prev ?? {})[item] };
      try {
        localStorage.setItem(CHECKLIST_KEY, JSON.stringify(next));
      } catch {
        // 保存失敗時も画面上のチェックは維持する
      }
      return next;
    });
  }

  return (
    <section className="mb-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-stone-100">
      <div className="mb-2 flex items-center justify-between border-b border-stone-100 pb-1.5">
        <h2 className="text-sm font-bold text-stone-700">🧪 実機テストチェックリスト</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
          doneCount === ITEMS.length ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-500"
        }`}>
          {doneCount} / {ITEMS.length}
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5">
        {ITEMS.map((item) => (
          <li key={item}>
            <label className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg px-1.5 active:bg-stone-50">
              <input
                type="checkbox"
                checked={!!checked[item]}
                onChange={() => toggle(item)}
                className="h-4 w-4 shrink-0 rounded border-stone-300 accent-[#8B4A3C]"
              />
              <span className={`text-xs ${checked[item] ? "text-stone-400 line-through" : "text-stone-700"}`}>
                {item}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
