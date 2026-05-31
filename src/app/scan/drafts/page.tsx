"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { getScanDraftsByType, deleteScanDraft, type ScanDraft } from "@/app/utils/scanDrafts";
import { getExpenseDrafts, deleteExpenseDraft, type ExpenseDraft } from "@/app/utils/expenses";
import { getOrderDrafts, deleteOrderDraft, type OrderDraft } from "@/app/utils/orderDrafts";
import { getStoredDocuments, deleteStoredDocument, type StoredDocument } from "@/app/utils/documentStorage";

type TabId = "agency" | "receipt" | "order" | "other";

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ja-JP");
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: string }) {
  const style =
    status === "confirmed"
      ? "bg-green-100 text-green-700"
      : status === "registered"
      ? "bg-blue-100 text-blue-700"
      : "bg-amber-100 text-amber-700";
  const label =
    status === "confirmed" ? "確認済み" : status === "registered" ? "登録済み" : "下書き";
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${style}`}>
      {label}
    </span>
  );
}

export default function ScanDraftsPage() {
  const [activeTab,     setActiveTab]     = useState<TabId>("agency");
  const [agencyDrafts,  setAgencyDrafts]  = useState<ScanDraft[]>([]);
  const [expenseDrafts, setExpenseDrafts] = useState<ExpenseDraft[]>([]);
  const [orderDrafts,   setOrderDrafts]   = useState<OrderDraft[]>([]);
  const [documents,     setDocuments]     = useState<StoredDocument[]>([]);

  function loadAll() {
    setAgencyDrafts(getScanDraftsByType("client_document"));
    setExpenseDrafts(getExpenseDrafts());
    setOrderDrafts(getOrderDrafts());
    setDocuments(getStoredDocuments());
  }

  useEffect(() => {
    loadAll();
  }, []);

  function handleDeleteAgency(id: string) {
    if (!confirm("この案件下書きを削除しますか？")) return;
    deleteScanDraft(id);
    setAgencyDrafts((prev) => prev.filter((d) => d.id !== id));
  }

  function handleDeleteExpense(id: string) {
    if (!confirm("この支出下書きを削除しますか？")) return;
    deleteExpenseDraft(id);
    setExpenseDrafts((prev) => prev.filter((d) => d.id !== id));
  }

  function handleDeleteOrder(id: string) {
    if (!confirm("この発注確認下書きを削除しますか？")) return;
    deleteOrderDraft(id);
    setOrderDrafts((prev) => prev.filter((d) => d.id !== id));
  }

  function handleDeleteDocument(id: string) {
    if (!confirm("この書類を削除しますか？")) return;
    deleteStoredDocument(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: "agency",  label: "案件下書き",   count: agencyDrafts.length },
    { id: "receipt", label: "支出下書き",   count: expenseDrafts.length },
    { id: "order",   label: "発注確認",     count: orderDrafts.length },
    { id: "other",   label: "その他書類",   count: documents.length },
  ];

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        <header className="mb-4">
          <Link href="/scan" className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← スキャン登録へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">スキャン下書き一覧</h1>
          <p className="mt-1 text-sm text-stone-500">スキャンした書類の下書きを確認できます。</p>
        </header>

        {/* タブ */}
        <div className="mb-4 flex gap-1 overflow-x-auto rounded-2xl bg-stone-100 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                activeTab === tab.id
                  ? "bg-white text-[#8B4A3C] shadow-sm"
                  : "text-stone-500"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    activeTab === tab.id
                      ? "bg-[#8B4A3C] text-white"
                      : "bg-stone-300 text-stone-600"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="space-y-3">

          {/* ── 案件下書き ── */}
          {activeTab === "agency" && (
            <>
              {agencyDrafts.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-stone-200 px-4 py-10 text-center">
                  <p className="text-sm text-stone-500">案件下書きはありません。</p>
                  <p className="mt-1 text-xs text-stone-400">スキャン登録から元請書類を読み取ってください。</p>
                  <Link href="/scan" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[#8B4A3C]">
                    スキャン登録へ →
                  </Link>
                </div>
              ) : (
                agencyDrafts.map((d) => (
                  <div key={d.id} className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-stone-800 leading-tight">
                          {d.extractedData.projectName || "（案件名未入力）"}
                        </p>
                        <p className="mt-0.5 text-xs text-stone-500">{d.extractedData.clientName}</p>
                      </div>
                      <StatusBadge status={d.status} />
                    </div>
                    <ul className="space-y-1 text-xs text-stone-500">
                      {d.extractedData.address && (
                        <li>📍 {d.extractedData.address}</li>
                      )}
                      {d.extractedData.workContent && (
                        <li>🔨 {d.extractedData.workContent}</li>
                      )}
                      {d.extractedData.contractAmount && (
                        <li>
                          💴 ¥{Number(d.extractedData.contractAmount).toLocaleString("ja-JP")}
                        </li>
                      )}
                      <li>📁 {d.fileName || "（ファイルなし）"}</li>
                      <li>🗓 作成日：{fmtDate(d.createdAt)}</li>
                    </ul>
                    <div className="flex gap-2">
                      <Link
                        href="/projects/import"
                        className="flex-1 rounded-xl bg-[#8B4A3C] py-2.5 text-center text-sm font-bold text-white active:opacity-80"
                      >
                        案件登録へ進む
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteAgency(d.id)}
                        className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-bold text-stone-400 active:opacity-70"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {/* ── 支出下書き ── */}
          {activeTab === "receipt" && (
            <>
              {expenseDrafts.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-stone-200 px-4 py-10 text-center">
                  <p className="text-sm text-stone-500">支出下書きはありません。</p>
                  <p className="mt-1 text-xs text-stone-400">スキャン登録からレシートを読み取ってください。</p>
                  <Link href="/scan" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[#8B4A3C]">
                    スキャン登録へ →
                  </Link>
                </div>
              ) : (
                expenseDrafts.map((d) => (
                  <div key={d.id} className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-stone-800">{d.vendor || "（支払先未入力）"}</p>
                        <p className="mt-0.5 text-xs text-stone-500">{d.date}</p>
                      </div>
                      <StatusBadge status={d.status} />
                    </div>
                    <ul className="space-y-1 text-xs text-stone-500">
                      {d.amount && (
                        <li>💴 ¥{Number(d.amount).toLocaleString("ja-JP")}</li>
                      )}
                      {d.category && <li>🏷 {d.category}</li>}
                      {d.taxType && <li>税区分：{d.taxType}</li>}
                      {d.linkedProject && <li>案件：{d.linkedProject}</li>}
                      {d.memo && <li>メモ：{d.memo}</li>}
                      <li>📁 {d.fileName || "（ファイルなし）"}</li>
                      <li>🗓 作成日：{fmtDate(d.createdAt)}</li>
                    </ul>
                    <div className="flex gap-2">
                      <Link
                        href="/reports/monthly"
                        className="flex-1 rounded-xl bg-[#8B4A3C] py-2.5 text-center text-sm font-bold text-white active:opacity-80"
                      >
                        月次収支へ進む
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteExpense(d.id)}
                        className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-bold text-stone-400 active:opacity-70"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {/* ── 発注確認下書き ── */}
          {activeTab === "order" && (
            <>
              {orderDrafts.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-stone-200 px-4 py-10 text-center">
                  <p className="text-sm text-stone-500">発注確認下書きはありません。</p>
                  <p className="mt-1 text-xs text-stone-400">スキャン登録から発注書を読み取ってください。</p>
                  <Link href="/scan" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[#8B4A3C]">
                    スキャン登録へ →
                  </Link>
                </div>
              ) : (
                orderDrafts.map((d) => (
                  <div key={d.id} className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-stone-800">{d.projectName || "（案件名未入力）"}</p>
                        <p className="mt-0.5 text-xs text-stone-500">{d.clientName}</p>
                      </div>
                      <StatusBadge status={d.status} />
                    </div>
                    <ul className="space-y-1 text-xs text-stone-500">
                      {d.orderDate && <li>発注日：{d.orderDate}</li>}
                      {d.workDescription && <li>🔨 {d.workDescription}</li>}
                      {d.orderAmount && (
                        <li>💴 ¥{Number(d.orderAmount).toLocaleString("ja-JP")}</li>
                      )}
                      {d.paymentTerm && <li>支払：{d.paymentTerm}</li>}
                      <li>📁 {d.fileName || "（ファイルなし）"}</li>
                      <li>🗓 作成日：{fmtDate(d.createdAt)}</li>
                    </ul>
                    <div className="flex gap-2">
                      <Link
                        href="/projects/sample/materials"
                        className="flex-1 rounded-xl bg-[#8B4A3C] py-2.5 text-center text-sm font-bold text-white active:opacity-80"
                      >
                        材料・発注管理へ
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteOrder(d.id)}
                        className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-bold text-stone-400 active:opacity-70"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {/* ── その他書類 ── */}
          {activeTab === "other" && (
            <>
              {documents.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-stone-200 px-4 py-10 text-center">
                  <p className="text-sm text-stone-500">保存済みの書類はありません。</p>
                  <p className="mt-1 text-xs text-stone-400">スキャン登録からその他書類を保存してください。</p>
                  <Link href="/scan" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[#8B4A3C]">
                    スキャン登録へ →
                  </Link>
                </div>
              ) : (
                documents.map((d) => (
                  <div key={d.id} className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-stone-800">{d.documentName || "（書類名未入力）"}</p>
                        <p className="mt-0.5 text-xs text-stone-500">{d.category}</p>
                      </div>
                    </div>
                    <ul className="space-y-1 text-xs text-stone-500">
                      {d.relatedProject && <li>案件：{d.relatedProject}</li>}
                      {d.memo && <li>メモ：{d.memo}</li>}
                      <li>📁 {d.fileName || "（ファイルなし）"}</li>
                      <li>🗓 作成日：{fmtDate(d.createdAt)}</li>
                    </ul>
                    <button
                      type="button"
                      onClick={() => handleDeleteDocument(d.id)}
                      className="w-full rounded-xl border border-stone-200 py-2.5 text-sm font-bold text-stone-400 active:opacity-70"
                    >
                      削除
                    </button>
                  </div>
                ))
              )}
            </>
          )}

        </div>

        <div className="mt-6 space-y-3 pb-8">
          <Link
            href="/scan"
            className="flex w-full items-center justify-center rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80"
          >
            スキャン登録へ戻る
          </Link>
          <Link
            href="/"
            className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-3 text-sm font-bold text-stone-500 active:opacity-80"
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
  );
}
