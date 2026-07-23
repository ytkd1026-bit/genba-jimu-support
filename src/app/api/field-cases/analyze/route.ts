// 現場事例 AI解析 API
//   POST /api/field-cases/analyze
//
// スマホから投入された写真(base64)・テキストを受け、AIで構造化（confidence付・非確定）し、
// draft を作成、写真を Storage へ保存して紐付け、caseId を返す。
// 代表者はこの caseId の確認画面（/field-cases/[id]/review）で修正・承認する。

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseClient";
import { uploadFieldPhoto } from "@/app/utils/fieldCases";
import { analyzeFieldCase } from "@/app/utils/fieldCaseAnalysis";
import { saveDraftFieldCase } from "@/app/utils/fieldCaseWorkflow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PhotoPayload = {
  fileName?: string;
  contentType?: string;
  base64?: string;
  photoTag?: string;
  caption?: string;
};

function stripDataUrl(base64: string): { data: string; contentType?: string } {
  const m = base64.match(/^data:([^;]+);base64,([\s\S]*)$/);
  if (m) return { data: m[2], contentType: m[1] };
  return { data: base64 };
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "リクエストの解析に失敗しました" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text : "";
  const title = typeof body.title === "string" ? body.title : "";
  const photos: PhotoPayload[] = Array.isArray(body.photos) ? (body.photos as PhotoPayload[]) : [];
  const inputKinds: string[] = Array.isArray(body.inputKinds)
    ? (body.inputKinds as string[])
    : [text ? "text" : "", photos.length ? "photo" : ""].filter(Boolean);

  try {
    const supabase = getSupabaseAdminClient();

    // 1. AI解析（confidence 付き・非確定）
    const analysis = await analyzeFieldCase({
      text,
      title,
      images: photos
        .filter((p) => p.base64)
        .map((p) => {
          const { data, contentType } = stripDataUrl(p.base64!);
          return { base64: data, mimeType: p.contentType ?? contentType };
        }),
      inputKinds,
    });

    // 2. draft 作成（AI値をそのまま初期値に。ai_raw / ai_confidence を固定）
    const draft = await saveDraftFieldCase(supabase, {
      values: analysis.values,
      aiRaw: analysis.values,
      aiConfidence: analysis.confidence,
      workflowStatus: "draft",
    });

    // 3. 写真を Storage へ保存し draft に紐付け（再読み込みで消えないように解析時に確定）
    let photoCount = 0;
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      const fileName = p.fileName ?? `${i + 1}.jpg`;
      if (p.base64) {
        const { data, contentType } = stripDataUrl(p.base64);
        const bytes = Uint8Array.from(Buffer.from(data, "base64"));
        const uploaded = await uploadFieldPhoto(supabase, {
          caseId: draft.id,
          file: bytes,
          fileName,
          contentType: p.contentType ?? contentType,
          photoTag: p.photoTag,
          caption: p.caption,
          sortOrder: i + 1,
        });
        await supabase.from("field_case_photos").insert({
          case_id: draft.id,
          storage_path: uploaded.storagePath,
          url: uploaded.url ?? null,
          photo_tag: uploaded.photoTag ?? null,
          caption: uploaded.caption ?? null,
          sort_order: i + 1,
          photo_status: "uploaded",
        });
      } else {
        await supabase.from("field_case_photos").insert({
          case_id: draft.id,
          storage_path: `${draft.id}/${fileName}`,
          url: null,
          photo_tag: p.photoTag ?? null,
          caption: p.caption ?? null,
          sort_order: i + 1,
          photo_status: "pending_upload",
        });
      }
      photoCount++;
    }

    // 4. 解析ジョブ記録（done）
    await supabase.from("analysis_jobs").insert({
      case_id: draft.id,
      status: "done",
      input_kinds: inputKinds,
      result: { usedAi: analysis.usedAi, warnings: analysis.warnings },
    });

    return NextResponse.json({
      ok: true,
      caseId: draft.id,
      values: analysis.values,
      confidence: analysis.confidence,
      additionalChecks: analysis.additionalChecks,
      photoCount,
      usedAi: analysis.usedAi,
      warnings: analysis.warnings,
      reviewUrl: `/field-cases/${draft.id}/review`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "解析に失敗しました";
    console.error("[field-cases/analyze]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
