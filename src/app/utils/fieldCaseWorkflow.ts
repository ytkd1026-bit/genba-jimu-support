// 現場事例 登録ワークフロー（解析→draft→承認→確定）のサーバ側ユーティリティ
//
// フロー:
//   analyze → saveDraft(workflow_status=draft) → 代表者が確認/修正 →
//   approve(承認して保存: 主要データ同期保存 + 監査 + 非同期ジョブ登録)
//
// 重要:
//   * AI生成値は非確定。ai_raw（生値スナップショット）と ai_confidence を保持する。
//   * 承認時、AI値≠承認値の項目を field_case_edits へ記録（将来のAI精度評価用）。
//   * 統計/類似案件/RAG/サムネ等は承認と分離し、非同期（analysis_jobs / stats refresh）で処理。
//
// ※ 書き込みは service_role が必要。API Route から getSupabaseAdminClient() を渡す。

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  rowToFieldCase,
  writeDecisionLog,
  type FieldCase,
  type DiagnosisStatus,
  type WorkflowStatus,
} from "./fieldCases";

// ─── 構造化データ（AI解析結果・確定値の共通形）──────────────────────────────
export type FieldCaseValues = {
  title?: string;
  category: string;
  subcategory?: string;
  manufacturer?: string;
  modelNumber?: string;
  manufacturedOn?: string;
  symptoms: string[];
  errorCodes: string[];
  suspectedCause?: string;
  confirmedCause?: string;
  diagnosisStatus: DiagnosisStatus;
  diagnosis?: string;
  recommendedActions: string[];
  alternativeActions: string[];
  repairCandidates: string[];
  additionalChecks: string[];    // AIが提示する追加確認事項（最大3件想定）
  emergencyAction?: string;
  aiJudgment?: string;
  risk?: string;
  tags: string[];
};

/** 項目別 confidence（0–1）。AI解析結果の確からしさ。 */
export type FieldConfidence = Record<string, number>;

/** リクエストボディ（unknown）から FieldCaseValues を安全に取り出す。 */
export function coerceFieldCaseValues(body: Record<string, unknown>): FieldCaseValues {
  const s = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
  const a = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const st = s(body.diagnosisStatus);
  const diagnosisStatus: DiagnosisStatus =
    st === "confirmed" || st === "manufacturer_confirmed" || st === "unresolved"
      ? (st as DiagnosisStatus)
      : "suspected";
  return {
    title: s(body.title),
    category: s(body.category) ?? "設備工事",
    subcategory: s(body.subcategory),
    manufacturer: s(body.manufacturer),
    modelNumber: s(body.modelNumber),
    manufacturedOn: s(body.manufacturedOn),
    symptoms: a(body.symptoms),
    errorCodes: a(body.errorCodes),
    suspectedCause: s(body.suspectedCause),
    confirmedCause: s(body.confirmedCause),
    diagnosisStatus,
    diagnosis: s(body.diagnosis),
    recommendedActions: a(body.recommendedActions),
    alternativeActions: a(body.alternativeActions),
    repairCandidates: a(body.repairCandidates),
    additionalChecks: a(body.additionalChecks),
    emergencyAction: s(body.emergencyAction),
    aiJudgment: s(body.aiJudgment),
    risk: s(body.risk),
    tags: a(body.tags),
  };
}

// ─── DB 行への変換 ───────────────────────────────────────────────────────────
function valuesToRow(v: FieldCaseValues): Record<string, unknown> {
  return {
    title: v.title ?? null,
    category: v.category,
    subcategory: v.subcategory ?? null,
    manufacturer: v.manufacturer ?? null,
    model_number: v.modelNumber ?? null,
    manufactured_on: normalizeYm(v.manufacturedOn),
    symptoms: v.symptoms ?? [],
    error_codes: v.errorCodes ?? [],
    suspected_cause: v.suspectedCause ?? null,
    confirmed_cause: v.confirmedCause ?? null,
    diagnosis_status: v.diagnosisStatus ?? "suspected",
    diagnosis: v.diagnosis ?? null,
    recommended_actions: v.recommendedActions ?? [],
    alternative_actions: v.alternativeActions ?? [],
    repair_candidates: v.repairCandidates ?? [],
    additional_checks: v.additionalChecks ?? [],
    emergency_action: v.emergencyAction ?? null,
    ai_judgment: v.aiJudgment ?? null,
    risk: v.risk ?? null,
  };
}

