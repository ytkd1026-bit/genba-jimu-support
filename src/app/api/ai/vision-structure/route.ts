import { NextRequest, NextResponse } from "next/server";
import {
  structureOcrText,
  defaultAiCandidates,
  safeMergeCandidates,
  type AiCandidates,
} from "@/app/utils/aiStructuring";

// ─── Vision 用システムプロンプト ──────────────────────────────────
const VISION_SYSTEM_PROMPT = `あなたは建設業・内装工事の書類（発注書・注文書・見積書・請求書）の帳票画像を解析する専門家です。

添付された画像を精密に解析し、帳票内の情報を抽出してください。
必ずJSON形式のみで回答し、JSON以外の文字・説明・コードブロック記号（\`\`\`）は含めないこと。

【金額の抽出ルール】
- 表形式の帳票では、行見出し（税抜発注金額・税込発注金額・発注金額・請求金額・合計金額・受注金額・請負金額）と同じ行または隣接セルの数値を正確に読み取る
- 通貨記号（¥・￥）または「円」が付いた数値を優先
- カンマ区切りの数値（例：233,996）を正確に読み取る
- 電話番号（0X-XXXX-XXXX形式）・郵便番号（XXX-XXXX形式）・インボイス登録番号（Tの後に13桁以上の数字）は金額として扱わない
- 10桁以上の純粋な数字列は金額として扱わない

【住所の抽出ルール】
- 「現場所在地」「現場」「工事場所」「施工場所」「所在地」ラベルに対応する住所を高優先で抽出
- 都道府県を含む住所のみを対象とする

【日付の抽出ルール】
- 元号（令和・平成等）も西暦 YYYY/MM/DD 形式に変換する
- 「発注日」「注文日」→ orderDateCandidates
- 「施工予定日」「建方予定日」「着工日」→ buildScheduleDateCandidates
- 「工期」「工期間」→ workPeriodCandidates

返すJSON（全フィールド必須・候補なし＝空配列）:
{
  "documentType": "発注書・注文書" | "見積書" | "請求書" | "領収書" | "",
  "clientNameCandidates":                [{"value":"...","reason":"...","confidence":"high"|"medium"|"low"}],
  "recipientNameCandidates":             [{"value":"...","reason":"...","confidence":"high"|"medium"|"low"}],
  "customerNameCandidates":              [{"value":"...","reason":"...","confidence":"high"|"medium"|"low"}],
  "siteAddressCandidates":               [{"value":"...","reason":"...","confidence":"high"|"medium"|"low"}],
  "orderDateCandidates":                 [{"value":"YYYY/MM/DD","raw":"...","reason":"...","confidence":"high"|"medium"|"low"}],
  "buildScheduleDateCandidates":         [{"value":"YYYY/MM/DD","raw":"...","reason":"...","confidence":"high"|"medium"|"low"}],
  "workPeriodCandidates":                [{"value":"YYYY/MM/DD","raw":"...","reason":"...","confidence":"high"|"medium"|"low"}],
  "orderNumberCandidates":               [{"value":"...","reason":"...","confidence":"high"|"medium"|"low"}],
  "amountCandidates":                    [{"value":"233,996","normalizedValue":"233996","reason":"...","confidence":"high"|"medium"|"low"}],
  "invoiceRegistrationNumberCandidates": [{"value":"T0000000000000","reason":"...","confidence":"high"|"medium"|"low"}],
  "workDescriptionCandidates":           [{"value":"...","reason":"...","confidence":"high"|"medium"|"low"}],
  "paymentTermCandidates":               [{"value":"...","reason":"...","confidence":"high"|"medium"|"low"}],
  "warningMessages": ["注意メッセージ"]
}

ルール:
- amountCandidates.value はカンマ区切り（例：233,996）、normalizedValue は数字のみ（例：233996）
- 各配列は最大6件・confidence 降順
- 不明な項目は空配列 []`;

