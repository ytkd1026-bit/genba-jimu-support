"use client";

import Link from "next/link";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getTestMode } from "@/app/utils/testMode";
import { matchesKeyword } from "@/app/utils/search";
import {
  getSavedEstimates,
  setSelectedEstimateId,
  deleteEstimate,
  duplicateEstimate,
  type SavedEstimate,
} from "@/app/utils/savedEstimates";
import SavedEstimateCard from "@/app/components/SavedEstimateCard";

// ─── デモ用案件データ ──────────────────────────────────────────
const DEMO_PROJECTS_DATA = [
  {
    id: "p1",
    date: "2026/06/03",
    projectName: "〇〇マンション クロス貼替",
    clientName:  "△△工務店",
    siteAddress: "大阪府堺市〇〇区",
    workContent: "洋室クロス貼替・洗面所CF貼替",
    status:      "見積中",
  },
  {
    id: "p2",
    date: "2026/06/05",
    projectName: "□□店舗 床補修",
    clientName:  "□□リフォーム",
    siteAddress: "大阪府大阪市□□区",
    workContent: "店舗床補修",
    status:      "未請求",
  },
];

// ─── ステータスバッジ色 ───────────────────────────────────────
const STATUS_STYLE: Record<string, string> = {
  見積中:   "bg-amber-100 text-amber-800",
  未請求:   "bg-red-100 text-red-700",
  請求待ち: "bg-purple-100 text-purple-800",
  完了:     "bg-green-100 text-green-700",
};

type ProjectData = typeof DEMO_PROJECTS_DATA[0];

