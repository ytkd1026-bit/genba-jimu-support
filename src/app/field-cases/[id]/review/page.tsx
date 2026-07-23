"use client";

// 代表者確認画面（1画面で確認・編集 → 承認して保存）
// 問題 / 原因 / 診断状態 / 推奨対応 / リスク / 写真説明 / タグ を確認・修正し、
// 下部の 4 ボタン（修正を保存 / 保留 / 却下 / 承認して保存）で操作する。
// 「承認して保存」1回で完了（案件ID発番・保存・監査まで自動）。

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fldInput, fldSelect, lbl } from "@/components/formStyles";
import type { DiagnosisStatus } from "@/app/utils/fieldCases";

type Values = {
  title: string;
  category: string;
  subcategory: string;
  manufacturer: string;
  modelNumber: string;
  manufacturedOn: string;
  symptoms: string[];
  errorCodes: string[];
  suspectedCause: string;
  confirmedCause: string;
  diagnosisStatus: DiagnosisStatus;
  diagnosis: string;
  recommendedActions: string[];
  alternativeActions: string[];
  repairCandidates: string[];
  additionalChecks: string[];
  risk: string;
  tags: string[];
};

type Photo = { id: string; url: string | null; photo_tag: string | null; caption: string | null; photo_status: string };

const DIAG_LABELS: Record<DiagnosisStatus, string> = {
  suspected: "推定（未確定）",
  confirmed: "現地診断で確定",
  manufacturer_confirmed: "メーカー点検で確定",
  unresolved: "未解決",
};

const lines = (s: string): string[] => s.split("\n").map((x) => x.trim()).filter(Boolean);
const csv = (s: string): string[] => s.split(/[,、\n]/).map((x) => x.trim()).filter(Boolean);

