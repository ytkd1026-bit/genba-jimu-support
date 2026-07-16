"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { getCustomers, type Customer } from "@/app/utils/customers";
import { draftKey } from "@/app/utils/draftStorage";
import { useAutoDraft } from "@/hooks/useAutoDraft";
import { SaveStatusBar } from "@/components/SaveStatusBar";
import { getSavedProjects, upsertProject } from "@/app/utils/savedProjects";
import {
  projectsStore,
  registerNewProject,
  projectDisplayId,
  INFLOW_ROUTE_LABELS,
  type InflowRoute,
} from "@/app/utils/projects";
import { recordMigration, migratedProjectIdOf } from "@/app/utils/projectMigration";
import { getProjectCode } from "@/app/utils/companySettings";
import { validateProjectCode } from "@/app/utils/projectNumbers";

// 2つのキーの役割：
//   DRAFT_PROJECT_KEY       → 「下書き保存」ボタン押下時の手動保存先（旧来のキー。後方互換のため維持）
//                              形式は独自 JSON（koujiTypeLabel など結合値も含む）
//   PROJECT_AUTO_DRAFT_KEY  → useAutoDraft による自動下書き保存先（新規キー）
//                              手動保存が完了したら clearDraft() で削除する
const DRAFT_PROJECT_KEY = "genba_jimu_new_project_draft";
const PROJECT_AUTO_DRAFT_KEY = draftKey('project', 'new');

type ProjectDraftData = {
  projectId?: string;
  form: {
    projectName: string; clientName: string; contactName: string; address: string;
    koujiTypes: string[]; koujiTypeOther: string; koujiContents: string[];
    koujiContentCustom: string; koujiContentMemo: string; scaleNote: string;
    parkingNote: string; sekouDate: string; mitsumoriState: string; seikyuuState: string; memo: string;
    // 流入経路（2026-07追加。過去の下書きには無いため復元時はマージする）
    inflowRoute?: InflowRoute | ""; inflowSourceName?: string;
  };
  selectedCustomerId: string;
};

// ─── 工事種別（複数選択） ────────────────────────────────────────
const KOUJI_TYPE_OPTIONS = [
  "新築工事",
  "リノベーション工事",
  "リフォーム工事",
  "原状回復工事",
  "その他工事",
];

// ─── 工事内容（複数選択） ────────────────────────────────────────
const KOUJI_CONTENT_OPTIONS = [
  "大工工事",
  "電気工事",
  "設備工事",
  "内装工事",
  "美装工事",
  "リペア工事",
  "その他工事",
];

const MITSUMORI_STATES = ["未作成", "作成中", "提出済み", "受注"];
const SEIKYUU_STATES   = ["未請求", "請求済み", "入金済み"];

const labelCls = "block text-sm font-bold text-stone-700 mb-1";
const inputCls = "w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-2 focus:ring-[#8B4A3C]/20";
const checkboxRowCls = "flex cursor-pointer items-center gap-2.5 rounded-xl border border-stone-100 bg-stone-50 px-3 py-2.5 active:bg-stone-100";

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="w-28 shrink-0 pt-0.5 text-xs text-stone-400">{label}</span>
      <span className={value ? "text-stone-800" : "text-stone-300"}>{value || "（未入力）"}</span>
    </li>
  );
}

