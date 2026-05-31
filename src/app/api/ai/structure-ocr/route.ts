import { NextRequest, NextResponse } from "next/server";
import {
  structureOcrText,
  defaultAiCandidates,
  safeMergeCandidates,
  type AiCandidates,
} from "@/app/utils/aiStructuring";

// ─── OpenAI へ渡すシステムプロンプト ─────────────────────────────
const SYSTEM_PROMPT = `あなたは建設業・内装工事の書類（発注書・注文書・見積書・請求書）のOCR文字を構造化するアシスタントです。
入力されたOCR文字列から情報を抽出し、必ず以下のJSONのみで回答してください。JSON以外の文字を含めないこと。

{
  "documentType": "発注書・注文書" | "見積書" | "請求書" | "領収書" | "",
  "clientNameCandidates":                  [{"value": "...", "reason": "...", "confidence": "high"|"medium"|"low"}],
  "recipientNameCandidates":               [{"value": "...", "reason": "...", "confidence": "high"|"medium"|"low"}],
  "customerNameCandidates":                [{"value": "...", "reason": "...", "confidence": "high"|"medium"|"low"}],
  "siteAddressCandidates":                 [{"value": "...", "reason": "...", "confidence": "high"|"medium"|"low"}],
  "orderDateCandidates":                   [{"value": "YYYY/MM/DD", "raw": "...", "reason": "...", "confidence": "high"|"medium"|"low"}],
  "buildScheduleDateCandidates":           [{"value": "YYYY/MM/DD", "raw": "...", "reason": "...", "confidence": "high"|"medium"|"low"}],
  "workPeriodCandidates":                  [{"value": "YYYY/MM/DD", "raw": "...", "reason": "...", "confidence": "high"|"medium"|"low"}],
  "orderNumberCandidates":                 [{"value": "...", "reason": "...", "confidence": "high"|"medium"|"low"}],
  "amountCandidates":                      [{"value": "1,234,567", "normalizedValue": "1234567", "reason": "...", "confidence": "high"|"medium"|"low"}],
  "invoiceRegistrationNumberCandidates":   [{"value": "T0000000000000", "reason": "...", "confidence": "high"|"medium"|"low"}],
  "workDescriptionCandidates":             [{"value": "...", "reason": "...", "confidence": "high"|"medium"|"low"}],
  "paymentTermCandidates":                 [{"value": "...", "reason": "...", "confidence": "high"|"medium"|"low"}],
  "warningMessages": ["..."]
}

重要なルール:
- amountCandidates には電話番号・郵便番号・インボイス登録番号（T+10桁以上の数字）を絶対に含めない
- amountCandidates.value はカンマ区切り（例: 1,234,567）、normalizedValue は数字のみ（例: 1234567）
- 日付の value は必ず YYYY/MM/DD 形式
- siteAddressCandidates は都道府県を含む住所のみ対象
- 各配列は最大6件、confidence 降順（high → medium → low）
- 候補が複数ある場合は warningMessages に確認メッセージを追加
- 情報が見当たらない項目は空配列 [] を返す`;

// ─── ローカルフォールバック ────────────────────────────────────
function localFallback(text: string, extraWarning?: string) {
  const local = structureOcrText(text);
  const warnings = [...(local.warnings ?? [])];
  if (extraWarning) warnings.push(extraWarning);
  return {
    ok: true as const,
    ...local,
    candidates: safeMergeCandidates(local.candidates),
    warnings,
  };
}

// ─── Route Handler ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model  = process.env.OPENAI_AI_STRUCTURE_MODEL ?? "gpt-4o-mini";

  // ── リクエストボディを読み込む ──────────────────────────────
  let text = "";
  try {
    const body = await req.json();
    if (typeof body?.text === "string") text = body.text;
  } catch {
    // JSON パース失敗は空テキスト扱い
  }

  if (!text.trim()) {
    return NextResponse.json({
      ok: false,
      error: "テキストが空です",
      candidates: defaultAiCandidates,
      warnings: ["テキストが空のため整理できませんでした。"],
    });
  }

  // ── APIキー未設定 → ローカルで処理 ────────────────────────
  if (!apiKey) {
    console.warn("[structure-ocr] OPENAI_API_KEY が未設定。ローカル候補抽出を使用します。");
    return NextResponse.json(localFallback(text));
  }

  // ── OpenAI Chat Completions 呼び出し ───────────────────────
  try {
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `以下のOCR文字を構造化してください:\n\n${text.slice(0, 6000)}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text().catch(() => "");
      console.error("[structure-ocr] OpenAI API エラー:", openaiRes.status, errBody.slice(0, 300));
      return NextResponse.json(
        localFallback(text, "AI整理APIにエラーが発生したため、ローカル候補抽出を使用しました。")
      );
    }

    const openaiData = await openaiRes.json();
    const content: string = openaiData?.choices?.[0]?.message?.content ?? "";

    // ── JSON パース ─────────────────────────────────────────
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("[structure-ocr] JSON パース失敗:", content.slice(0, 200));
      return NextResponse.json(
        localFallback(text, "AI整理の返答が不正な形式のため、ローカル候補抽出を使用しました。")
      );
    }

    // ── ローカル結果とマージ（単一値の補完にローカル結果を利用）
    const local = structureOcrText(text);
    const aiCandidates = safeMergeCandidates(parsed as Partial<AiCandidates>);
    const aiWarnings = Array.isArray(parsed.warningMessages)
      ? (parsed.warningMessages as string[])
      : local.warnings ?? [];

    return NextResponse.json({
      ok: true,
      ...local,
      documentType:
        typeof parsed.documentType === "string" && parsed.documentType
          ? parsed.documentType
          : local.documentType,
      candidates: aiCandidates,
      warnings: aiWarnings,
    });
  } catch (err) {
    console.error("[structure-ocr] 予期しないエラー:", err);
    return NextResponse.json(
      localFallback(text, "AI整理に失敗したため、ローカル候補抽出を使用しました。"),
      { status: 200 } // クライアントはフォールバックデータを受け取る
    );
  }
}
