// 現場データ登録 API
//   POST /api/field-cases/register
//
// 受け取った現場データを Supabase へ登録する。処理の流れ:
//   1. （画像があれば）base64 を field-photos バケットへアップロードして URL を得る
//   2. field_cases へ Insert・タグを別テーブルへ正規化登録・画像 URL を紐付け
//   3. decision_logs へ登録内容を出力
//
// 書き込みは service_role が必要なため、サーバ側の admin クライアントを使う。
//
// リクエスト例:
// {
//   "category": "設備工事",
//   "subcategory": "給湯器",
//   "manufacturer": "ノーリツ",
//   "modelNumber": "GT-1634SAWS-TB",
//   "manufacturedOn": "2010-05",
//   "symptoms": ["浴槽自動湯はり不良", "エラー651", ...],
//   "cause": "経年劣化",
//   "diagnosis": "水量サーボ不良",
//   "recommendedActions": ["給湯器本体交換", ...],
//   "emergencyAction": "電装基板交換",
//   "aiJudgment": "修理より本体交換推奨",
//   "risk": "16年経過機のため他部品故障リスク大",
//   "tags": ["給湯器", "ノーリツ", ...],
//   "photos": [
//     { "fileName": "1_label.jpg", "contentType": "image/jpeg",
//       "base64": "...", "photoTag": "給湯器型式ラベル" }
//   ]
// }

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseClient";
import {
  insertFieldCase,
  uploadFieldPhoto,
  type FieldCaseInput,
  type FieldPhotoInput,
  type DiagnosisStatus,
} from "@/app/utils/fieldCases";

export const dynamic = "force-dynamic";

function isDiagnosisStatus(v: unknown): v is DiagnosisStatus {
  return (
    v === "suspected" ||
    v === "confirmed" ||
    v === "manufacturer_confirmed" ||
    v === "unresolved"
  );
}

type PhotoPayload = {
  fileName?: string;
  contentType?: string;
  base64?: string;      // data URL でも純 base64 でも可（無い場合はメタデータ先行登録）
  photoTag?: string;
  caption?: string;
};

function base64ToBytes(base64: string): { bytes: Uint8Array; contentType?: string } {
  let data = base64;
  let contentType: string | undefined;
  const m = base64.match(/^data:([^;]+);base64,([\s\S]*)$/);
  if (m) {
    contentType = m[1];
    data = m[2];
  }
  return { bytes: Uint8Array.from(Buffer.from(data, "base64")), contentType };
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "リクエストの解析に失敗しました" },
      { status: 400 },
    );
  }

  // 必須チェック（最小限）
  if (typeof body.category !== "string" || !body.category.trim()) {
    return NextResponse.json(
      { ok: false, error: "category は必須です" },
      { status: 400 },
    );
  }

  const asStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  const input: FieldCaseInput = {
    category: String(body.category),
    subcategory: typeof body.subcategory === "string" ? body.subcategory : undefined,
    manufacturer: typeof body.manufacturer === "string" ? body.manufacturer : undefined,
    modelNumber: typeof body.modelNumber === "string" ? body.modelNumber : undefined,
    manufacturedOn: typeof body.manufacturedOn === "string" ? body.manufacturedOn : undefined,
    symptoms: asStringArray(body.symptoms),
    cause: typeof body.cause === "string" ? body.cause : undefined,
    suspectedCause: typeof body.suspectedCause === "string" ? body.suspectedCause : undefined,
    confirmedCause: typeof body.confirmedCause === "string" ? body.confirmedCause : undefined,
    diagnosisStatus: isDiagnosisStatus(body.diagnosisStatus) ? body.diagnosisStatus : undefined,
    diagnosis: typeof body.diagnosis === "string" ? body.diagnosis : undefined,
    recommendedActions: asStringArray(body.recommendedActions),
    repairCandidates: asStringArray(body.repairCandidates),
    emergencyAction: typeof body.emergencyAction === "string" ? body.emergencyAction : undefined,
    aiJudgment: typeof body.aiJudgment === "string" ? body.aiJudgment : undefined,
    risk: typeof body.risk === "string" ? body.risk : undefined,
    tags: asStringArray(body.tags),
    source: typeof body.source === "string" ? body.source : undefined,
  };

  try {
    const supabase = getSupabaseAdminClient();

    // 1. 画像を先にアップロード（case_id は画像の格納ディレクトリに使うため一時IDを採番）
    const photoPayloads = Array.isArray(body.photos)
      ? (body.photos as PhotoPayload[])
      : [];
    const uploaded: FieldPhotoInput[] = [];
    if (photoPayloads.length > 0) {
      const tempId = crypto.randomUUID();
      for (let i = 0; i < photoPayloads.length; i++) {
        const p = photoPayloads[i];
        const fileName = p?.fileName ?? `${i + 1}.jpg`;
        if (p?.base64) {
          // 実ファイルあり → Storage へアップロードして URL 付きで登録
          const { bytes, contentType } = base64ToBytes(p.base64);
          uploaded.push(
            await uploadFieldPhoto(supabase, {
              caseId: tempId,
              file: bytes,
              fileName,
              contentType: p.contentType ?? contentType,
              photoTag: p.photoTag,
              caption: p.caption,
              sortOrder: i,
            }),
          );
        } else {
          // 実ファイルなし → メタデータのみ先行登録（pending_upload）
          uploaded.push({
            storagePath: `${tempId}/${fileName}`,
            url: null,
            photoTag: p?.photoTag,
            caption: p?.caption,
            sortOrder: i,
            photoStatus: "pending_upload",
          });
        }
      }
    }
    input.photos = uploaded;

    // 2. Insert（タグ正規化・画像紐付け・Decision Log 出力を含む）
    const result = await insertFieldCase(supabase, input);

    return NextResponse.json({
      ok: true,
      caseId: result.case.id,
      photoCount: result.photoCount,
      tagCount: result.tagCount,
      case: result.case,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "登録に失敗しました";
    console.error("[field-cases/register]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
