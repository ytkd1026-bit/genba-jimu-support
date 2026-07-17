"use client";

// TODO: Supabase連携後、進捗状態を projects.status または project_progress に保存する。
// TODO: 注文書返送済み、材料発注済み、請求済み、入金済みは月次収支と連動する。
// TODO: 一括請求対象フラグは invoice_items 作成時に利用する。

import Link from "next/link";
import { SampleDeprecationBanner } from "@/components/SampleDeprecationBanner";
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { getTestMode } from "@/app/utils/testMode";
import { matchesKeyword } from "@/app/utils/search";
import {
  getProjectHistories,
  addProjectHistory,
  CHANGE_TYPE_LABELS,
  type ProjectHistoryEntry,
  type ChangeType,
} from "@/app/utils/projectHistory";

// ---- 型 ----

type ProgressState = {
  見積作成済み: boolean;
  見積送付済み: boolean;
  注文書返送済み: boolean;
  材料発注済み: boolean;
  施工予定: boolean;
  施工完了: boolean;
  単体請求済み: boolean;
  一括請求対象: boolean;
  入金済み: boolean;
};

type ProgressKey = keyof ProgressState;

type DemoProject = {
  id: string;
  projectName: string;
  clientName: string;
  address: string;
  workContent: string;
  estimateStatus: string;
  invoiceStatus: string;
  sekouDate: string;
  koujiType: string;
};

type EditableData = {
  projectName: string;
  clientName: string;
  address: string;
  koujiType: string;
  workContent: string;
  sekouDate: string;
  scaleNote: string;
  parkingNote: string;
  memo: string;
};

// ---- デモ用サンプル案件 ----

const DEMO_PROJECTS: DemoProject[] = [
  {
    id: "demo-1",
    projectName:    "〇〇マンション クロス貼替",
    clientName:     "△△工務店",
    address:        "大阪府堺市〇〇区",
    workContent:    "洋室クロス貼替・洗面所CF貼替",
    estimateStatus: "作成中",
    invoiceStatus:  "未請求",
    sekouDate:      "2026/06/03",
    koujiType:      "クロス",
  },
];

const DEMO_INITIAL_PROGRESS: ProgressState = {
  見積作成済み: true,
  見積送付済み: true,
  注文書返送済み: false,
  材料発注済み: false,
  施工予定: true,
  施工完了: false,
  単体請求済み: false,
  一括請求対象: true,
  入金済み: false,
};

const EMPTY_PROGRESS: ProgressState = {
  見積作成済み: false,
  見積送付済み: false,
  注文書返送済み: false,
  材料発注済み: false,
  施工予定: false,
  施工完了: false,
  単体請求済み: false,
  一括請求対象: false,
  入金済み: false,
};

const KOUJI_TYPES = [
  "クロス", "クッションフロア", "フロアタイル", "長尺シート",
  "タイルカーペット", "ダイノック・化粧シート", "ガラスフィルム", "雑工事", "その他",
];

const WORK_BUTTONS = [
  { label: "見積書を作る",       desc: "単価・数量・利益を入力",       icon: "📝", href: "/projects/sample/estimate" },
  { label: "材料計算",           desc: "m数・㎡数から必要材料を確認",  icon: "📐", href: "/projects/sample/materials" },
  { label: "原価・利益計算",     desc: "人工・材料・経費・粗利を確認", icon: "💰", href: null },
  { label: "稟議書を作る",       desc: "元請け提出用の説明資料",       icon: "📋", href: null },
  { label: "請求書を作る",       desc: "見積内容から請求書へ",         icon: "🧾", href: "/projects/sample/invoice" },
  { label: "スケジュールを見る", desc: "現調・施工・請求予定を確認",   icon: "📅", href: "/schedule" },
];

// ---- ユーティリティ ----

function getNextAction(p: ProgressState): string {
  if (!p.見積作成済み)  return "見積書を作成してください。";
  if (!p.見積送付済み)  return "見積書を元請・施主へ送付してください。";
  if (!p.注文書返送済み) return "注文書または発注確認の返送待ちです。";
  if (!p.材料発注済み)  return "材料発注を確認してください。";
  if (!p.施工完了)      return "施工予定と材料搬入日を確認してください。";
  if (!p.単体請求済み && p.施工完了) return "この案件の請求処理を確認してください。";
  if (!p.入金済み && p.単体請求済み) return "入金確認を行ってください。";
  return "この案件は完了しています。";
}

