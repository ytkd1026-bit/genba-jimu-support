// ============================================================
// 比較・議事録・決定案の生成（Judge）
// Claude を judge に採用し、3回答から
//   ① 比較マトリクス ② 議事録(Markdown) ③ Decision Log 案
// を 1回の構造化出力(JSON) で取得する。
// ============================================================

import type { AiResult } from "./providers.ts";

export interface Synthesis {
  comparison: {
    axes: { axis: string; openai: string; claude: string; gemini: string }[];
    consensus: string[];
    divergences: { point: string; openai: string; claude: string; gemini: string }[];
    recommendedAnswer: string;
    confidence: "high" | "medium" | "low";
  };
  minutesMarkdown: string;
  minutesSummary: string;
  decision: {
    title: string;
    decision: string;
    rationale: string;
    alternatives: string[];
    owner: string;
    tags: string[];
  };
}

const JUDGE_SYSTEM = `あなたは複数AIの回答を統合する熟練ファシリテータです。
OpenAI・Claude・Gemini 3者の回答を突き合わせ、比較・議事録・意思決定案を作成します。
出力は必ず有効なJSONのみ。コードブロック記号や説明文は一切含めないこと。`;

function judgeUserPrompt(question: string, context: string, results: AiResult[]): string {
  const block = (p: string) => {
    const r = results.find((x) => x.provider === p);
    if (!r || r.status !== "ok") return `【${p}】(回答なし: ${r?.error ?? "未取得"})`;
    return `【${p} / ${r.model}】\n${r.answer}`;
  };
  return `# 質問\n${question}\n\n${context ? `# コンテキスト\n${context}\n\n` : ""}# 各AIの回答\n${
    block("openai")
  }\n\n${block("claude")}\n\n${block("gemini")}\n\n` +
    `# 依頼\n上記を分析し、次のスキーマのJSONを返してください:\n` +
    `{
  "comparison": {
    "axes": [{"axis":"評価軸(例:正確性/具体性/リスク言及)","openai":"要約","claude":"要約","gemini":"要約"}],
    "consensus": ["3者が合意している点"],
    "divergences": [{"point":"相違点","openai":"立場","claude":"立場","gemini":"立場"}],
    "recommendedAnswer": "3者を統合した推奨回答",
    "confidence": "high|medium|low"
  },
  "minutesMarkdown": "## 議事録\\n- 日時/議題/出席(AI)/論点/結論 を含むMarkdown",
  "minutesSummary": "議事録の1〜2文要約",
  "decision": {
    "title": "決定の見出し",
    "decision": "採用する結論",
    "rationale": "根拠",
    "alternatives": ["採用しなかった代替案"],
    "owner": "担当(不明なら空)",
    "tags": ["分類タグ"]
  }
}`;
}

function stripFence(s: string): string {
  return s.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
}

export async function synthesize(
  question: string,
  context: string,
  results: AiResult[],
): Promise<{ synthesis: Synthesis; judgeModel: string }> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY 未設定（judge実行不可）");
  const judgeModel = Deno.env.get("JUDGE_MODEL") ?? "claude-opus-4-8";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: judgeModel,
      max_tokens: 4096,
      system: JUDGE_SYSTEM,
      messages: [{ role: "user", content: judgeUserPrompt(question, context, results) }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Judge ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const d = await res.json();
  const raw = Array.isArray(d?.content)
    ? d.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("")
    : "";
  const synthesis = JSON.parse(stripFence(raw)) as Synthesis;
  return { synthesis, judgeModel };
}
