// 現場事例の AI 解析処理（サーバ側）
//   写真（base64）＋テキストから、確定前の構造化データ（confidence 付き）を生成する。
//   OpenAI が利用可能なら Vision で解析、未設定/失敗時はローカルのキーワード抽出で代替。
//
// 重要: ここで返す値は「AI生成値（非確定）」。確定は代表者の承認による。

import type { FieldCaseValues, FieldConfidence } from "./fieldCaseWorkflow";
import type { DiagnosisStatus } from "./fieldCases";

export type AnalyzeInput = {
  text?: string;               // 現場メモ・短文
  title?: string;              // 任意の案件名
  images?: { base64: string; mimeType?: string }[];
  inputKinds?: string[];       // photo / video / audio / text
};

export type AnalyzeOutput = {
  values: FieldCaseValues;
  confidence: FieldConfidence;
  additionalChecks: string[];  // 情報不足時の確認事項（最大3件）
  usedAi: boolean;
  warnings: string[];
};

const SYSTEM_PROMPT = `あなたは住宅設備の修理診断に精通した「AI棟梁」です。
現場の写真と短いメモから、設備トラブル事例を構造化してください。
必ずJSONのみで回答し、コードブロックや説明文は含めないこと。

原因は必ず「推定原因(suspectedCause)」と「確定原因(confirmedCause)」を分けること。
現地分解診断やメーカー点検が未実施なら confirmedCause は空にし、diagnosisStatus は "suspected" とする。
diagnosisStatus は suspected / confirmed / manufacturer_confirmed / unresolved のいずれか。

各項目に confidence(0.0-1.0) を付けること。情報が写真やメモから読み取れない項目は
値を空にし confidence を 0 とすること。推測で断定しないこと。
情報不足で確認が必要な点は additionalChecks に最大3件まで記載すること。

返すJSON:
{
  "title": "案件名",
  "category": "工種(例: 設備工事)",
  "subcategory": "設備種別(例: 給湯器)",
  "manufacturer": "メーカー",
  "modelNumber": "型式",
  "manufacturedOn": "製造年月 YYYY-MM",
  "symptoms": ["症状"],
  "errorCodes": ["エラーコード"],
  "suspectedCause": "推定原因",
  "confirmedCause": "確定原因(未確定なら空)",
  "diagnosisStatus": "suspected",
  "diagnosis": "診断サマリ",
  "recommendedActions": ["推奨対応"],
  "alternativeActions": ["代替対応"],
  "repairCandidates": ["修理候補"],
  "risk": "リスク",
  "tags": ["タグ"],
  "additionalChecks": ["追加確認事項"],
  "confidence": { "manufacturer": 0.0, "modelNumber": 0.0, "symptoms": 0.0, "suspectedCause": 0.0, "diagnosisStatus": 0.0, "recommendedActions": 0.0, "risk": 0.0 }
}`;

function emptyValues(text?: string, title?: string): FieldCaseValues {
  return {
    title: title ?? "",
    category: "設備工事",
    subcategory: "",
    manufacturer: "",
    modelNumber: "",
    manufacturedOn: "",
    symptoms: text ? [text.slice(0, 120)] : [],
    errorCodes: [],
    suspectedCause: "",
    confirmedCause: "",
    diagnosisStatus: "suspected",
    diagnosis: "",
    recommendedActions: [],
    alternativeActions: [],
    repairCandidates: [],
    additionalChecks: [],
    emergencyAction: "",
    aiJudgment: "",
    risk: "",
    tags: [],
  };
}

