// 現場データ（AI棟梁ナレッジ）の型定義と Supabase 連携ユーティリティ
//
// このモジュールは以下を提供する:
//   1. TypeScript 型          … FieldCaseInput / FieldCase / FieldCasePhoto など
//   2. Supabase Insert 関数   … insertFieldCase()
//   3. Storage Upload 関数    … uploadFieldPhoto() / uploadFieldPhotos()
//   4. Decision Log 出力      … insertFieldCase 内で自動記録 + writeDecisionLog()
//
// ※ 書き込みは service_role が必要なため、サーバ側（API Route / Server Action）から
//   getSupabaseAdminClient() を渡して使う想定。Storage のバケットは field-photos。

import type { SupabaseClient } from "@supabase/supabase-js";

export const FIELD_PHOTO_BUCKET = "field-photos";

// ─── 型定義 ──────────────────────────────────────────────────────────────────

/** 登録前の入力（画像は別途アップロードして photos に URL を渡す）。 */
export type FieldCaseInput = {
  category: string;                 // 例: 設備工事
  subcategory?: string;             // 例: 給湯器
  manufacturer?: string;            // 例: ノーリツ
  modelNumber?: string;             // 例: GT-1634SAWS-TB
  /** 製造年月。YYYY-MM または YYYY-MM-DD。年月のみは月初として保存する。 */
  manufacturedOn?: string;
  symptoms: string[];               // 症状（複数）
  cause?: string;                   // 原因
  diagnosis?: string;               // 診断
  recommendedActions: string[];     // 推奨対応（複数）
  emergencyAction?: string;         // 応急対応
  aiJudgment?: string;              // AI判定
  risk?: string;                    // リスク
  tags: string[];                   // タグ（別テーブルで正規化管理）
  source?: string;                  // 既定 'AI棟梁'
  photos?: FieldPhotoInput[];       // 紐付ける画像（URL 済み）
};

/** アップロード済み画像を現場データへ紐付けるための入力。 */
export type FieldPhotoInput = {
  storagePath: string;              // バケット内パス
  url: string;                      // 公開/署名 URL
  photoTag?: string;                // 写真タグ 例: 給湯器型式ラベル
  caption?: string;                 // 補足 例: エラー651表示
  sortOrder?: number;
};

/** DB に格納された現場データ（行の形）。 */
export type FieldCase = {
  id: string;
  category: string;
  subcategory: string | null;
  manufacturer: string | null;
  modelNumber: string | null;
  manufacturedOn: string | null;
  symptoms: string[];
  cause: string | null;
  diagnosis: string | null;
  recommendedActions: string[];
  emergencyAction: string | null;
  aiJudgment: string | null;
  risk: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
};

export type FieldCasePhoto = {
  id: string;
  caseId: string;
  storagePath: string;
  url: string;
  photoTag: string | null;
  caption: string | null;
  sortOrder: number;
  createdAt: string;
};

/** 検索結果（search_field_cases RPC の戻り + タグ配列）。 */
export type FieldCaseSearchResult = FieldCase & {
  tags: string[];
  rank: number;
};

export type InsertFieldCaseResult = {
  case: FieldCase;
  photoCount: number;
  tagCount: number;
};

// ─── 変換ヘルパ ───────────────────────────────────────────────────────────────

/** 製造年月（YYYY-MM / YYYY年M月 等）を date 用の YYYY-MM-DD へ正規化する。 */
export function normalizeManufacturedOn(value?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  // YYYY-MM-DD はそのまま
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // YYYY-MM または YYYY/MM → 月初
  const ym = trimmed.match(/^(\d{4})[-/](\d{1,2})$/);
  if (ym) return `${ym[1]}-${ym[2].padStart(2, "0")}-01`;
  // YYYY年M月 → 月初
  const jp = trimmed.match(/^(\d{4})\D+(\d{1,2})\D*$/);
  if (jp) return `${jp[1]}-${jp[2].padStart(2, "0")}-01`;
  // YYYY のみ → 1月初
  const y = trimmed.match(/^(\d{4})$/);
  if (y) return `${y[1]}-01-01`;
  return null;
}