export default function FieldCaseReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [v, setV] = useState<Values | null>(null);
  const [confidence, setConfidence] = useState<Record<string, number>>({});
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [workflow, setWorkflow] = useState<string>("draft");
  const [caseNo, setCaseNo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/field-cases/${id}`);
        const json = await res.json();
        if (!json.ok) throw new Error(json.error ?? "取得に失敗しました");
        const c = json.case;
        setV({
          title: c.title ?? "",
          category: c.category ?? "設備工事",
          subcategory: c.subcategory ?? "",
          manufacturer: c.manufacturer ?? "",
          modelNumber: c.modelNumber ?? "",
          manufacturedOn: c.manufacturedOn ?? "",
          symptoms: c.symptoms ?? [],
          errorCodes: c.errorCodes ?? [],
          suspectedCause: c.suspectedCause ?? "",
          confirmedCause: c.confirmedCause ?? "",
          diagnosisStatus: c.diagnosisStatus ?? "suspected",
          diagnosis: c.diagnosis ?? "",
          recommendedActions: c.recommendedActions ?? [],
          alternativeActions: c.alternativeActions ?? [],
          repairCandidates: c.repairCandidates ?? [],
          additionalChecks: c.additionalChecks ?? [],
          risk: c.risk ?? "",
          tags: json.tags ?? [],
        });
        setConfidence(json.aiConfidence ?? {});
        setPhotos(json.photos ?? []);
        setWorkflow(c.workflowStatus ?? "draft");
        setCaseNo(c.caseNo ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "取得に失敗しました");
      }
    })();
  }, [id]);

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setV((prev) => (prev ? { ...prev, [key]: value } : prev));
  }
  function setCaption(pid: string, caption: string) {
    setPhotos((prev) => prev.map((p) => (p.id === pid ? { ...p, caption } : p)));
  }

  function payload() {
    return {
      caseId: id,
      ...v,
      photoCaptions: photos.map((p) => ({ id: p.id, caption: p.caption ?? "" })),
    };
  }

  async function post(url: string, body: unknown, done: string) {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "処理に失敗しました");
      return json;
    } catch (err) {
      setError(err instanceof Error ? err.message : "処理に失敗しました");
      throw err;
    } finally {
      setBusy(false);
      if (done) setMsg(done);
    }
  }

  async function onSaveDraft() {
    try { await post("/api/field-cases/draft", payload(), "修正を保存しました"); } catch {}
  }
  async function onHold() {
    try { await post("/api/field-cases/draft", { ...payload(), hold: true }, "保留にしました"); } catch {}
  }
  async function onReject() {
    if (!confirm("この案件を却下しますか？")) return;
    try {
      await post("/api/field-cases/reject", { caseId: id, reason: "代表者却下" }, "");
      router.push("/field-cases");
    } catch {}
  }
  async function onApprove() {
    try {
      const json = await post("/api/field-cases/approve", { ...payload(), approvedBy: "代表者" }, "");
      setWorkflow("approved");
      setCaseNo(json.caseNo);
      setMsg(`承認して保存しました（案件ID: ${json.caseNo} / 修正${json.editCount}項目）`);
    } catch {}
  }

  if (error && !v) return <main className="p-6 text-sm text-red-600">{error}</main>;
  if (!v) return <main className="p-6 text-sm text-stone-500">読み込み中…</main>;

  const approved = workflow === "approved";

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-stone-50 px-4 pb-40 pt-4">
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-stone-800">内容の確認</h1>
        <Link href="/field-cases" className="text-sm text-[#8B4A3C]">一覧</Link>
      </header>

      {approved && (
        <div className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          承認済み{caseNo ? `（案件ID: ${caseNo}）` : ""}。この内容で保存されています。
        </div>
      )}
      <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-stone-500">
        AIが下書きした内容です。<b>確定情報ではありません。</b>必要に応じて修正し、内容が正しければ「承認して保存」を押してください。
      </p>

      <Field label="案件名" conf={confidence.title}>
        <input className={fldInput} value={v.title} onChange={(e) => set("title", e.target.value)} disabled={approved} />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="工種"><input className={fldInput} value={v.category} onChange={(e) => set("category", e.target.value)} disabled={approved} /></Field>
        <Field label="設備種別"><input className={fldInput} value={v.subcategory} onChange={(e) => set("subcategory", e.target.value)} disabled={approved} /></Field>
        <Field label="メーカー" conf={confidence.manufacturer}><input className={fldInput} value={v.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} disabled={approved} /></Field>
        <Field label="型式" conf={confidence.modelNumber}><input className={fldInput} value={v.modelNumber} onChange={(e) => set("modelNumber", e.target.value)} disabled={approved} /></Field>
        <Field label="製造年月"><input className={fldInput} placeholder="YYYY-MM" value={v.manufacturedOn} onChange={(e) => set("manufacturedOn", e.target.value)} disabled={approved} /></Field>
        <Field label="エラーコード" conf={confidence.errorCodes}><input className={fldInput} value={v.errorCodes.join(", ")} onChange={(e) => set("errorCodes", csv(e.target.value))} disabled={approved} /></Field>
      </div>

      <SectionTitle>問題（症状）</SectionTitle>
      <Field label="症状（1行1件）" conf={confidence.symptoms}>
        <textarea className={`${fldInput} min-h-[72px]`} value={v.symptoms.join("\n")} onChange={(e) => set("symptoms", lines(e.target.value))} disabled={approved} />
      </Field>

      <SectionTitle>原因（推定と確定は分離）</SectionTitle>
      <Field label="推定原因" conf={confidence.suspectedCause}>
        <textarea className={`${fldInput} min-h-[56px]`} value={v.suspectedCause} onChange={(e) => set("suspectedCause", e.target.value)} disabled={approved} />
      </Field>
      <Field label="確定原因（未確定なら空欄）">
        <textarea className={`${fldInput} min-h-[56px]`} value={v.confirmedCause} onChange={(e) => set("confirmedCause", e.target.value)} disabled={approved} />
      </Field>
      <Field label="診断状態" conf={confidence.diagnosisStatus}>
        <select className={fldSelect} value={v.diagnosisStatus} onChange={(e) => set("diagnosisStatus", e.target.value as DiagnosisStatus)} disabled={approved}>
          {(Object.keys(DIAG_LABELS) as DiagnosisStatus[]).map((k) => (
            <option key={k} value={k}>{DIAG_LABELS[k]}</option>
          ))}
        </select>
      </Field>

      <SectionTitle>推奨対応 / 代替対応</SectionTitle>
      <Field label="推奨対応（1行1件）" conf={confidence.recommendedActions}>
        <textarea className={`${fldInput} min-h-[72px]`} value={v.recommendedActions.join("\n")} onChange={(e) => set("recommendedActions", lines(e.target.value))} disabled={approved} />
      </Field>
      <Field label="代替対応（1行1件）">
        <textarea className={`${fldInput} min-h-[56px]`} value={v.alternativeActions.join("\n")} onChange={(e) => set("alternativeActions", lines(e.target.value))} disabled={approved} />
      </Field>

      <SectionTitle>リスク</SectionTitle>
      <Field label="リスク" conf={confidence.risk}>
        <textarea className={`${fldInput} min-h-[56px]`} value={v.risk} onChange={(e) => set("risk", e.target.value)} disabled={approved} />
      </Field>

      {v.additionalChecks.length > 0 && (
        <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
          <b>AIからの確認事項:</b>
          <ul className="ml-4 list-disc">{v.additionalChecks.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      )}

      <SectionTitle>写真説明</SectionTitle>
      <div className="space-y-2">
        {photos.length === 0 && <p className="text-xs text-stone-400">写真はありません。</p>}
        {photos.map((p) => (
          <div key={p.id} className="flex gap-2 rounded-lg border border-stone-200 bg-white p-2">
            {p.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.url} alt={p.photo_tag ?? ""} className="h-16 w-16 rounded object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded bg-stone-100 text-[10px] text-stone-400">未取込</div>
            )}
            <div className="flex-1">
              <div className="text-xs text-stone-500">{p.photo_tag ?? "（タグなし）"}</div>
              <input className={`${fldInput} mt-1`} value={p.caption ?? ""} placeholder="写真の説明" onChange={(e) => setCaption(p.id, e.target.value)} disabled={approved} />
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>タグ</SectionTitle>
      <Field label="タグ（カンマ / 改行区切り）">
        <textarea className={`${fldInput} min-h-[56px]`} value={v.tags.join(", ")} onChange={(e) => set("tags", csv(e.target.value))} disabled={approved} />
      </Field>

      {msg && <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</p>}
      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {/* 固定フッター：4ボタン */}
      {!approved && (
        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mb-2 grid grid-cols-3 gap-2">
            <button type="button" disabled={busy} onClick={onSaveDraft} className="min-h-[46px] rounded-lg border border-stone-300 bg-white text-sm text-stone-700 disabled:opacity-40">修正を保存</button>
            <button type="button" disabled={busy} onClick={onHold} className="min-h-[46px] rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-700 disabled:opacity-40">保留</button>
            <button type="button" disabled={busy} onClick={onReject} className="min-h-[46px] rounded-lg border border-red-300 bg-red-50 text-sm text-red-600 disabled:opacity-40">却下</button>
          </div>
          <button type="button" disabled={busy} onClick={onApprove} className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-[#8B4A3C] text-base font-bold text-white disabled:opacity-40">
            {busy ? "処理中…" : "承認して保存"}
          </button>
        </div>
      )}
    </main>
  );
}

// ─── 小コンポーネント ──
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-1 mt-5 border-b border-stone-200 pb-1 text-sm font-bold text-stone-700">{children}</h2>;
}

function Field({ label, conf, children }: { label: string; conf?: number; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between">
        <label className={lbl}>{label}</label>
        {typeof conf === "number" && <ConfidenceBadge value={conf} />}
      </div>
      {children}
    </div>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const cls = value >= 0.7 ? "bg-green-100 text-green-700" : value >= 0.4 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] ${cls}`}>AI確度 {pct}%</span>;
}