function normalizeYm(value?: string): string | null {
  if (!value) return null;
  const t = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const ym = t.match(/^(\d{4})[-/年](\d{1,2})/);
  if (ym) return `${ym[1]}-${ym[2].padStart(2, "0")}-01`;
  const y = t.match(/^(\d{4})$/);
  if (y) return `${y[1]}-01-01`;
  return null;
}

// ─── draft の作成 / 更新 ─────────────────────────────────────────────────────
export type SaveDraftArgs = {
  caseId?: string;                 // 既存draftの更新なら指定
  values: FieldCaseValues;
  aiRaw?: FieldCaseValues;         // AI生成の生値（初回作成時に固定）
  aiConfidence?: FieldConfidence;
  workflowStatus?: Extract<WorkflowStatus, "draft" | "pending_approval">;
};

/** draft を作成または更新する。承認前状態のみ設定可能。 */
export async function saveDraftFieldCase(
  supabase: SupabaseClient,
  args: SaveDraftArgs,
): Promise<FieldCase> {
  const row = valuesToRow(args.values);
  const wf = args.workflowStatus ?? "draft";

  if (args.caseId) {
    const { data, error } = await supabase
      .from("field_cases")
      .update({ ...row, workflow_status: wf })
      .eq("id", args.caseId)
      .in("workflow_status", ["draft", "pending_approval"]) // 承認済みは更新不可
      .select()
      .single();
    if (error || !data) throw new Error(`下書き更新に失敗: ${error?.message ?? "not found"}`);
    await syncTags(supabase, args.caseId, args.values.tags);
    return rowToFieldCase(data);
  }

  const { data, error } = await supabase
    .from("field_cases")
    .insert({
      ...row,
      workflow_status: wf,
      source: "AI棟梁",
      ai_raw: args.aiRaw ?? args.values,
      ai_confidence: args.aiConfidence ?? {},
    })
    .select()
    .single();
  if (error || !data) throw new Error(`下書き作成に失敗: ${error?.message ?? "unknown"}`);
  const fc = rowToFieldCase(data);
  await syncTags(supabase, fc.id, args.values.tags);
  await writeAuditLog(supabase, {
    entity: "field_case",
    entityId: fc.id,
    action: "drafted",
    detail: { workflow_status: wf },
  });
  return fc;
}

/** タグを洗い替える（中間テーブルを一旦クリアして attach_tags で貼り直す）。 */
async function syncTags(supabase: SupabaseClient, caseId: string, tags: string[]) {
  const clean = (tags ?? []).map((t) => t.trim()).filter(Boolean);
  await supabase.from("field_case_tags").delete().eq("case_id", caseId);
  if (clean.length > 0) {
    const { error } = await supabase.rpc("attach_tags", { p_case_id: caseId, p_tags: clean });
    if (error) throw new Error(`タグ更新に失敗: ${error.message}`);
  }
}

// ─── 1件取得（承認前含む・承認画面/再表示用）─────────────────────────────────
export async function getFieldCaseWithDetail(
  supabase: SupabaseClient,
  caseId: string,
): Promise<{
  case: FieldCase;
  tags: string[];
  photos: Record<string, unknown>[];
  aiRaw: FieldCaseValues | null;
  aiConfidence: FieldConfidence;
} | null> {
  const { data, error } = await supabase.from("field_cases").select("*").eq("id", caseId).single();
  if (error || !data) return null;
  const { data: tagRows } = await supabase
    .from("field_case_tags")
    .select("tags(name)")
    .eq("case_id", caseId);
  const tags =
    (tagRows as { tags?: { name?: string } | { name?: string }[] }[] | null)?.flatMap((r) => {
      const t = r.tags;
      if (Array.isArray(t)) return t.map((x) => x.name ?? "");
      return t?.name ? [t.name] : [];
    }).filter(Boolean) ?? [];
  const { data: photos } = await supabase
    .from("field_case_photos")
    .select("*")
    .eq("case_id", caseId)
    .order("sort_order");
  return {
    case: rowToFieldCase(data as Record<string, unknown>),
    tags,
    photos: (photos as Record<string, unknown>[]) ?? [],
    aiRaw: (data.ai_raw as FieldCaseValues) ?? null,
    aiConfidence: (data.ai_confidence as FieldConfidence) ?? {},
  };
}

