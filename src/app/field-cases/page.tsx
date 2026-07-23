"use client";

// 現場事例 一覧・検索（承認済みのみ表示）
// 承認前（draft/pending_approval/rejected）は検索APIの既定で除外される。

import Link from "next/link";
import { useEffect, useState } from "react";
import { fldInput } from "@/components/formStyles";

type Result = {
  id: string;
  caseNo: string | null;
  title: string | null;
  manufacturer: string | null;
  modelNumber: string | null;
  symptoms: string[];
  suspectedCause: string | null;
  confirmedCause: string | null;
  diagnosisStatus: string;
  tags: string[];
};

export default function FieldCasesPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);

  async function search(query: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/field-cases/search?q=${encodeURIComponent(query)}&limit=30`);
      const json = await res.json();
      setResults(json.ok ? json.results : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // 初回のみ承認済み一覧を取得する
    // eslint-disable-next-line react-hooks/set-state-in-effect
    search("");
  }, []);

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-stone-50 px-4 pb-24 pt-4">
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-stone-800">現場事例（承認済み）</h1>
        <Link href="/field-cases/new" className="rounded-lg bg-[#8B4A3C] px-3 py-1.5 text-sm font-bold text-white">＋新規</Link>
      </header>

      <form
        onSubmit={(e) => { e.preventDefault(); search(q); }}
        className="mb-4 flex gap-2"
      >
        <input className={fldInput} placeholder="型式・症状・エラー・タグで検索" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className="min-h-[44px] rounded-lg bg-stone-700 px-4 text-sm text-white">検索</button>
      </form>

      {loading && <p className="text-sm text-stone-400">検索中…</p>}
      {!loading && results.length === 0 && <p className="text-sm text-stone-400">承認済みの事例がありません。</p>}

      <ul className="space-y-2">
        {results.map((r) => (
          <li key={r.id}>
            <Link href={`/field-cases/${r.id}/review`} className="block rounded-lg border border-stone-200 bg-white p-3 active:bg-stone-50">
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-400">{r.caseNo ?? ""}</span>
                <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500">{r.diagnosisStatus}</span>
              </div>
              <div className="text-sm font-bold text-stone-800">
                {r.title || `${r.manufacturer ?? ""} ${r.modelNumber ?? ""}`.trim() || "（無題）"}
              </div>
              <div className="mt-0.5 text-xs text-stone-500">{r.symptoms.slice(0, 2).join(" / ")}</div>
              <div className="mt-1 text-xs text-stone-400">
                原因: {r.confirmedCause || r.suspectedCause || "（未設定）"}
              </div>
              {r.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {r.tags.slice(0, 5).map((t) => (
                    <span key={t} className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">#{t}</span>
                  ))}
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