// ─── ローカル簡易抽出（APIキー無し/失敗時）────────────────────────────────────
function localExtract(input: AnalyzeInput): AnalyzeOutput {
  const text = input.text ?? "";
  const v = emptyValues(text, input.title);
  const warnings = ["AI未使用のため簡易抽出です。内容を必ず確認してください。"];

  // エラーコード（3〜4桁 or 英字＋数字）
  const errs = Array.from(new Set((text.match(/[0-9]{3,4}|[A-Z]{1,3}[0-9]{1,3}/g) ?? [])));
  if (errs.length) v.errorCodes = errs;

  // メーカー候補
  const makers = ["ノーリツ", "リンナイ", "パロマ", "パーパス", "TOTO", "LIXIL", "ダイキン", "三菱", "パナソニック"];
  const maker = makers.find((m) => text.includes(m));
  if (maker) v.manufacturer = maker;

  // 型式（英数字ハイフン列）
  const model = text.match(/[A-Z]{2,}[-A-Z0-9]{3,}/);
  if (model) v.modelNumber = model[0];

  // 製造年月
  const ym = text.match(/(20\d{2})[年/\-\.](\d{1,2})月?/);
  if (ym) v.manufacturedOn = `${ym[1]}-${ym[2].padStart(2, "0")}`;

  // タグは抽出できた語から
  v.tags = [v.subcategory, v.manufacturer, v.modelNumber, ...v.errorCodes]
    .filter((x): x is string => Boolean(x));

  const confidence: FieldConfidence = {
    manufacturer: maker ? 0.5 : 0,
    modelNumber: model ? 0.4 : 0,
    errorCodes: errs.length ? 0.5 : 0,
    symptoms: text ? 0.3 : 0,
    suspectedCause: 0,
    diagnosisStatus: 0.2,
  };
  const additionalChecks = [
    v.manufacturer ? "" : "メーカー名を確認してください",
    v.modelNumber ? "" : "型式ラベルの写真を追加してください",
    v.symptoms.length ? "" : "発生している症状を入力してください",
  ].filter(Boolean).slice(0, 3);

  return { values: v, confidence, additionalChecks, usedAi: false, warnings };
}

// ─── OpenAI Vision 解析 ──────────────────────────────────────────────────────
export async function analyzeFieldCase(input: AnalyzeInput): Promise<AnalyzeOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_AI_STRUCTURE_MODEL ?? "gpt-4o-mini";
  if (!apiKey) return localExtract(input);

  try {
    const content: unknown[] = [];
    for (const img of input.images ?? []) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${img.mimeType ?? "image/jpeg"};base64,${img.base64}`, detail: "high" },
      });
    }
    content.push({
      type: "text",
      text: `現場メモ: ${input.text ?? "(なし)"}\n案件名候補: ${input.title ?? "(なし)"}\nこの現場のトラブルを構造化してください。`,
    });

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 2048,
      }),
      signal: AbortSignal.timeout(55_000),
    });
    if (!res.ok) return { ...localExtract(input), warnings: ["AI解析でエラー。簡易抽出に切替。"] };

    const data = await res.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parseAiResult(parsed, input);
  } catch {
    return { ...localExtract(input), warnings: ["AI解析に失敗。簡易抽出に切替。"] };
  }
}

const asArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
const asStr = (v: unknown): string => (typeof v === "string" ? v : "");

function parseAiResult(p: Record<string, unknown>, input: AnalyzeInput): AnalyzeOutput {
  const status = asStr(p.diagnosisStatus);
  const diagnosisStatus: DiagnosisStatus =
    status === "confirmed" || status === "manufacturer_confirmed" || status === "unresolved"
      ? (status as DiagnosisStatus)
      : "suspected";

  const values: FieldCaseValues = {
    title: asStr(p.title) || input.title || "",
    category: asStr(p.category) || "設備工事",
    subcategory: asStr(p.subcategory),
    manufacturer: asStr(p.manufacturer),
    modelNumber: asStr(p.modelNumber),
    manufacturedOn: asStr(p.manufacturedOn),
    symptoms: asArr(p.symptoms),
    errorCodes: asArr(p.errorCodes),
    suspectedCause: asStr(p.suspectedCause),
    confirmedCause: asStr(p.confirmedCause),
    diagnosisStatus,
    diagnosis: asStr(p.diagnosis),
    recommendedActions: asArr(p.recommendedActions),
    alternativeActions: asArr(p.alternativeActions),
    repairCandidates: asArr(p.repairCandidates),
    additionalChecks: asArr(p.additionalChecks).slice(0, 3),
    emergencyAction: asStr(p.emergencyAction),
    aiJudgment: asStr(p.aiJudgment),
    risk: asStr(p.risk),
    tags: asArr(p.tags),
  };

  const confidence: FieldConfidence = {};
  if (p.confidence && typeof p.confidence === "object") {
    for (const [k, val] of Object.entries(p.confidence as Record<string, unknown>)) {
      if (typeof val === "number") confidence[k] = Math.max(0, Math.min(1, val));
    }
  }
  return { values, confidence, additionalChecks: values.additionalChecks, usedAi: true, warnings: [] };
}