/** DB 行（snake_case）→ アプリ型（camelCase）。 */
function rowToFieldCase(row: Record<string, unknown>): FieldCase {
  return {
    id: String(row.id),
    category: String(row.category),
    subcategory: (row.subcategory as string | null) ?? null,
    manufacturer: (row.manufacturer as string | null) ?? null,
    modelNumber: (row.model_number as string | null) ?? null,
    manufacturedOn: (row.manufactured_on as string | null) ?? null,
    symptoms: (row.symptoms as string[] | null) ?? [],
    cause: (row.cause as string | null) ?? null,
    diagnosis: (row.diagnosis as string | null) ?? null,
    recommendedActions: (row.recommended_actions as string[] | null) ?? [],
    emergencyAction: (row.emergency_action as string | null) ?? null,
    aiJudgment: (row.ai_judgment as string | null) ?? null,
    risk: (row.risk as string | null) ?? null,
    source: (row.source as string | null) ?? "AI棟梁",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at ?? row.created_at),
  };
}

// ─── Storage Upload 関数 ─────────────────────────────────────────────────────

export type UploadFieldPhotoArgs = {
  caseId: string;                   // 保存先ディレクトリに使う（未確定なら任意の一時ID）
  file: Blob | ArrayBuffer | Uint8Array;
  fileName: string;                 // 例: 1_label.jpg
  contentType?: string;             // 例: image/jpeg
  photoTag?: string;
  caption?: string;
  sortOrder?: number;
};

/**
 * 画像を field-photos バケットへ保存し、URL 付きの FieldPhotoInput を返す。
 * バケットが public のため公開 URL を、非公開運用に切り替えた場合は署名 URL を返す。
 */