// ─── ローカルフォールバック ────────────────────────────────────
function localFallback(ocrText: string, extraWarning: string) {
  const local = ocrText ? structureOcrText(ocrText) : {
    documentType: "", clientName: "", recipientName: "", orderDate: "",
    buildScheduleDate: "", orderNumber: "", customerName: "", projectName: "",
    siteAddress: "", workDescription: "", workPeriod: "", orderAmount: "",
    paymentTerm: "", invoiceRegistrationNumber: "", lineItems: [],
    candidates: defaultAiCandidates, warnings: [], rawOcrText: "", normalizedText: "",
  };
  return {
    ok: true as const,
    ...local,
    candidates: safeMergeCandidates(local.candidates),
    warnings: [...(local.warnings ?? []), extraWarning],
  };
}

// ─── Route Handler ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model  = process.env.OPENAI_AI_STRUCTURE_MODEL ?? "gpt-4o-mini";

  // ── リクエストボディ ─────────────────────────────────────────
  let imageBase64 = "";
  let mimeType    = "image/jpeg";
  let ocrText     = "";

  try {
    const body = await req.json();
    if (typeof body?.imageBase64 === "string") imageBase64 = body.imageBase64;
    if (typeof body?.mimeType    === "string") mimeType    = body.mimeType;
    if (typeof body?.ocrText     === "string") ocrText     = body.ocrText;
  } catch {
    return NextResponse.json({
      ok: false,
      error: "リクエストの解析に失敗しました",
      candidates: defaultAiCandidates,
      warnings: ["リクエストの解析に失敗しました。"],
    }, { status: 400 });
  }

  if (!imageBase64) {
    return NextResponse.json({
      ok: false,
      error: "画像データがありません",
      candidates: defaultAiCandidates,
      warnings: ["画像データが含まれていませんでした。"],
    });
  }

  // ── APIキー未設定 → OCRテキストでフォールバック ──────────────
  if (!apiKey) {
    console.warn("[vision-structure] OPENAI_API_KEY が未設定。ローカル候補抽出を使用します。");
    return NextResponse.json(
      localFallback(ocrText, "APIキーが未設定のため、ローカル候補抽出を使用しました。")
    );
  }

  // ── OpenAI Vision API 呼び出し ────────────────────────────────
  try {
    const userContent: unknown[] = [
      {
        type: "image_url",
        image_url: {
          url: `data:${mimeType};base64,${imageBase64}`,
          detail: "high",
        },
      },
      {
        type: "text",
        text: ocrText
          ? `この帳票画像から情報を抽出してください。\n\n参考：OCR文字（読み誤りの可能性あり）\n${ocrText.slice(0, 2000)}`
          : "この帳票画像から情報を抽出してください。",
      },
    ];

    const visionRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: VISION_SYSTEM_PROMPT },
          { role: "user",   content: userContent },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(55_000),
    });

    if (!visionRes.ok) {
      const errBody = await visionRes.text().catch(() => "");
      console.error("[vision-structure] OpenAI Vision エラー:", visionRes.status, errBody.slice(0, 300));
      return NextResponse.json(
        localFallback(ocrText, "画像AI整理でAPIエラーが発生したため、OCRテキスト候補抽出を使用しました。")
      );
    }

    const visionData = await visionRes.json();
    const content: string = visionData?.choices?.[0]?.message?.content ?? "";

    // ── JSON パース ─────────────────────────────────────────────
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("[vision-structure] JSON パース失敗:", content.slice(0, 200));
      return NextResponse.json(
        localFallback(ocrText, "画像AI整理の返答が不正な形式のため、OCRテキスト候補抽出を使用しました。")
      );
    }

    // ── ローカル結果とマージ（単一値をローカルで補完）────────────
    const local = ocrText ? structureOcrText(ocrText) : null;
    const aiCandidates = safeMergeCandidates(parsed as Partial<AiCandidates>);
    const aiWarnings = Array.isArray(parsed.warningMessages)
      ? (parsed.warningMessages as string[])
      : [];

    return NextResponse.json({
      ok: true,
      ...(local ?? {}),
      documentType:
        typeof parsed.documentType === "string" && parsed.documentType
          ? parsed.documentType
          : local?.documentType ?? "",
      candidates: aiCandidates,
      warnings: aiWarnings,
    });
  } catch (err) {
    console.error("[vision-structure] 予期しないエラー:", err);
    return NextResponse.json(
      localFallback(ocrText, "画像AI整理に失敗したため、OCRテキスト候補抽出を使用しました。")
    );
  }
}