// ─── 案件カード（デモ用） ────────────────────────────────────
function ProjectCard({ p }: { p: ProjectData }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-100">
      <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-4 py-2.5">
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[p.status] ?? "bg-stone-100 text-stone-600"}`}>
          {p.status}
        </span>
        <span className="text-xs text-stone-400">{p.clientName}</span>
      </div>
      <div className="px-4 py-3 space-y-0.5">
        <p className="text-sm font-bold text-stone-800 leading-tight">{p.projectName}</p>
        <p className="text-xs text-stone-400">{p.siteAddress}</p>
        <p className="text-xs text-stone-500">{p.workContent}</p>
      </div>
      <div className="grid grid-cols-3 gap-1.5 border-t border-stone-100 px-4 py-3">
        <Link href="/projects/sample"
          className="flex min-h-[44px] items-center justify-center rounded-xl border border-stone-200 bg-white px-2 py-2 text-center text-xs font-bold text-stone-600 active:opacity-80">
          案件詳細<br />を見る
        </Link>
        <Link href="/projects/sample/estimate"
          className="flex min-h-[44px] items-center justify-center rounded-xl bg-[#8B4A3C] px-2 py-2 text-center text-xs font-bold text-white active:opacity-80">
          見積作成<br />を開始
        </Link>
        <Link href="/projects/sample/single-invoice"
          className="flex min-h-[44px] items-center justify-center rounded-xl border border-[#8B4A3C] bg-white px-2 py-2 text-center text-xs font-bold text-[#8B4A3C] active:opacity-80">
          請求書<br />作成へ
        </Link>
      </div>
    </div>
  );
}

// ─── ページ ───────────────────────────────────────────────────
export default function ProjectRegisterPage() {
  const router = useRouter();

  const [isDemo,         setIsDemo]         = useState(false);
  const [savedEstimates, setSavedEstimates]  = useState<SavedEstimate[]>([]);
  const [searchDate,     setSearchDate]     = useState("");
  const [searchProject,  setSearchProject]  = useState("");
  const [searchClient,   setSearchClient]   = useState("");
  const [hasSearched,    setHasSearched]    = useState(false);

  useEffect(() => {
    setIsDemo(getTestMode() === "demo");
    setSavedEstimates(getSavedEstimates());
  }, []);

  // ─── 保存済み見積ハンドラ ────────────────────────────────────
  function handleEstimateOpen(id: string) {
    setSelectedEstimateId(id);
    router.push("/projects/sample/estimate");
  }

  function handleEstimateDelete(id: string) {
    deleteEstimate(id);
    setSavedEstimates(getSavedEstimates());
  }

  function handleEstimateDuplicate(id: string) {
    duplicateEstimate(id);
    setSavedEstimates(getSavedEstimates());
  }

  // ─── 検索 ───────────────────────────────────────────────────
  const projectsData = isDemo ? DEMO_PROJECTS_DATA : [];

  const projectSearchResults = useMemo(() => {
    if (!hasSearched) return [];
    return projectsData.filter((p) => {
      const md = searchDate    === "" || p.date.includes(searchDate.replace(/-/g, "/"));
      const mp = searchProject === "" || matchesKeyword([p.projectName, p.siteAddress, p.workContent], searchProject);
      const mc = searchClient  === "" || matchesKeyword([p.clientName], searchClient);
      return md && mp && mc;
    });
  }, [hasSearched, searchDate, searchProject, searchClient, projectsData]);

  // 保存済み見積の検索（案件名・提出先・現場住所・工事内容で部分一致）
  const estimateSearchResults = useMemo(() => {
    if (!hasSearched) return [];
    if (searchDate === "" && searchProject === "" && searchClient === "") return [];
    return savedEstimates.filter((e) => {
      const q  = searchProject.toLowerCase();
      const qc = searchClient.toLowerCase();
      const matchesProject = q === "" ||
        e.projectName.toLowerCase().includes(q) ||
        e.siteAddress.toLowerCase().includes(q) ||
        e.workDescription.toLowerCase().includes(q);
      const matchesClient = qc === "" || e.clientName.toLowerCase().includes(qc);
      return matchesProject && matchesClient;
    });
  }, [hasSearched, searchDate, searchProject, searchClient, savedEstimates]);

  const inputCls = "w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-1 focus:ring-[#8B4A3C]/30";

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        <header className="mb-6">
          <Link href="/" className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← ホームへ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">案件検索・登録</h1>
          <p className="mt-1 text-sm text-stone-500">
            案件を探す、または新しく登録します。
          </p>
        </header>

        <div className="space-y-3">

          {/* メニューカード */}
          {[
            { icon: "🔍", title: "案件検索",               desc: "日付・案件名・元請名で探す",              href: "#project-search",      accent: false },
            { icon: "📝", title: "新規案件登録",            desc: "手入力で案件を作る",                      href: "/projects/new",         accent: false },
            { icon: "📄", title: "書類・データから案件登録", desc: "PDF・FAX・LINE画像から案件の下書きを作る", href: "/projects/import",      accent: true  },
            { icon: "📋", title: "登録案件一覧",            desc: "登録済みの案件から選んで作業を開始",      href: "#registered-projects", accent: false },
          ].map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className={`flex items-center gap-4 rounded-2xl p-5 shadow-sm active:opacity-75 ${
                card.accent ? "bg-[#8B4A3C] text-white" : "bg-white ring-1 ring-stone-100"
              }`}
            >
              <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-3xl ${
                card.accent ? "bg-white/10" : "bg-[#fdf0ec]"
              }`}>
                {card.icon}
              </span>
              <div className="flex flex-col gap-0.5">
                <span className={`text-base font-bold ${card.accent ? "text-white" : "text-stone-800"}`}>
                  {card.title}
                </span>
                <span className={`text-sm leading-snug ${card.accent ? "text-amber-100" : "text-stone-500"}`}>
                  {card.desc}
                </span>
              </div>
              <span className={`ml-auto shrink-0 text-xl ${card.accent ? "text-white/50" : "text-stone-300"}`}>
                ›
              </span>
            </Link>
          ))}

          {/* 書類AI読取注意カード */}
          <div className="rounded-2xl bg-yellow-50 p-4 ring-1 ring-yellow-200">
            <p className="text-xs leading-relaxed text-yellow-700">
              書類・データからの自動読取は今後順次対応予定です。
              現在は手入力での確認・修正が必要です。
            </p>
          </div>

          {/* ── 案件検索セクション ── */}
          <section id="project-search" className="scroll-mt-4 space-y-3 pt-2">
            <div className="border-b border-stone-200 pb-2">
              <h2 className="text-base font-bold text-stone-800">案件検索</h2>
              <p className="mt-0.5 text-xs text-stone-500">
                日付・案件名・元請名から登録案件と保存済み見積を検索します。
              </p>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm space-y-2.5">
              <input type="date" value={searchDate}
                onChange={(e) => setSearchDate(e.target.value)} className={inputCls} />
              <input type="text" placeholder="案件名で検索" value={searchProject}
                onChange={(e) => setSearchProject(e.target.value)} className={inputCls} />
              <input type="text" placeholder="元請名で検索" value={searchClient}
                onChange={(e) => setSearchClient(e.target.value)} className={inputCls} />
              <button
                type="button"
                onClick={() => setHasSearched(true)}
                className="w-full rounded-xl bg-[#8B4A3C] py-2.5 text-sm font-bold text-white active:opacity-80"
              >
                検索
              </button>

              {/* 検索結果 */}
              <div className="space-y-2">
                {!hasSearched ? (
                  <p className="py-3 text-center text-xs text-stone-400">
                    検索条件を入力して「検索」を押してください。
                  </p>
                ) : projectSearchResults.length === 0 && estimateSearchResults.length === 0 ? (
                  <p className="py-3 text-center text-xs text-stone-400">
                    該当する案件・見積はありません。
                  </p>
                ) : (
                  <div className="space-y-2">
                    {projectSearchResults.map((p) => (
                      <ProjectCard key={p.id} p={p} />
                    ))}
                    {estimateSearchResults.map((e) => (
                      <SavedEstimateCard
                        key={e.id}
                        est={e}
                        onOpen={handleEstimateOpen}
                        onDelete={handleEstimateDelete}
                        onDuplicate={handleEstimateDuplicate}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── 登録案件一覧 ── */}
          <section id="registered-projects" className="scroll-mt-4 space-y-3 pt-2">
            <div className="border-b border-stone-200 pb-2">
              <h2 className="text-base font-bold text-stone-800">登録案件一覧</h2>
              <p className="mt-0.5 text-xs text-stone-500">登録済みの案件から作業を開始できます。</p>
            </div>

            {isDemo ? (
              <div className="space-y-3">
                {projectsData.map((p) => (
                  <ProjectCard key={p.id} p={p} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-stone-200 py-8 text-center">
                <p className="text-sm text-stone-500">まだ登録された案件はありません。</p>
                <p className="mt-1.5 text-sm text-stone-500">
                  スキャン登録、または新規案件登録から始めてください。
                </p>
              </div>
            )}

            {/* ── 保存済み見積 ── */}
            <div className="space-y-3 pt-2">
              <div className="border-b border-stone-200 pb-2">
                <h3 className="text-sm font-bold text-stone-700">保存済み見積</h3>
                <p className="mt-0.5 text-xs text-stone-500">
                  下書き保存した見積から作業を再開できます。
                </p>
              </div>

              {savedEstimates.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-stone-200 py-8 text-center">
                  <p className="text-sm text-stone-500">保存済み見積はまだありません。</p>
                  <p className="mt-1.5 text-sm text-stone-500">
                    見積作成から下書き保存してください。
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {savedEstimates.map((e) => (
                    <SavedEstimateCard
                      key={e.id}
                      est={e}
                      onOpen={handleEstimateOpen}
                      onDelete={handleEstimateDelete}
                      onDuplicate={handleEstimateDuplicate}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* テスト感想リンク */}
          <div className="flex justify-end pb-8">
            <Link href="/test-feedback"
              className="text-xs text-stone-400 underline underline-offset-2 hover:text-[#8B4A3C]">
              この画面の感想を書く
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
