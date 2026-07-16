"use client";

// 01 案件詳細（一案件一元管理の親画面）
// 基本情報の入力と、保険案件の場合のみ表示される保険情報の入力を行う。
// 自動下書き保存（useAutoDraft）＋本保存（projectsStore / insuranceInfoStore）。

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  projectsStore,
  BUILDING_TYPE_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  projectDisplayId,
  type Project,
  type ProjectType,
  type BuildingType,
  type ProjectStatus,
} from "@/app/utils/projects";
import {
  insuranceInfoStore,
  createEmptyInsuranceInfo,
  ACCIDENT_TYPE_LABELS,
  APPROVAL_STATUS_LABELS,
  type InsuranceInfo,
  type AccidentType,
  type InsuranceApprovalStatus,
} from "@/app/utils/insuranceInfo";
import { draftKey } from "@/app/utils/draftStorage";
import { useAutoDraft } from "@/hooks/useAutoDraft";
import { SaveStatusBar } from "@/components/SaveStatusBar";
import { ProjectTabs, ProjectHeader } from "@/components/ProjectTabs";
import { StructuredTextInput } from "@/components/StructuredTextInput";
import { fldInput, fldSelect, readOnlyFld, lbl } from "@/components/formStyles";

type DetailDraftData = {
  project: Project;
  insurance: InsuranceInfo;
};

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(params.projectId);

  const [notFound, setNotFound] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [insurance, setInsurance] = useState<InsuranceInfo | null>(null);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);

  // 案件登録直後（?saved=1）の歓迎メッセージ
  const [showSavedWelcome, setShowSavedWelcome] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("saved") === "1") {
      setShowSavedWelcome(true);
      const t = setTimeout(() => setShowSavedWelcome(false), 6000);
      return () => clearTimeout(t);
    }
  }, []);

  // ── 読み込み ──────────────────────────────────────────────
  useEffect(() => {
    const p = projectsStore.getById(projectId);
    if (!p) {
      setNotFound(true);
      return;
    }
    setProject(p);
    setInsurance(insuranceInfoStore.getById(projectId) ?? createEmptyInsuranceInfo(projectId));
    setLoaded(true);
  }, [projectId]);

  // ── 自動下書き保存 ────────────────────────────────────────
  const DETAIL_DRAFT_KEY = draftKey("project-detail", projectId);
  const draftData = useMemo<DetailDraftData | null>(
    () => (project && insurance ? { project, insurance } : null),
    [project, insurance],
  );
  const { saveStatus, savedAt, clearDraft, restoredDraft } = useAutoDraft<DetailDraftData | null>(
    DETAIL_DRAFT_KEY, "project-detail", projectId, draftData,
    { enabled: loaded, debounceMs: 800 },
  );

  // 下書き復元バナー（前回、本保存せずに離脱した場合のみ下書きが残っている）
  useEffect(() => {
    if (restoredDraft?.data) setShowRestoreBanner(true);
  }, [restoredDraft]);

  // ブラウザ離脱時の未保存警告
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (saveStatus === "dirty") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveStatus]);

  function handleRestoreDraft() {
    if (!restoredDraft?.data) return;
    setProject(restoredDraft.data.project);
    setInsurance(restoredDraft.data.insurance);
    setShowRestoreBanner(false);
  }

  function handleDiscardDraft() {
    clearDraft();
    setShowRestoreBanner(false);
  }

  // ── 入力更新 ──────────────────────────────────────────────
  function updateProject<K extends keyof Project>(field: K, value: Project[K]) {
    setProject((prev) => (prev ? { ...prev, [field]: value } : prev));
  }
  function updateInsurance<K extends keyof InsuranceInfo>(field: K, value: InsuranceInfo[K]) {
    setInsurance((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  // ── 本保存 ────────────────────────────────────────────────
  function handleSave() {
    if (!project || !insurance) return;
    if (project.projectName.trim() === "") {
      setSaveMsg({ ok: false, text: "案件名を入力してください。" });
      return;
    }
    const now = new Date().toISOString();
    const okProject = projectsStore.upsert({ ...project, updatedAt: now });
    // 保険情報は保険案件の場合のみ保存する
    const okInsurance =
      project.projectType === "insurance" ? insuranceInfoStore.upsert(insurance) : true;
    if (okProject && okInsurance) {
      setProject((prev) => (prev ? { ...prev, updatedAt: now } : prev));
      clearDraft();
      setSaveMsg({ ok: true, text: "案件を保存しました。" });
    } else {
      setSaveMsg({
        ok: false,
        text: "保存に失敗しました。入力内容は下書きとして残っています。",
      });
    }
    setTimeout(() => setSaveMsg(null), 6000);
  }

  // ── 案件が見つからない場合 ────────────────────────────────
  if (notFound) {
    return (
      <div className="min-h-screen bg-[#fdf8f2]">
        <div className="mx-auto max-w-md px-4 py-10 text-center sm:max-w-lg">
          <p className="text-sm font-bold text-stone-700">案件が見つかりません。</p>
          <p className="mt-1 font-mono text-xs text-stone-400">{projectId}</p>
          <Link
            href="/projects/list"
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#8B4A3C] px-5 py-2.5 text-sm font-bold text-white active:opacity-80"
          >
            案件一覧へ戻る
          </Link>
        </div>
      </div>
    );
  }

  if (!project || !insurance) {
    return <div className="min-h-screen bg-[#fdf8f2]" />;
  }

  const isInsurance = project.projectType === "insurance";

  return (
    <div className="min-h-screen bg-[#fdf8f2] pb-24">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        <header className="mb-3">
          <Link href="/projects/list" className="mb-2 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← 案件一覧へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">案件詳細</h1>
        </header>

        <ProjectHeader project={project} />
        <ProjectTabs projectId={projectId} active="detail" />

        {/* 案件登録直後の歓迎メッセージ */}
        {showSavedWelcome && (
          <div className="mb-3 rounded-xl bg-green-50 p-3 ring-1 ring-green-200">
            <p className="text-sm font-bold text-green-700">案件を保存しました。</p>
            <p className="mt-0.5 text-xs text-green-600">
              続けて現地調査・写真・工事項目を登録できます。
            </p>
          </div>
        )}

        {/* 下書き復元バナー */}
        {showRestoreBanner && restoredDraft && (
          <div className="mb-3 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
            <p className="text-xs font-bold text-amber-800">保存されていない下書きがあります。</p>
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

        <SaveStatusBar status={saveStatus} savedAt={savedAt} />

        {/* ── 基本情報 ───────────────────────────────────── */}
        <section className="mb-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
          <h2 className="mb-3 border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">基本情報</h2>
          <div className="space-y-3">
            <div>
              <label className={lbl}>案件ID（自動発行）</label>
              <div className={readOnlyFld}>
                <span className="font-mono">{projectDisplayId(project)}</span>
              </div>
            </div>
            <div>
              <label className={lbl}>案件名 <span className="text-red-500">＊</span></label>
              <input type="text" value={project.projectName}
                onChange={(e) => updateProject("projectName", e.target.value)}
                placeholder="〇〇マンション 501号室 水漏れ復旧" className={fldInput} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={lbl}>物件名</label>
                <input type="text" value={project.propertyName}
                  onChange={(e) => updateProject("propertyName", e.target.value)}
                  placeholder="〇〇マンション" className={fldInput} />
              </div>
              <div>
                <label className={lbl}>部屋番号</label>
                <input type="text" value={project.roomNumber}
                  onChange={(e) => updateProject("roomNumber", e.target.value)}
                  placeholder="501" className={fldInput} />
              </div>
            </div>
            <div>
              <label className={lbl}>現場住所</label>
              <input type="text" value={project.siteAddress}
                onChange={(e) => updateProject("siteAddress", e.target.value)}
                placeholder="大阪府堺市〇〇区〇〇町1-2-3" className={fldInput} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={lbl}>顧客名（施主）</label>
                <input type="text" value={project.customerName}
                  onChange={(e) => updateProject("customerName", e.target.value)}
                  placeholder="山本 様" className={fldInput} />
              </div>
              <div>
                <label className={lbl}>元請名</label>
                <input type="text" value={project.clientName}
                  onChange={(e) => updateProject("clientName", e.target.value)}
                  placeholder="〇〇工務店" className={fldInput} />
              </div>
            </div>
            <div>
              <label className={lbl}>提出先（帳票の宛名）</label>
              <input type="text" value={project.submitTo}
                onChange={(e) => updateProject("submitTo", e.target.value)}
                placeholder="〇〇工務店 御中" className={fldInput} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={lbl}>建物種別</label>
                <select value={project.buildingType}
                  onChange={(e) => updateProject("buildingType", e.target.value as BuildingType)}
                  className={fldSelect}>
                  {(Object.keys(BUILDING_TYPE_LABELS) as BuildingType[]).map((k) => (
                    <option key={k} value={k}>{BUILDING_TYPE_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lbl}>進捗状況</label>
                <select value={project.status}
                  onChange={(e) => updateProject("status", e.target.value as ProjectStatus)}
                  className={fldSelect}>
                  {(Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((k) => (
                    <option key={k} value={k}>{PROJECT_STATUS_LABELS[k]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={lbl}>案件種別</label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(PROJECT_TYPE_LABELS) as ProjectType[]).map((k) => (
                  <button key={k} type="button"
                    onClick={() => updateProject("projectType", k)}
                    className={`min-h-[44px] rounded-xl px-3 py-2.5 text-sm font-bold active:opacity-80 ${
                      project.projectType === k
                        ? "bg-[#8B4A3C] text-white"
                        : "border border-stone-200 bg-white text-stone-500"
                    }`}>
                    {PROJECT_TYPE_LABELS[k]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── 保険案件情報（保険案件の場合のみ表示） ─────────── */}
        {isInsurance && (
          <section className="mb-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-blue-200">
            <h2 className="mb-3 border-b border-blue-100 pb-2 text-sm font-bold text-blue-700">
              保険案件情報
            </h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={lbl}>事故種別</label>
                  <select value={insurance.accidentType}
                    onChange={(e) => updateInsurance("accidentType", e.target.value as AccidentType)}
                    className={fldSelect}>
                    {(Object.keys(ACCIDENT_TYPE_LABELS) as AccidentType[]).map((k) => (
                      <option key={k} value={k}>{ACCIDENT_TYPE_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl}>保険認定状況</label>
                  <select value={insurance.approvalStatus}
                    onChange={(e) => updateInsurance("approvalStatus", e.target.value as InsuranceApprovalStatus)}
                    className={fldSelect}>
                    {(Object.keys(APPROVAL_STATUS_LABELS) as InsuranceApprovalStatus[]).map((k) => (
                      <option key={k} value={k}>{APPROVAL_STATUS_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={lbl}>保険会社</label>
                  <input type="text" value={insurance.insuranceCompany}
                    onChange={(e) => updateInsurance("insuranceCompany", e.target.value)}
                    placeholder="〇〇損害保険" className={fldInput} />
                </div>
                <div>
                  <label className={lbl}>保険商品</label>
                  <input type="text" value={insurance.insuranceProduct}
                    onChange={(e) => updateInsurance("insuranceProduct", e.target.value)}
                    placeholder="火災保険（水濡れ補償）" className={fldInput} />
                </div>
              </div>
              <div>
                <label className={lbl}>事故受付番号</label>
                <input type="text" value={insurance.claimNumber}
                  onChange={(e) => updateInsurance("claimNumber", e.target.value)}
                  placeholder="AB-12345678" className={fldInput} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={lbl}>担当者</label>
                  <input type="text" value={insurance.insuranceContactName}
                    onChange={(e) => updateInsurance("insuranceContactName", e.target.value)}
                    placeholder="担当 佐藤" className={fldInput} />
                </div>
                <div>
                  <label className={lbl}>担当者連絡先</label>
                  <input type="tel" value={insurance.insuranceContactTel}
                    onChange={(e) => updateInsurance("insuranceContactTel", e.target.value)}
                    placeholder="0120-000-000" className={fldInput} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={lbl}>発生日</label>
                  <input type="date" value={insurance.accidentDate}
                    onChange={(e) => updateInsurance("accidentDate", e.target.value)}
                    className={fldInput} />
                </div>
                <div>
                  <label className={lbl}>発見日</label>
                  <input type="date" value={insurance.discoveredDate}
                    onChange={(e) => updateInsurance("discoveredDate", e.target.value)}
                    className={fldInput} />
                </div>
                <div>
                  <label className={lbl}>現地調査日</label>
                  <input type="date" value={insurance.surveyDate}
                    onChange={(e) => updateInsurance("surveyDate", e.target.value)}
                    className={fldInput} />
                </div>
              </div>
              <StructuredTextInput
                label="推定原因"
                value={insurance.suspectedCause}
                onChange={(v) => updateInsurance("suspectedCause", v)}
                placeholder="例：上階洗面所の給水管接続部からの漏水と推定"
                allowFutureVoiceInput
              />
              <div>
                <label className={lbl}>認定金額（円・未確定は空欄）</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={insurance.approvedAmount ?? ""}
                  onChange={(e) =>
                    updateInsurance(
                      "approvedAmount",
                      e.target.value === "" ? null : Number(e.target.value),
                    )
                  }
                  placeholder="未確定"
                  className={fldInput}
                />
              </div>
            </div>
          </section>
        )}

        {/* ── 保存 ───────────────────────────────────────── */}
        {saveMsg && (
          <div className={`mb-3 rounded-xl px-3 py-2 text-xs font-bold ring-1 ${
            saveMsg.ok
              ? "bg-green-50 text-green-700 ring-green-200"
              : "bg-red-50 text-red-600 ring-red-200"
          }`}>
            {saveMsg.text}
          </div>
        )}
        <button
          type="button"
          onClick={handleSave}
          className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#8B4A3C] px-4 py-3 text-sm font-bold text-white shadow-sm active:opacity-80"
        >
          案件を保存する
        </button>

      </div>
    </div>
  );
}