// ─── 承認（承認して保存）─────────────────────────────────────────────────────
export type ApproveArgs = {
  caseId: string;
  approvedValues: FieldCaseValues; // 代表者が修正した確定値
  approvedBy: string;
  editReasons?: Record<string, string>;
  photoCaptions?: { id: string; caption: string }[]; // 写真説明の修正（任意）
};

export type ApproveResult = {
  case: FieldCase;
  caseNo: string;
  editCount: number;
};

/** 追跡対象項目（AI値と承認値を比較して監査に残す）。 */
const TRACKED_FIELDS: (keyof FieldCaseValues)[] = [
  "title", "category", "subcategory", "manufacturer", "modelNumber", "manufacturedOn",
  "symptoms", "errorCodes", "suspectedCause", "confirmedCause", "diagnosisStatus",
  "diagnosis", "recommendedActions", "alternativeActions", "repairCandidates",
  "additionalChecks", "emergencyAction", "aiJudgment", "risk", "tags",
];

function toComparable(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return JSON.stringify(v);
  return String(v);
}

/**
 * 承認して保存。主要データを同期保存し、監査ログ・edits履歴・Decision Log を残す。
 * 統計/類似案件/RAG/サムネは分離（enqueuePostApproval で非同期化）。
 */
export async function approveFieldCase(
  supabase: SupabaseClient,
  args: ApproveArgs,
): Promise<ApproveResult> {
  // 1. 現在の draft を取得（ai_raw / ai_confidence を得る）
  const { data: current, error: curErr } = await supabase
    .from("field_cases")
    .select("*")
    .eq("id", args.caseId)
    .single();
  if (curErr || !current) throw new Error(`対象が見つかりません: ${curErr?.message ?? ""}`);
  if (current.workflow_status === "approved") {
    throw new Error("この案件は既に承認済みです");
  }
  const aiRaw = (current.ai_raw as FieldCaseValues) ?? args.approvedValues;
  const aiConfidence = (current.ai_confidence as FieldConfidence) ?? {};

  // 2. AI値 ≠ 承認値 の差分を field_case_edits に記録
  const edits: Record<string, unknown>[] = [];
  for (const f of TRACKED_FIELDS) {
    const aiVal = toComparable(aiRaw[f]);
    const apVal = toComparable(args.approvedValues[f]);
    if (aiVal !== apVal) {
      edits.push({
        case_id: args.caseId,
        field_name: f,
        ai_value: aiVal,
        approved_value: apVal,
        ai_confidence: typeof aiConfidence[f] === "number" ? aiConfidence[f] : null,
        edited_by: args.approvedBy,
        edit_reason: args.editReasons?.[f] ?? null,
      });
    }
  }
  if (edits.length > 0) {
    const { error } = await supabase.from("field_case_edits").insert(edits);
    if (error) throw new Error(`監査(edits)保存に失敗: ${error.message}`);
  }

  // 3. 案件ID発番
  const { data: noData, error: noErr } = await supabase.rpc("issue_field_case_no");
  if (noErr) throw new Error(`案件ID発番に失敗: ${noErr.message}`);
  const caseNo = String(noData);

  // 4. field_cases を承認確定
  const row = valuesToRow(args.approvedValues);
  const { data: approved, error: upErr } = await supabase
    .from("field_cases")
    .update({
      ...row,
      workflow_status: "approved",
      case_no: caseNo,
      approved_at: new Date().toISOString(),
      approved_by: args.approvedBy,
      rag_text: buildRagText(args.approvedValues),
    })
    .eq("id", args.caseId)
    .select()
    .single();
  if (upErr || !approved) throw new Error(`承認保存に失敗: ${upErr?.message ?? ""}`);

  // 5. タグ洗い替え
  await syncTags(supabase, args.caseId, args.approvedValues.tags);

  // 6. 写真説明の修正を反映（任意）
  if (args.photoCaptions?.length) {
    for (const pc of args.photoCaptions) {
      await supabase.from("field_case_photos").update({ caption: pc.caption }).eq("id", pc.id);
    }
  }

  // 7. Decision Log
  await writeDecisionLog(supabase, {
    caseId: args.caseId,
    action: "field_case_approved",
    summary: `[${caseNo}] ${args.approvedValues.manufacturer ?? ""} ${
      args.approvedValues.modelNumber ?? ""
    } を承認保存（修正${edits.length}項目）`,
    detail: {
      case_no: caseNo,
      approved_by: args.approvedBy,
      edited_fields: edits.map((e) => e.field_name),
      diagnosis_status: args.approvedValues.diagnosisStatus,
    },
  });

  // 8. 監査ログ
  await writeAuditLog(supabase, {
    entity: "field_case",
    entityId: args.caseId,
    action: "approved",
    actor: args.approvedBy,
    detail: { case_no: caseNo, edit_count: edits.length },
  });

  // 9. 非同期処理をキュー登録（承認応答は待たない）
  await enqueuePostApproval(supabase, args.caseId);

  return { case: rowToFieldCase(approved), caseNo, editCount: edits.length };
}