function getStatusLabel(rate: number): string {
  if (rate === 100) return "完了";
  if (rate >= 71)   return "完了間近";
  if (rate >= 31)   return "進行中";
  return "準備中";
}

function getStatusColors(rate: number): string {
  if (rate === 100) return "bg-green-100 text-green-800";
  if (rate >= 71)   return "bg-blue-100 text-blue-800";
  if (rate >= 31)   return "bg-amber-100 text-amber-800";
  return "bg-stone-100 text-stone-600";
}

function getBarColor(rate: number): string {
  if (rate === 100) return "bg-green-500";
  if (rate >= 71)   return "bg-blue-400";
  if (rate >= 31)   return "bg-amber-400";
  return "bg-stone-400";
}

const STATUS_BADGE: Record<string, string> = {
  作成中:   "bg-amber-100 text-amber-800",
  見積中:   "bg-amber-100 text-amber-800",
  提出済み: "bg-blue-100 text-blue-700",
  受注:     "bg-green-100 text-green-700",
  未請求:   "bg-red-100 text-red-700",
  請求済み: "bg-blue-100 text-blue-700",
  入金済み: "bg-green-100 text-green-700",
};

const inputCls = "w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-2 focus:ring-[#8B4A3C]/20";
const labelCls = "mb-1 block text-xs font-bold text-stone-600";

// ---- メインコンポーネント ----