export default function NewProjectPage() {
  const router = useRouter();

  // 得意先
  const [customers,           setCustomers]           = useState<Customer[]>([]);
  const [selectedCustomerId,  setSelectedCustomerId]  = useState<string>("");
  const [showCustomerPicker,  setShowCustomerPicker]  = useState(false);

  // 保存メッセージ
  const [savedMsg, setSavedMsg] = useState("");
  const [showSavedLink, setShowSavedLink] = useState(false);

  // ── 自動下書き保存関連 state ──────────────────────────────────
  const [currentProjectId,  setCurrentProjectId]  = useState<string | null>(null);
  const [savedProjectId,    setSavedProjectId]    = useState<string | null>(null); // 発行された新 projectId（REV-...）
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);

  // フォーム
  const [form, setForm] = useState({
    projectName:        "",
    clientName:         "",
    contactName:        "",
    address:            "",
    koujiTypes:         [] as string[],
    koujiTypeOther:     "",
    koujiContents:      [] as string[],
    koujiContentCustom: "",
    koujiContentMemo:   "",
    scaleNote:          "",
    parkingNote:        "",
    sekouDate:          "",
    mitsumoriState:     "未作成",
    seikyuuState:       "未請求",
    memo:               "",
    inflowRoute:        "" as InflowRoute | "",
    inflowSourceName:   "",
  });

  // 会社設定の案件ID用コード（未設定なら案件登録できない）
  const [projectCode, setProjectCode] = useState<string>("");
  useEffect(() => {
    setProjectCode(getProjectCode());
  }, []);
  const projectCodeMissing = validateProjectCode(projectCode) !== null;

  const draftData = useMemo<ProjectDraftData>(() => ({
    projectId: currentProjectId ?? undefined,
    form,
    selectedCustomerId,
  }), [currentProjectId, form, selectedCustomerId]);

  const { saveStatus, savedAt, clearDraft, restoredDraft } = useAutoDraft<ProjectDraftData>(
    PROJECT_AUTO_DRAFT_KEY, 'project', 'new', draftData,
    { enabled: true, debounceMs: 800 },
  );

  useEffect(() => {
    setCustomers(getCustomers());
  }, []);

  // 下書き復元バナー（初回のみ）
  useEffect(() => {
    if (!restoredDraft) return;
    const hasContent = restoredDraft.data.form.projectName.trim() !== '' ||
      restoredDraft.data.form.clientName.trim() !== '';
    if (!hasContent) return;
    setShowRestoreBanner(true);
  }, [restoredDraft]);

  // beforeunload 警告
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (saveStatus === 'dirty') { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveStatus]);

  function handleRestoreProjectDraft() {
    if (!restoredDraft) return;
    const d = restoredDraft.data;
    if (d.projectId) setCurrentProjectId(d.projectId);
    // 旧下書きに新項目（流入経路）が無くても壊れないようにマージ復元する
    setForm((prev) => ({ ...prev, ...d.form }));
    setSelectedCustomerId(d.selectedCustomerId);
    setShowRestoreBanner(false);
  }

  function handleDiscardProjectDraft() {
    clearDraft();
    setShowRestoreBanner(false);
  }

  // ─── テキスト系フィールド ────────────────────────────────────────
  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  // ─── 工事種別トグル ──────────────────────────────────────────────
  function toggleKoujiType(type: string) {
    setForm((prev) => ({
      ...prev,
      koujiTypes: prev.koujiTypes.includes(type)
        ? prev.koujiTypes.filter((t) => t !== type)
        : [...prev.koujiTypes, type],
    }));
  }

  // ─── 工事内容トグル ──────────────────────────────────────────────
  function toggleKoujiContent(content: string) {
    setForm((prev) => ({
      ...prev,
      koujiContents: prev.koujiContents.includes(content)
        ? prev.koujiContents.filter((c) => c !== content)
        : [...prev.koujiContents, content],
    }));
  }

  // ─── 得意先選択 ──────────────────────────────────────────────────
  function handleSelectCustomer(c: Customer) {
    setForm((prev) => ({
      ...prev,
      clientName:  c.name,
      contactName: c.contactName,
    }));
    setSelectedCustomerId(c.id);
    setShowCustomerPicker(false);
  }

  // ─── 確認表示用の結合値 ─────────────────────────────────────────
  function koujiTypeLabel(): string {
    const parts = [...form.koujiTypes];
    if (form.koujiTypeOther.trim()) parts.push(form.koujiTypeOther.trim());
    return parts.join("・");
  }

  function koujiContentLabel(): string {
    const parts = [...form.koujiContents];
    if (form.koujiContentCustom.trim()) parts.push(form.koujiContentCustom.trim());
    return parts.join("・");
  }

  // ─── 下書き保存 ─────────────────────────────────────────────────
  function handleDraftSave() {
    try {
      const id = currentProjectId ?? `proj-${Date.now()}`;
      const draft = {
        ...form,
        projectId:         id,
        koujiTypeLabel:    koujiTypeLabel(),
        koujiContentLabel: koujiContentLabel(),
        savedAt:           new Date().toLocaleString("ja-JP"),
      };
      localStorage.setItem(DRAFT_PROJECT_KEY, JSON.stringify(draft));
      setCurrentProjectId(id);
      clearDraft(); // 自動下書きを削除（手動保存完了）
      setShowSavedLink(false);
      setSavedMsg("案件を下書き保存しました。");
      setTimeout(() => setSavedMsg(""), 4000);
    } catch {
      setSavedMsg("保存に失敗しました。");
    }
  }

  // ─── 案件として本保存 ───────────────────────────────────────────
  // 保存責務（過渡期の二重管理を明確化）:
  //   正本    = projectsStore（新 Project。一案件一元管理の中心）
  //   互換維持 = savedProjects（旧「保存済み案件一覧 /projects/saved」を壊さないため継続保存）
  // 旧 id → 新 projectId のマッピングを記録し、案件一覧の移行バナーが二重計上しないようにする。
  // 既存IDがある場合は同じIDで上書き保存する（重複登録防止）。
  async function handleSaveProject() {
    if (!form.projectName.trim()) {
      alert("案件名を入力してから保存してください。");
      return;
    }
    // 案件ID用コード未設定では案件化（発番）できない
    if (projectCodeMissing) {
      alert(
        "案件ID用コードが未設定のため、案件を登録できません。\n事業者設定の「案件ID用コード」を登録してください（例：REVO）。",
      );
      return;
    }
    try {
      const now = new Date().toLocaleString("ja-JP");
      const legacyId = currentProjectId ?? `proj-${Date.now()}`;
      const existing = currentProjectId
        ? getSavedProjects().find((p) => p.id === currentProjectId)
        : null;

      // 1) 互換維持: 旧 savedProjects へ保存（既存一覧画面の表示を壊さない）
      upsertProject({
        id: legacyId,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        projectName:        form.projectName,
        clientName:         form.clientName,
        contactName:        form.contactName,
        address:            form.address,
        koujiTypes:         form.koujiTypes,
        koujiTypeOther:     form.koujiTypeOther,
        koujiContents:      form.koujiContents,
        koujiContentCustom: form.koujiContentCustom,
        koujiContentMemo:   form.koujiContentMemo,
        scaleNote:          form.scaleNote,
        parkingNote:        form.parkingNote,
        sekouDate:          form.sekouDate,
        mitsumoriState:     form.mitsumoriState,
        seikyuuState:       form.seikyuuState,
        memo:               form.memo,
        selectedCustomerId,
      });

      // 共通の案件フィールド（新規・再保存の両方で使う）
      const projectFields = {
        projectName:      form.projectName,
        siteAddress:      form.address,
        customerName:     form.contactName,
        clientName:       form.clientName,
        submitTo:         form.clientName,
        customerId:       selectedCustomerId || undefined,
        inflowRoute:      form.inflowRoute === "" ? undefined : form.inflowRoute,
        inflowSourceName: form.inflowSourceName?.trim() || undefined,
      };

      // 2) 正本: 新 Project を作成/更新（同じ旧 id からは同じ projectId へ上書き）
      const existingProjectId = migratedProjectIdOf(legacyId);
      let projectId: string;
      if (existingProjectId && projectsStore.getById(existingProjectId)) {
        // 再保存: 既存案件の上書き。発番済みの案件番号は変更しない（再発番禁止）
        const base = projectsStore.getById(existingProjectId)!;
        const ok = projectsStore.upsert({
          ...base,
          ...projectFields,
          projectId: existingProjectId,
          updatedAt: new Date().toISOString(),
        });
        if (!ok) throw new Error("projectsStore.upsert failed");
        projectId = existingProjectId;
      } else {
        // 新規: 案件化＝内部UUID発行＋表示用案件番号（例: REVO-26-0001）の自動発番
        const { project, error } = await registerNewProject(projectFields);
        if (!project) {
          setShowSavedLink(false);
          setSavedMsg(error ?? "保存に失敗しました。");
          return;
        }
        projectId = project.projectId;
      }
      recordMigration(legacyId, projectId);

      setCurrentProjectId(legacyId);
      clearDraft(); // 自動下書きを削除（本保存済みのため不要）
      setSavedProjectId(projectId);
      // 保存後は案件詳細へ自動移動（saved=1 で歓迎メッセージを表示）
      router.push(`/projects/${encodeURIComponent(projectId)}?saved=1`);
    } catch {
      setShowSavedLink(false);
      setSavedMsg("保存に失敗しました。");
    }
  }

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        <header className="mb-4">
          <Link href="/projects/register"
            className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← 案件検索・登録へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">新規案件登録</h1>
          <p className="mt-1 text-sm text-stone-500">
            現場名・工事内容・予定を登録して、見積と請求の入口を作ります。
          </p>
        </header>

        {/* ── この画面でできること ── */}
        <div className="mb-4 rounded-2xl border border-[#8B4A3C]/15 bg-[#fff8f5] p-4 shadow-sm">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#8B4A3C]">
            <span>💡</span>この画面でできること
          </p>
          <p className="text-sm leading-relaxed text-stone-700">
            この画面では、新しい案件情報を登録します。<br />
            入力途中の内容は自動で下書き保存されます。<br />
            「案件として保存」を押すと、保存済み案件一覧に登録されます。
          </p>
        </div>

        {/* ── 案件ID用コード未設定の警告 ── */}
        {projectCodeMissing && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
            <p className="text-sm font-bold text-red-700">案件ID用コードが未設定です</p>
            <p className="mt-1 text-xs leading-relaxed text-red-600">
              案件番号（例：REVO-26-0001）の頭に付くコードが未設定のため、案件を登録できません。
              先に事業者設定で登録してください。
            </p>
            <Link
              href="/settings/company"
              className="mt-2 inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white active:opacity-80"
            >
              事業者設定を開く →
            </Link>
          </div>
        )}

        {/* ── 自動下書き保存ステータスバー ── */}
        <SaveStatusBar status={saveStatus} savedAt={savedAt} />

        {/* ── 下書き復元バナー ── */}
        {showRestoreBanner && restoredDraft && (
          <div className="mb-4 overflow-hidden rounded-2xl border border-amber-300 bg-amber-50 shadow-sm">
            <div className="border-b border-amber-200 bg-amber-100 px-4 py-2.5">
              <p className="text-sm font-bold text-amber-800">前回入力途中の下書きがあります</p>
            </div>
            <div className="space-y-2 px-4 py-3">
              <p className="text-xs text-amber-700">
                最終更新：{new Date(restoredDraft.updatedAt).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={handleRestoreProjectDraft}
                  className="flex-1 rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white active:opacity-80">
                  下書きを復元する
                </button>
                <button type="button" onClick={handleDiscardProjectDraft}
                  className="flex-1 rounded-xl border border-amber-300 bg-white py-2.5 text-sm font-bold text-amber-700 active:opacity-80">
                  破棄して新しく作る
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">

          {/* ── 得意先選択 ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <h2 className="text-sm font-bold text-stone-700">元請・得意先を選ぶ</h2>
              <Link href="/customers"
                className="text-xs text-[#8B4A3C] underline underline-offset-2 active:opacity-70">
                得意先一覧へ進む
              </Link>
            </div>

            {customers.length === 0 ? (
              <div className="rounded-xl bg-stone-50 px-4 py-3 text-center">
                <p className="text-xs text-stone-500">得意先が登録されていません。</p>
                <Link href="/customers"
                  className="mt-1.5 inline-block rounded-xl border border-[#8B4A3C] px-4 py-2 text-xs font-bold text-[#8B4A3C] active:opacity-75">
                  得意先を追加する
                </Link>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setShowCustomerPicker((v) => !v)}
                  className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm active:opacity-80"
                >
                  <span className={selectedCustomerId ? "font-bold text-stone-800" : "text-stone-400"}>
                    {selectedCustomerId
                      ? (customers.find((c) => c.id === selectedCustomerId)?.name ?? "得意先を選択")
                      : "得意先を選択"}
                  </span>
                  <span className="text-stone-400">{showCustomerPicker ? "▲" : "▼"}</span>
                </button>

                {showCustomerPicker && (
                  <div className="space-y-1.5">
                    {customers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectCustomer(c)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left active:opacity-80 ${
                          selectedCustomerId === c.id
                            ? "border-[#8B4A3C] bg-[#fff8f5]"
                            : "border-stone-200 bg-white"
                        }`}
                      >
                        <div>
                          <p className="text-sm font-bold text-stone-800">{c.name}</p>
                          {c.contactName && (
                            <p className="text-xs text-stone-500">担当：{c.contactName}</p>
                          )}
                        </div>
                        {selectedCustomerId === c.id && (
                          <span className="ml-auto text-xs font-bold text-[#8B4A3C]">選択中</span>
                        )}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setShowCustomerPicker(false)}
                      className="w-full rounded-xl border border-stone-200 py-2 text-xs font-bold text-stone-400 active:opacity-70"
                    >
                      閉じる
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── 基本情報 ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
            <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">基本情報</h2>

            <div>
              <label htmlFor="projectName" className={labelCls}>
                案件名 <span className="text-[#8B4A3C]">*</span>
              </label>
              <input
                id="projectName" name="projectName" type="text"
                value={form.projectName} onChange={handleChange}
                placeholder="例：〇〇マンション クロス貼替" className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="clientName" className={labelCls}>元請け・顧客名</label>
              <input
                id="clientName" name="clientName" type="text"
                value={form.clientName} onChange={handleChange}
                placeholder="例：△△工務店" className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="contactName" className={labelCls}>担当者</label>
              <input
                id="contactName" name="contactName" type="text"
                value={form.contactName} onChange={handleChange}
                placeholder="例：山田様" className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="address" className={labelCls}>現場住所</label>
              <input
                id="address" name="address" type="text"
                value={form.address} onChange={handleChange}
                placeholder="例：大阪府堺市〇〇区" className={inputCls}
              />
            </div>

            {/* ── 流入経路 ── */}
            <div>
              <label htmlFor="inflowRoute" className={labelCls}>流入経路（どこから来た案件か）</label>
              <select
                id="inflowRoute" name="inflowRoute"
                value={form.inflowRoute} onChange={handleChange} className={inputCls}
              >
                <option value="">選択してください</option>
                {(Object.keys(INFLOW_ROUTE_LABELS) as InflowRoute[]).map((r) => (
                  <option key={r} value={r}>{INFLOW_ROUTE_LABELS[r]}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-stone-400">
                経路別の売上・成約率を後から集計するために使います。
              </p>
              {form.inflowRoute === "contractor" && (
                <div className="mt-2">
                  <label htmlFor="inflowSourceName" className="mb-1 block text-xs text-stone-500">
                    元請会社・取引先名
                  </label>
                  <input
                    id="inflowSourceName" name="inflowSourceName" type="text"
                    value={form.inflowSourceName} onChange={handleChange}
                    list="inflow-contractor-options"
                    placeholder="例：△△工務店（登録済みの得意先から選択もできます）"
                    className={inputCls.replace("text-base", "text-sm")}
                  />
                  <datalist id="inflow-contractor-options">
                    {customers.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </div>
              )}
            </div>

            {/* ── 工事種別（複数選択） ── */}
            <div>
              <label className={labelCls}>工事種別（複数選択可）</label>
              <div className="grid grid-cols-2 gap-1.5">
                {KOUJI_TYPE_OPTIONS.map((type) => {
                  const checked = form.koujiTypes.includes(type);
                  return (
                    <label
                      key={type}
                      className={`${checkboxRowCls} ${checked ? "border-[#8B4A3C]/40 bg-[#fff8f5]" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleKoujiType(type)}
                        className="h-4 w-4 shrink-0 accent-[#8B4A3C]"
                      />
                      <span className={`text-sm ${checked ? "font-bold text-[#8B4A3C]" : "text-stone-700"}`}>
                        {type}
                      </span>
                    </label>
                  );
                })}
              </div>
              {/* 自由入力 */}
              <div className="mt-2">
                <label className="mb-1 block text-xs text-stone-500">その他・自由入力</label>
                <input
                  name="koujiTypeOther"
                  type="text"
                  value={form.koujiTypeOther}
                  onChange={handleChange}
                  placeholder="例：解体工事、外構工事など"
                  className={inputCls.replace("text-base", "text-sm")}
                />
              </div>
            </div>

            {/* ── 工事内容（複数選択） ── */}
            <div>
              <label className={labelCls}>工事内容（複数選択可）</label>
              <div className="space-y-1.5">
                {KOUJI_CONTENT_OPTIONS.map((content) => {
                  const checked = form.koujiContents.includes(content);
                  return (
                    <label
                      key={content}
                      className={`${checkboxRowCls} ${checked ? "border-[#8B4A3C]/40 bg-[#fff8f5]" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleKoujiContent(content)}
                        className="h-4 w-4 shrink-0 accent-[#8B4A3C]"
                      />
                      <span className={`text-sm leading-tight ${checked ? "font-bold text-[#8B4A3C]" : "text-stone-700"}`}>
                        {content}
                      </span>
                    </label>
                  );
                })}
              </div>
              {/* 自由入力 */}
              <div className="mt-2">
                <label className="mb-1 block text-xs text-stone-500">その他・自由入力</label>
                <input
                  name="koujiContentCustom"
                  type="text"
                  value={form.koujiContentCustom}
                  onChange={handleChange}
                  placeholder="例：仮設工事、外構工事など"
                  className={inputCls.replace("text-base", "text-sm")}
                />
              </div>
            </div>

            {/* ── 工事内容メモ ── */}
            <div>
              <label htmlFor="koujiContentMemo" className={labelCls}>工事内容メモ</label>
              <textarea
                id="koujiContentMemo" name="koujiContentMemo" rows={3}
                value={form.koujiContentMemo} onChange={handleChange}
                placeholder="例：洋室クロス貼替、洗面所CF貼替、既存CF撤去あり"
                className={inputCls + " resize-none"}
              />
              <p className="mt-1 text-xs text-stone-400">工事の具体的な施工内容・細目を記入してください</p>
            </div>

            <div>
              <label htmlFor="scaleNote" className={labelCls}>工事規模メモ</label>
              <textarea
                id="scaleNote" name="scaleNote" rows={3}
                value={form.scaleNote} onChange={handleChange}
                placeholder="例：クロス約50m、CF約8㎡、巾木20枚など"
                className={inputCls + " resize-none"}
              />
              <p className="mt-1 text-xs text-stone-400">材料計算・見積のたたき台に使います</p>
            </div>

            <div>
              <label htmlFor="parkingNote" className={labelCls}>駐車場・搬入条件</label>
              <textarea
                id="parkingNote" name="parkingNote" rows={3}
                value={form.parkingNote} onChange={handleChange}
                placeholder="例：駐車場なし、EVあり、階段3階、夜間作業不可など"
                className={inputCls + " resize-none"}
              />
              <p className="mt-1 text-xs text-stone-400">諸経費・人工・段取りの確認に使います</p>
            </div>

            <div>
              <label htmlFor="sekouDate" className={labelCls}>施工予定日</label>
              <input
                id="sekouDate" name="sekouDate" type="date"
                value={form.sekouDate} onChange={handleChange}
                className={inputCls}
              />
            </div>
          </div>

          {/* ── ステータス ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
            <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">ステータス</h2>
            <div>
              <label htmlFor="mitsumoriState" className={labelCls}>見積状態</label>
              <select
                id="mitsumoriState" name="mitsumoriState"
                value={form.mitsumoriState} onChange={handleChange} className={inputCls}
              >
                {MITSUMORI_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="seikyuuState" className={labelCls}>請求状態</label>
              <select
                id="seikyuuState" name="seikyuuState"
                value={form.seikyuuState} onChange={handleChange} className={inputCls}
              >
                {SEIKYUU_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* ── メモ ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <label htmlFor="memo" className={labelCls}>メモ</label>
            <textarea
              id="memo" name="memo" rows={4}
              value={form.memo} onChange={handleChange}
              placeholder="例：元請けへの注意点、施主希望、追加確認事項など"
              className={inputCls + " resize-none"}
            />
          </div>

          {/* ── 登録内容確認カード ── */}
          <div className="overflow-hidden rounded-2xl shadow-sm ring-2 ring-[#8B4A3C]/20">
            <div className="bg-[#8B4A3C] px-4 py-3">
              <h2 className="text-sm font-bold text-white">登録内容確認</h2>
              <p className="mt-0.5 text-xs text-amber-100">登録前に内容を確認してください。</p>
            </div>
            <div className="bg-[#fff8f5] p-4">
              <ul className="space-y-2">
                <ConfirmRow label="元請名・顧客名"   value={form.clientName} />
                <ConfirmRow label="担当者"           value={form.contactName} />
                <ConfirmRow label="案件名"           value={form.projectName} />
                <ConfirmRow label="現場住所"         value={form.address} />
                <ConfirmRow label="流入経路"
                  value={
                    form.inflowRoute === ""
                      ? ""
                      : INFLOW_ROUTE_LABELS[form.inflowRoute] +
                        (form.inflowRoute === "contractor" && form.inflowSourceName
                          ? `（${form.inflowSourceName}）`
                          : "")
                  }
                />
                <ConfirmRow label="工事種別"         value={koujiTypeLabel()} />
                <ConfirmRow label="工事内容"         value={koujiContentLabel()} />
                <ConfirmRow label="工事内容メモ"     value={form.koujiContentMemo} />
                <ConfirmRow label="工事規模メモ"     value={form.scaleNote} />
                <ConfirmRow label="駐車場・搬入条件" value={form.parkingNote} />
                <ConfirmRow label="施工予定日"       value={form.sekouDate.replace(/-/g, "/")} />
                <ConfirmRow label="見積状態"         value={form.mitsumoriState} />
                <ConfirmRow label="請求状態"         value={form.seikyuuState} />
              </ul>
            </div>
          </div>

          {/* ── ボタン群 ── */}
          <div className="space-y-3 pb-8 pt-1">
            <button
              type="button"
              onClick={handleSaveProject}
              className="w-full rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80"
            >
              案件として保存
            </button>

            <button
              type="button"
              onClick={handleDraftSave}
              className="w-full rounded-2xl border border-stone-300 bg-white py-3 text-sm font-bold text-stone-500 shadow-sm active:opacity-80"
            >
              仮保存（下書きのみ）
            </button>

            {savedMsg && (
              <div className="rounded-xl bg-green-50 px-4 py-3 ring-1 ring-green-200">
                <p className="text-sm font-bold text-green-700">{savedMsg}</p>
                {showSavedLink && savedProjectId && (
                  <p className="mt-1 text-xs text-green-600">
                    案件ID：
                    <span className="font-mono font-bold">
                      {(() => {
                        const p = projectsStore.getById(savedProjectId);
                        return p ? projectDisplayId(p) : savedProjectId;
                      })()}
                    </span>
                  </p>
                )}
                {showSavedLink && (
                  <Link href="/projects/list" className="mt-1 block text-xs text-green-600 underline underline-offset-2">
                    案件一覧を見る →
                  </Link>
                )}
              </div>
            )}

            {/* 本保存後は案件詳細（新・一元管理）へ進む。未保存時は先に保存を促す */}
            <button
              type="button"
              onClick={() => {
                if (savedProjectId) {
                  router.push(`/projects/${encodeURIComponent(savedProjectId)}`);
                } else {
                  alert("先に「案件として保存」を押してください。案件IDを発行してから詳細画面へ進めます。");
                }
              }}
              className="flex w-full items-center justify-center rounded-2xl border-2 border-[#8B4A3C] bg-white py-4 text-base font-bold text-[#8B4A3C] shadow-sm active:opacity-80"
            >
              案件詳細へ進む（調査・写真・見積・請求）
            </button>

            <Link
              href="/"
              className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-3 text-sm font-bold text-stone-400 shadow-sm active:opacity-80"
            >
              ホームへ戻る
            </Link>

            <div className="flex justify-end pt-1">
              <Link href="/test-feedback"
                className="text-xs text-stone-400 underline underline-offset-2 hover:text-[#8B4A3C]">
                この画面の感想を書く
              </Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