/** 却下 / 保留 などの状態変更（監査ログ付き）。 */
export async function setWorkflowStatus(
  supabase: SupabaseClient,
  caseId: string,
  status: Extract<WorkflowStatus, "pending_approval" | "rejected" | "verified">,
  actor: string,
  reason?: string,
): Promise<FieldCase> {
  const { data, error } = await supabase
    .from("field_cases")
    .update({ workflow_status: status })
    .eq("id", caseId)
    .select()
    .single();
  if (error || !data) throw new Error(`状態変更に失敗: ${error?.message ?? ""}`);
  await writeAuditLog(supabase, {
    entity: "field_case",
    entityId: caseId,
    action: status === "rejected" ? "rejected" : status === "verified" ? "verified" : "held",
    actor,
    detail: { reason: reason ?? null },
  });
  return rowToFieldCase(data);
}

// ─── 非同期処理 ──────────────────────────────────────────────────────────────
/** 承認後の重い処理をジョブ行として登録する（別ワーカー/エンドポイントで消化）。 */
export async function enqueuePostApproval(supabase: SupabaseClient, caseId: string): Promise<void> {
  await supabase.from("analysis_jobs").insert({
    case_id: caseId,
    status: "queued",
    input_kinds: ["post_approval"],
    result: { tasks: ["similar_cases", "stats_refresh", "rag_text", "pdf_draft", "thumbnail"] },
  });
}

/** 統計の洗い替え（承認とは分離して実行する。cron/Runtime から叩く想定）。 */
export async function refreshStats(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.rpc("refresh_field_case_stats");
  if (error) throw new Error(`統計更新に失敗: ${error.message}`);
}

// ─── 監査ログ ────────────────────────────────────────────────────────────────
export type AuditLogInput = {
  entity: string;
  entityId?: string;
  action: string;
  actor?: string;
  detail?: Record<string, unknown>;
};

export async function writeAuditLog(supabase: SupabaseClient, input: AuditLogInput): Promise<void> {
  const { error } = await supabase.from("audit_logs").insert({
    entity: input.entity,
    entity_id: input.entityId ?? null,
    action: input.action,
    actor: input.actor ?? "AI棟梁",
    detail: input.detail ?? {},
  });
  if (error) console.error("[audit_logs] 書き込み失敗:", error.message);
}

// ─── RAG / 類似検索用テキスト（高度RAGは範囲外。要約テキストの生成のみ）──────
function buildRagText(v: FieldCaseValues): string {
  return [
    v.title,
    `${v.category}/${v.subcategory ?? ""}`,
    `${v.manufacturer ?? ""} ${v.modelNumber ?? ""}`,
    v.symptoms?.join("、"),
    v.errorCodes?.length ? `エラー: ${v.errorCodes.join("、")}` : "",
    v.suspectedCause ? `推定原因: ${v.suspectedCause}` : "",
    v.confirmedCause ? `確定原因: ${v.confirmedCause}` : "",
    v.recommendedActions?.length ? `推奨対応: ${v.recommendedActions.join("、")}` : "",
    v.risk ? `リスク: ${v.risk}` : "",
  ].filter(Boolean).join(" / ");
}