export async function uploadFieldPhoto(
  supabase: SupabaseClient,
  args: UploadFieldPhotoArgs,
): Promise<FieldPhotoInput> {
  const path = `${args.caseId}/${args.fileName}`;
  const { error } = await supabase.storage
    .from(FIELD_PHOTO_BUCKET)
    .upload(path, args.file, {
      contentType: args.contentType ?? "application/octet-stream",
      upsert: true,
    });
  if (error) {
    throw new Error(`画像アップロードに失敗しました（${args.fileName}）: ${error.message}`);
  }

  // 公開 URL を取得。非公開バケットでは createSignedUrl に切り替える。
  const { data: pub } = supabase.storage.from(FIELD_PHOTO_BUCKET).getPublicUrl(path);
  let url = pub?.publicUrl ?? "";
  if (!url) {
    const { data: signed } = await supabase.storage
      .from(FIELD_PHOTO_BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    url = signed?.signedUrl ?? "";
  }

  return {
    storagePath: path,
    url,
    photoTag: args.photoTag,
    caption: args.caption,
    sortOrder: args.sortOrder,
  };
}

/** 複数画像をまとめてアップロードする（sortOrder は配列順で自動採番）。 */
export async function uploadFieldPhotos(
  supabase: SupabaseClient,
  caseId: string,
  items: Array<Omit<UploadFieldPhotoArgs, "caseId" | "sortOrder">>,
): Promise<FieldPhotoInput[]> {
  const results: FieldPhotoInput[] = [];
  for (let i = 0; i < items.length; i++) {
    results.push(
      await uploadFieldPhoto(supabase, { ...items[i], caseId, sortOrder: i }),
    );
  }
  return results;
}

// ─── Supabase Insert 関数 ────────────────────────────────────────────────────

/**
 * 現場データを1件登録する。以下を1トランザクション相当で行う:
 *   1. field_cases に本体を Insert
 *   2. attach_tags RPC でタグを別テーブルに正規化登録
 *   3. field_case_photos に画像 URL を紐付け
 *   4. decision_logs に登録内容を出力（監査証跡）
 *
 * 失敗時は例外を投げる。呼び出し側（API Route）でハンドリングすること。
 */
export async function insertFieldCase(
  supabase: SupabaseClient,
  input: FieldCaseInput,
): Promise<InsertFieldCaseResult> {
  // 1. 本体 Insert -----------------------------------------------------------
  const { data: caseRow, error: caseErr } = await supabase
    .from("field_cases")
    .insert({
      category: input.category,
      subcategory: input.subcategory ?? null,
      manufacturer: input.manufacturer ?? null,
      model_number: input.modelNumber ?? null,
      manufactured_on: normalizeManufacturedOn(input.manufacturedOn),
      symptoms: input.symptoms ?? [],
      cause: input.cause ?? null,
      diagnosis: input.diagnosis ?? null,
      recommended_actions: input.recommendedActions ?? [],
      emergency_action: input.emergencyAction ?? null,
      ai_judgment: input.aiJudgment ?? null,
      risk: input.risk ?? null,
      source: input.source ?? "AI棟梁",
    })
    .select()
    .single();

  if (caseErr || !caseRow) {
    throw new Error(`現場データの登録に失敗しました: ${caseErr?.message ?? "unknown"}`);
  }
  const fieldCase = rowToFieldCase(caseRow);

  // 2. タグを別テーブルへ正規化登録 ------------------------------------------
  const tags = (input.tags ?? []).map((t) => t.trim()).filter(Boolean);
  if (tags.length > 0) {
    const { error: tagErr } = await supabase.rpc("attach_tags", {
      p_case_id: fieldCase.id,
      p_tags: tags,
    });
    if (tagErr) {
      throw new Error(`タグの登録に失敗しました: ${tagErr.message}`);
    }
  }

  // 3. 画像 URL を紐付け ------------------------------------------------------
  const photos = input.photos ?? [];
  if (photos.length > 0) {
    const { error: photoErr } = await supabase.from("field_case_photos").insert(
      photos.map((p, i) => ({
        case_id: fieldCase.id,
        storage_path: p.storagePath,
        url: p.url,
        photo_tag: p.photoTag ?? null,
        caption: p.caption ?? null,
        sort_order: p.sortOrder ?? i,
      })),
    );
    if (photoErr) {
      throw new Error(`画像の紐付けに失敗しました: ${photoErr.message}`);
    }
  }

  // 4. Decision Log へ出力 ----------------------------------------------------
  await writeDecisionLog(supabase, {
    caseId: fieldCase.id,
    action: "field_case_registered",
    summary: `[${fieldCase.category}/${fieldCase.subcategory ?? "-"}] ${
      fieldCase.modelNumber ?? "型式不明"
    } を登録`,
    detail: {
      case: fieldCase,
      tags,
      photos: photos.map((p) => ({ photoTag: p.photoTag, url: p.url })),
      aiJudgment: fieldCase.aiJudgment,
      risk: fieldCase.risk,
    },
  });

  return { case: fieldCase, photoCount: photos.length, tagCount: tags.length };
}

// ─── Decision Log 出力 ───────────────────────────────────────────────────────

export type DecisionLogInput = {
  caseId?: string;
  action: string;
  summary: string;
  detail?: Record<string, unknown>;
  actor?: string;
};

/** decision_logs に1件書き込む。 */
export async function writeDecisionLog(
  supabase: SupabaseClient,
  input: DecisionLogInput,
): Promise<void> {
  const { error } = await supabase.from("decision_logs").insert({
    case_id: input.caseId ?? null,
    action: input.action,
    actor: input.actor ?? "AI棟梁",
    summary: input.summary,
    detail: input.detail ?? {},
  });
  if (error) {
    // Decision Log は監査用途のため、失敗しても本処理は止めず警告に留める。
    console.error("[decision_logs] 書き込み失敗:", error.message);
  }
}

// ─── Search 関数（RPC ラッパ）────────────────────────────────────────────────

export type SearchFieldCasesArgs = {
  query: string;
  category?: string;
  subcategory?: string;
  limit?: number;
  offset?: number;
};

/** search_field_cases RPC を呼び出し、camelCase の結果に変換して返す。 */
export async function searchFieldCases(
  supabase: SupabaseClient,
  args: SearchFieldCasesArgs,
): Promise<FieldCaseSearchResult[]> {
  const { data, error } = await supabase.rpc("search_field_cases", {
    p_query: args.query ?? "",
    p_category: args.category ?? null,
    p_subcategory: args.subcategory ?? null,
    p_limit: args.limit ?? 20,
    p_offset: args.offset ?? 0,
  });
  if (error) {
    throw new Error(`検索に失敗しました: ${error.message}`);
  }
  return ((data as Record<string, unknown>[]) ?? []).map((row) => ({
    ...rowToFieldCase(row),
    tags: (row.tags as string[] | null) ?? [],
    rank: typeof row.rank === "number" ? row.rank : Number(row.rank ?? 0),
  }));
}