export default function SampleProjectPage() {
  const router = useRouter();
  const progressRef = useRef<HTMLElement>(null);

  // モード
  const [isDemo, setIsDemo] = useState(false);

  // 検索
  const [searchDate,    setSearchDate]    = useState("");
  const [searchProject, setSearchProject] = useState("");
  const [searchClient,  setSearchClient]  = useState("");
  const [hasSearched,   setHasSearched]   = useState(false);

  // 選択中案件
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // 進捗
  const [progress, setProgress] = useState<ProgressState>(EMPTY_PROGRESS);

  // 案件情報（編集可能コピー）
  const [editableData, setEditableData] = useState<EditableData | null>(null);

  // 編集フォーム
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<EditableData | null>(null);
  const [saveMode, setSaveMode] = useState<ChangeType | null>(null);
  const [editMemo, setEditMemo] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  // 修正履歴
  const [histories,   setHistories]   = useState<ProjectHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // 未実装メッセージ
  const [infoMsg, setInfoMsg] = useState("");

  useEffect(() => {
    setIsDemo(getTestMode() === "demo");
  }, []);

  // ---- 計算 ----

  const displayProjects = useMemo(() => {
    const projects = isDemo ? DEMO_PROJECTS : [];
    if (!hasSearched) return projects;
    return projects.filter((p) => {
      const md = searchDate    === "" || p.sekouDate.includes(searchDate.replace(/-/g, "/"));
      const mp = searchProject === "" || matchesKeyword([p.projectName, p.address, p.workContent], searchProject);
      const mc = searchClient  === "" || matchesKeyword([p.clientName], searchClient);
      return md && mp && mc;
    });
  }, [hasSearched, searchDate, searchProject, searchClient, isDemo]);

  const selectedProject = useMemo(
    () => (isDemo ? DEMO_PROJECTS : []).find((p) => p.id === selectedProjectId) ?? null,
    [selectedProjectId, isDemo]
  );

  const progressKeys = Object.keys(progress) as ProgressKey[];
  const trueCount = progressKeys.filter((k) => progress[k]).length;
  const rate = Math.round((trueCount / progressKeys.length) * 100);
  const nextAction = getNextAction(progress);

  // ---- ハンドラ ----

  function handleSelectProgress(project: DemoProject) {
    // 同じ案件を再度クリックでトグル
    if (selectedProjectId === project.id) {
      setSelectedProjectId(null);
      return;
    }
    setSelectedProjectId(project.id);
    setProgress(project.id === "demo-1" && isDemo ? DEMO_INITIAL_PROGRESS : EMPTY_PROGRESS);
    setEditableData({
      projectName: project.projectName,
      clientName:  project.clientName,
      address:     project.address,
      koujiType:   project.koujiType,
      workContent: project.workContent,
      sekouDate:   project.sekouDate,
      scaleNote:   "",
      parkingNote: "",
      memo:        "",
    });
    setEditMode(false);
    setSavedMsg("");
    setHistories(getProjectHistories(project.id));
    setHistoryOpen(false);
    setTimeout(() => progressRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }

  function toggleProgress(key: ProgressKey) {
    setProgress((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleWorkButton(href: string | null, label: string) {
    if (href) {
      router.push(href);
    } else {
      setInfoMsg(`「${label}」は次工程で実装します。`);
      setTimeout(() => setInfoMsg(""), 4000);
    }
  }

  function handleEditStart() {
    if (!editableData) return;
    setEditForm({ ...editableData });
    setSaveMode(null);
    setEditMemo("");
    setEditMode(true);
  }

  function handleEditCancel() {
    setEditMode(false);
    setSaveMode(null);
  }

  function handleEditSave() {
    if (!saveMode || !editForm || !editableData || !selectedProjectId) return;
    const now = new Date().toLocaleString("ja-JP");
    const entry: ProjectHistoryEntry = {
      historyId:  `hist-${Date.now()}`,
      projectId:  selectedProjectId,
      version:    histories.length + 1,
      createdAt:  now,
      changeType: saveMode,
      before:     editableData as unknown as Record<string, string>,
      after:      editForm     as unknown as Record<string, string>,
      memo:       editMemo,
    };
    addProjectHistory(entry);
    setEditableData({ ...editForm });
    setHistories((prev) => [entry, ...prev]);
    setEditMode(false);
    setSaveMode(null);
    setSavedMsg("案件内容を保存しました。");
    setTimeout(() => setSavedMsg(""), 4000);
  }

  function handleEditChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    setEditForm((prev) => (prev ? { ...prev, [e.target.name]: e.target.value } : prev));
  }

  function handleSearchClear() {
    setHasSearched(false);
    setSearchDate("");
    setSearchProject("");
    setSearchClient("");
  }

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        {/* ヘッダー */}
        <header className="mb-4">
          <Link href="/projects/register"
            className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← 案件検索・登録へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">案件検索</h1>
          <p className="mt-1 text-sm text-stone-500">
            案件を検索して、見積修正・請求書作成・進捗確認を行います。
          </p>
        </header>

        <SampleDeprecationBanner />

        <div className="space-y-3">

          {/* ── 検索フォーム ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm space-y-2.5">
            <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">案件検索</h2>
            <input
              type="date"
              value={searchDate}
              onChange={(e) => setSearchDate(e.target.value)}
              className={inputCls}
            />
            <input
              type="text"
              placeholder="案件名で検索"
              value={searchProject}
              onChange={(e) => setSearchProject(e.target.value)}
              className={inputCls}
            />
            <input
              type="text"
              placeholder="元請名で検索"
              value={searchClient}
              onChange={(e) => setSearchClient(e.target.value)}
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => setHasSearched(true)}
              className="w-full rounded-xl bg-[#8B4A3C] py-2.5 text-sm font-bold text-white active:opacity-80"
            >
              検索
            </button>
            {!hasSearched && (
              <p className="py-1 text-center text-xs text-stone-400">
                案件名・日付・元請名を入力して検索してください。
              </p>
            )}
          </div>

          {/* ── 案件リスト ── */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-stone-700">案件リスト</h2>
              {hasSearched && (
                <button
                  type="button"
                  onClick={handleSearchClear}
                  className="text-xs text-stone-400 underline underline-offset-2 active:opacity-70"
                >
                  検索クリア
                </button>
              )}
            </div>

            {/* 空状態（normal / first_user、検索前） */}
            {!hasSearched && displayProjects.length === 0 && (
              <div className="rounded-2xl border-2 border-dashed border-stone-200 px-4 py-8 text-center space-y-3">
                <p className="text-sm text-stone-500">登録案件はまだありません。</p>
                <p className="text-sm text-stone-500">スキャン登録、または新規案件登録から始めてください。</p>
                <div className="flex flex-col gap-2 pt-2">
                  <Link href="/scan"
                    className="flex w-full items-center justify-center rounded-xl bg-[#8B4A3C] py-3 text-sm font-bold text-white active:opacity-80">
                    スキャン登録へ進む
                  </Link>
                  <Link href="/projects/new"
                    className="flex w-full items-center justify-center rounded-xl border border-[#8B4A3C] bg-white py-3 text-sm font-bold text-[#8B4A3C] active:opacity-80">
                    新規案件登録へ進む
                  </Link>
                </div>
              </div>
            )}

            {/* 検索結果なし */}
            {hasSearched && displayProjects.length === 0 && (
              <div className="rounded-2xl border-2 border-dashed border-stone-200 py-8 text-center">
                <p className="text-sm text-stone-400">該当する案件はありません。</p>
              </div>
            )}

            {/* 案件カード一覧 */}
            {displayProjects.length > 0 && (
              <div className="space-y-3">
                {displayProjects.map((project) => {
                  const isSelected = selectedProjectId === project.id;
                  return (
                    <div
                      key={project.id}
                      className={`overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ${
                        isSelected ? "ring-[#8B4A3C]" : "ring-stone-100"
                      }`}
                    >
                      {/* カードヘッダー */}
                      <div className={`flex items-center justify-between border-b border-stone-100 px-4 py-2.5 ${
                        isSelected ? "bg-[#fff8f5]" : "bg-stone-50"
                      }`}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_BADGE[project.estimateStatus] ?? "bg-stone-100 text-stone-600"}`}>
                            {project.estimateStatus}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_BADGE[project.invoiceStatus] ?? "bg-stone-100 text-stone-600"}`}>
                            {project.invoiceStatus}
                          </span>
                        </div>
                        <span className="text-xs text-stone-400">{project.clientName}</span>
                      </div>

                      {/* カード本文 */}
                      <div className="px-4 py-3 space-y-0.5">
                        <p className="text-sm font-bold text-stone-800 leading-tight">{project.projectName}</p>
                        <p className="text-xs text-stone-400">{project.address}</p>
                        <p className="text-xs text-stone-500">{project.workContent}</p>
                        <p className="text-xs text-stone-400">施工予定日：{project.sekouDate}</p>
                      </div>

                      {/* カード内ボタン */}
                      <div className="grid grid-cols-3 gap-1.5 border-t border-stone-100 px-4 py-3">
                        <Link
                          href="/projects/sample/estimate"
                          className="flex min-h-[44px] items-center justify-center rounded-xl bg-[#8B4A3C] px-2 py-2 text-center text-xs font-bold text-white active:opacity-80"
                        >
                          見積修正
                        </Link>
                        <Link
                          href="/projects/sample/single-invoice"
                          className="flex min-h-[44px] items-center justify-center rounded-xl border border-[#8B4A3C] bg-white px-2 py-2 text-center text-xs font-bold text-[#8B4A3C] active:opacity-80"
                        >
                          請求書作成
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleSelectProgress(project)}
                          className={`flex min-h-[44px] items-center justify-center rounded-xl border px-2 py-2 text-center text-xs font-bold active:opacity-80 ${
                            isSelected
                              ? "border-[#8B4A3C] bg-[#8B4A3C] text-white"
                              : "border-stone-200 bg-white text-stone-600"
                          }`}
                        >
                          {isSelected ? "確認中" : "進捗確認"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── 進捗確認セクション（案件選択後のみ） ── */}
          {selectedProject && (
            <section ref={progressRef} className="space-y-3 pt-1">

              <div className="rounded-2xl border border-[#8B4A3C]/20 bg-[#fff8f5] px-4 py-3">
                <p className="text-xs text-stone-500">進捗確認</p>
                <p className="mt-0.5 text-base font-bold text-[#8B4A3C]">
                  選択中の案件：{editableData?.projectName ?? selectedProject.projectName}
                </p>
              </div>

              {/* 保存後メッセージ */}
              {savedMsg && (
                <div className="rounded-xl bg-green-50 px-4 py-3 ring-1 ring-green-200">
                  <p className="text-sm font-bold text-green-700">{savedMsg}</p>
                </div>
              )}

              {/* 未実装メッセージ */}
              {infoMsg && (
                <div className="rounded-xl bg-stone-50 px-4 py-3 ring-1 ring-stone-200">
                  <p className="text-sm text-stone-600">{infoMsg}</p>
                </div>
              )}

              {/* 案件概要カード */}
              {editableData && (
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between border-b border-stone-100 pb-2">
                    <h3 className="text-sm font-bold text-stone-700">案件概要</h3>
                    <button
                      type="button"
                      onClick={handleEditStart}
                      className="rounded-xl border border-[#8B4A3C] px-3 py-1.5 text-xs font-bold text-[#8B4A3C] active:opacity-75"
                    >
                      案件内容を修正
                    </button>
                  </div>
                  <ul className="space-y-2">
                    {[
                      { label: "元請け・顧客名", value: editableData.clientName },
                      { label: "現場住所",       value: editableData.address },
                      { label: "工事種別",       value: editableData.koujiType },
                      { label: "工事内容",       value: editableData.workContent },
                      { label: "見積状態",       value: selectedProject.estimateStatus },
                      { label: "請求状態",       value: selectedProject.invoiceStatus },
                      { label: "施工予定日",     value: editableData.sekouDate },
                    ].map((item) => (
                      <li key={item.label} className="flex items-start gap-2 text-sm">
                        <span className="w-28 shrink-0 text-stone-500">{item.label}</span>
                        <span className="font-medium text-stone-800">{item.value || "—"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 編集フォーム（インライン） */}
              {editMode && editForm && (
                <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-2 ring-[#8B4A3C]/30">
                  <div className="bg-[#8B4A3C] px-4 py-3">
                    <h3 className="text-sm font-bold text-white">案件内容を修正</h3>
                    <p className="mt-0.5 text-xs text-amber-100">修正後、保存方法を選んでください。</p>
                  </div>
                  <div className="space-y-4 p-4">
                    <div>
                      <label className={labelCls}>案件名</label>
                      <input name="projectName" value={editForm.projectName} onChange={handleEditChange}
                        placeholder="例：〇〇マンション クロス貼替" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>元請け・顧客名</label>
                      <input name="clientName" value={editForm.clientName} onChange={handleEditChange}
                        placeholder="例：△△工務店" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>現場住所</label>
                      <input name="address" value={editForm.address} onChange={handleEditChange}
                        placeholder="例：大阪府堺市〇〇区" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>工事種別</label>
                      <select name="koujiType" value={editForm.koujiType} onChange={handleEditChange} className={inputCls}>
                        {KOUJI_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>工事内容</label>
                      <textarea name="workContent" value={editForm.workContent} onChange={handleEditChange}
                        rows={2} placeholder="例：洋室クロス貼替、洗面所CF貼替"
                        className={inputCls + " resize-none"} />
                    </div>
                    <div>
                      <label className={labelCls}>工事規模メモ</label>
                      <textarea name="scaleNote" value={editForm.scaleNote} onChange={handleEditChange}
                        rows={2} placeholder="例：クロス約50m、CF約8㎡"
                        className={inputCls + " resize-none"} />
                    </div>
                    <div>
                      <label className={labelCls}>駐車場・搬入条件</label>
                      <textarea name="parkingNote" value={editForm.parkingNote} onChange={handleEditChange}
                        rows={2} placeholder="例：駐車場なし、EVあり"
                        className={inputCls + " resize-none"} />
                    </div>
                    <div>
                      <label className={labelCls}>施工予定日</label>
                      <input name="sekouDate" value={editForm.sekouDate} onChange={handleEditChange}
                        placeholder="例：2026/06/03" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>メモ</label>
                      <textarea name="memo" value={editForm.memo} onChange={handleEditChange}
                        rows={3} placeholder="元請けへの注意点など"
                        className={inputCls + " resize-none"} />
                    </div>

                    {/* 保存方法選択 */}
                    <div className="rounded-xl bg-stone-50 p-3 space-y-2">
                      <p className="text-xs font-bold text-stone-700">保存方法を選択</p>
                      {(["overwrite", "new_version"] as ChangeType[]).map((mode) => (
                        <label key={mode} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                          saveMode === mode ? "border-[#8B4A3C] bg-[#fff8f5]" : "border-stone-200 bg-white"
                        }`}>
                          <input type="radio" name="saveMode" value={mode}
                            checked={saveMode === mode}
                            onChange={() => setSaveMode(mode)}
                            className="mt-0.5 accent-[#8B4A3C]" />
                          <div>
                            <p className="text-sm font-bold text-stone-800">
                              {mode === "overwrite" ? "上書き保存" : "修正前を残して別版として保存"}
                            </p>
                            <p className="text-xs text-stone-500">
                              {mode === "overwrite"
                                ? "現在の案件情報を置き換えます。"
                                : "修正前の内容を履歴として残し、新しい版として保存します。"}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>

                    <div>
                      <label className={labelCls}>修正メモ（任意）</label>
                      <input value={editMemo} onChange={(e) => setEditMemo(e.target.value)}
                        placeholder="例：元請担当者変更のため修正" className={inputCls} />
                    </div>

                    <div className="flex gap-2.5">
                      <button type="button" onClick={handleEditCancel}
                        className="flex-1 rounded-xl border border-stone-200 bg-white py-3 text-sm font-bold text-stone-500 active:opacity-80">
                        キャンセル
                      </button>
                      <button type="button" onClick={handleEditSave}
                        disabled={!saveMode}
                        className={`flex-1 rounded-xl py-3 text-sm font-bold text-white transition-colors ${
                          saveMode ? "bg-[#8B4A3C] active:opacity-80" : "cursor-not-allowed bg-stone-300"
                        }`}>
                        保存する
                      </button>
                    </div>
                    {!saveMode && (
                      <p className="text-center text-xs text-stone-400">保存方法を選んでから保存してください</p>
                    )}
                  </div>
                </div>
              )}

              {/* 進捗管理カード */}
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-stone-700">進捗管理</h3>
                    <p className="mt-0.5 text-xs text-stone-400">
                      見積・材料・施工・請求・入金の状態を確認します。
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${getStatusColors(rate)}`}>
                    {getStatusLabel(rate)}
                  </span>
                </div>
                <div className="mb-1 h-2.5 w-full rounded-full bg-stone-100">
                  <div
                    className={`h-2.5 rounded-full transition-all ${getBarColor(rate)}`}
                    style={{ width: `${rate}%` }}
                  />
                </div>
                <p className="mb-4 text-right text-xs text-stone-400">進捗率：{rate}%</p>
                <ul className="space-y-1.5">
                  {progressKeys.map((key) => {
                    const done = progress[key];
                    return (
                      <li key={key}>
                        <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 active:bg-stone-50">
                          <input type="checkbox" checked={done} onChange={() => toggleProgress(key)}
                            className="h-5 w-5 shrink-0 cursor-pointer accent-[#8B4A3C]" />
                          <span className={`text-sm font-medium ${done ? "text-green-700 line-through" : "text-amber-700"}`}>
                            {key}
                          </span>
                          {done
                            ? <span className="ml-auto text-xs text-green-500">✓</span>
                            : <span className="ml-auto text-xs text-amber-400">未</span>
                          }
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* 次にやる作業カード */}
              <div className="rounded-2xl bg-[#8B4A3C] p-4 shadow-sm text-white">
                <p className="mb-1 text-xs font-bold text-amber-200">次にやる作業</p>
                <p className="text-base font-bold leading-snug">{nextAction}</p>
              </div>

              {/* 未処理チェック注意カード */}
              <div className="rounded-2xl bg-yellow-50 p-4 shadow-sm ring-1 ring-yellow-200">
                <h3 className="mb-1.5 text-sm font-bold text-yellow-800">⚠️ 未処理チェック</h3>
                <p className="text-sm leading-relaxed text-yellow-700">
                  注文書返送・材料発注・請求・入金は忘れやすい項目です。
                  現場完了後に必ず確認してください。
                </p>
              </div>

              {/* 請求・収支ボタン */}
              <div className="space-y-2.5">
                <Link href="/projects/sample/single-invoice"
                  className="flex w-full items-center justify-center rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80">
                  この案件だけ請求書を作る
                </Link>
                <Link href="/projects/sample/invoice"
                  className="flex w-full items-center justify-center rounded-2xl border border-[#8B4A3C] bg-white py-4 text-base font-bold text-[#8B4A3C] shadow-sm active:opacity-80">
                  一括請求に含める
                </Link>
                <Link href="/reports/monthly"
                  className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-4 text-base font-bold text-stone-600 shadow-sm active:opacity-80">
                  月次収支で確認
                </Link>
              </div>

              {/* 作業メニュー */}
              <div className="space-y-2.5">
                <h3 className="text-sm font-bold text-stone-700">作業メニュー</h3>
                {WORK_BUTTONS.map((btn) => (
                  <button
                    key={btn.label}
                    type="button"
                    onClick={() => handleWorkButton(btn.href, btn.label)}
                    className="flex w-full items-center gap-4 rounded-2xl bg-white px-4 py-4 text-left shadow-sm ring-1 ring-stone-100 active:opacity-75"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#fdf0ec] text-2xl">
                      {btn.icon}
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-base font-bold text-stone-800">{btn.label}</span>
                      <span className="text-xs text-stone-500">{btn.desc}</span>
                    </span>
                    <span className="ml-auto shrink-0 text-stone-300">›</span>
                  </button>
                ))}
              </div>

              {/* 案件修正履歴 */}
              <div>
                <button
                  type="button"
                  onClick={() => setHistoryOpen((v) => !v)}
                  className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3.5 shadow-sm ring-1 ring-stone-100 active:opacity-80"
                >
                  <div className="text-left">
                    <p className="text-sm font-bold text-stone-800">案件修正履歴</p>
                    <p className="mt-0.5 text-xs text-stone-400">
                      {histories.length > 0
                        ? `${histories.length}件の修正履歴があります`
                        : "修正履歴はまだありません"}
                    </p>
                  </div>
                  <span className={`ml-4 shrink-0 text-sm font-bold transition-transform ${
                    historyOpen ? "rotate-90 text-[#8B4A3C]" : "text-stone-300"
                  }`}>
                    ›
                  </span>
                </button>

                {historyOpen && (
                  <div className="mt-2 space-y-2.5">
                    {histories.length === 0 ? (
                      <div className="rounded-2xl border-2 border-dashed border-stone-200 py-8 text-center">
                        <p className="text-sm text-stone-400">修正履歴はまだありません。</p>
                      </div>
                    ) : (
                      histories.map((h) => (
                        <div key={h.historyId} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-100">
                          <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-bold text-stone-600">
                                v{h.version}
                              </span>
                              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                h.changeType === "new_version"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}>
                                {CHANGE_TYPE_LABELS[h.changeType]}
                              </span>
                            </div>
                            <span className="text-xs text-stone-400">{h.createdAt}</span>
                          </div>
                          <div className="px-4 py-3 space-y-2">
                            {h.memo && (
                              <p className="text-xs text-stone-600">修正メモ：{h.memo}</p>
                            )}
                            <details className="text-xs">
                              <summary className="cursor-pointer py-1 text-stone-500 active:opacity-70">
                                修正前を見る
                              </summary>
                              <div className="mt-1.5 rounded-lg bg-stone-50 p-3 space-y-1">
                                {Object.entries(h.before).map(([k, v]) => (
                                  <div key={k} className="flex gap-2">
                                    <span className="w-20 shrink-0 text-stone-400">{k}</span>
                                    <span className="text-stone-700">{v || "—"}</span>
                                  </div>
                                ))}
                              </div>
                            </details>
                            <details className="text-xs">
                              <summary className="cursor-pointer py-1 text-stone-500 active:opacity-70">
                                修正後を見る
                              </summary>
                              <div className="mt-1.5 rounded-lg bg-[#fff8f5] p-3 space-y-1">
                                {Object.entries(h.after).map(([k, v]) => (
                                  <div key={k} className="flex gap-2">
                                    <span className="w-20 shrink-0 text-stone-400">{k}</span>
                                    <span className="text-stone-700">{v || "—"}</span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

            </section>
          )}

          {/* ── 下部ナビゲーション ── */}
          <div className="space-y-2.5 pb-8 pt-2">
            {!isDemo && (
              <>
                <Link href="/scan"
                  className="flex w-full items-center justify-center rounded-2xl bg-[#8B4A3C] py-3.5 text-sm font-bold text-white shadow-sm active:opacity-80">
                  スキャン登録へ進む
                </Link>
                <Link href="/projects/new"
                  className="flex w-full items-center justify-center rounded-2xl border border-[#8B4A3C] bg-white py-3.5 text-sm font-bold text-[#8B4A3C] shadow-sm active:opacity-80">
                  新規案件登録へ進む
                </Link>
              </>
            )}
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
