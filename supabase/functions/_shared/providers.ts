// ============================================================
// プロバイダ・アダプタ
// OpenAI / Claude / Gemini の呼び出しを共通形 AiResult に正規化する。
// 並列送信の実体はここ（各 call* を Promise.allSettled でまとめる）。
// ============================================================

export type Provider = "openai" | "claude" | "gemini";

export interface AiResult {
  provider: Provider;
  model: string;
  status: "ok" | "error" | "timeout";
  answer: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  error?: string;
}

const TIMEOUT_MS = 60_000;

const MODELS: Record<Provider, string> = {
  openai: Deno.env.get("OPENAI_MODEL") ?? "gpt-4o",
  claude: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-opus-4-8",
  gemini: Deno.env.get("GEMINI_MODEL") ?? "gemini-2.0-flash",
};

// 共通のユーザープロンプト組み立て
function buildPrompt(question: string, context: string): string {
  return context
    ? `# 前提・コンテキスト\n${context}\n\n# 質問\n${question}`
    : question;
}

// タイムアウト付き fetch
function timedFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

function errResult(
  provider: Provider,
  started: number,
  e: unknown,
): AiResult {
  const isTimeout = e instanceof DOMException && e.name === "TimeoutError";
  return {
    provider,
    model: MODELS[provider],
    status: isTimeout ? "timeout" : "error",
    answer: "",
    latencyMs: Date.now() - started,
    error: isTimeout ? "60秒でタイムアウトしました" : String((e as Error)?.message ?? e),
  };
}

// ── OpenAI (Chat Completions) ─────────────────────────────────
export async function callOpenAI(question: string, context: string): Promise<AiResult> {
  const started = Date.now();
  try {
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) throw new Error("OPENAI_API_KEY 未設定");
    const res = await timedFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODELS.openai,
        messages: [{ role: "user", content: buildPrompt(question, context) }],
        temperature: 0.3,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const d = await res.json();
    return {
      provider: "openai",
      model: MODELS.openai,
      status: "ok",
      answer: d?.choices?.[0]?.message?.content ?? "",
      latencyMs: Date.now() - started,
      promptTokens: d?.usage?.prompt_tokens,
      completionTokens: d?.usage?.completion_tokens,
    };
  } catch (e) {
    return errResult("openai", started, e);
  }
}

// ── Claude (Messages) ─────────────────────────────────────────
export async function callClaude(question: string, context: string): Promise<AiResult> {
  const started = Date.now();
  try {
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) throw new Error("ANTHROPIC_API_KEY 未設定");
    const res = await timedFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODELS.claude,
        max_tokens: 4096,
        messages: [{ role: "user", content: buildPrompt(question, context) }],
      }),
    });
    if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const d = await res.json();
    const answer = Array.isArray(d?.content)
      ? d.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n")
      : "";
    return {
      provider: "claude",
      model: MODELS.claude,
      status: "ok",
      answer,
      latencyMs: Date.now() - started,
      promptTokens: d?.usage?.input_tokens,
      completionTokens: d?.usage?.output_tokens,
    };
  } catch (e) {
    return errResult("claude", started, e);
  }
}

// ── Gemini (generateContent) ──────────────────────────────────
export async function callGemini(question: string, context: string): Promise<AiResult> {
  const started = Date.now();
  try {
    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) throw new Error("GEMINI_API_KEY 未設定");
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.gemini}:generateContent?key=${key}`;
    const res = await timedFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(question, context) }] }],
        generationConfig: { temperature: 0.3 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const d = await res.json();
    const answer = d?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    return {
      provider: "gemini",
      model: MODELS.gemini,
      status: "ok",
      answer,
      latencyMs: Date.now() - started,
      promptTokens: d?.usageMetadata?.promptTokenCount,
      completionTokens: d?.usageMetadata?.candidatesTokenCount,
    };
  } catch (e) {
    return errResult("gemini", started, e);
  }
}

// ── 3AIへ並列送信 ─────────────────────────────────────────────
export async function askAllProviders(question: string, context: string): Promise<AiResult[]> {
  const settled = await Promise.allSettled([
    callOpenAI(question, context),
    callClaude(question, context),
    callGemini(question, context),
  ]);
  const fallbackProviders: Provider[] = ["openai", "claude", "gemini"];
  return settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : errResult(fallbackProviders[i], Date.now(), s.reason),
  );
}
