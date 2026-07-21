// ============================================================
// synthesize : 既存セッションの回答から比較・議事録・決定を作り直す
// （judgeモデル差し替え検証や、失敗後の再実行に使うスタンドアロン）
// 入力: { session_id }
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import type { AiResult, Provider } from "../_shared/providers.ts";
import { synthesize } from "../_shared/synthesize.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POSTのみ対応" }, 405);

  const shared = Deno.env.get("EDGE_SHARED_TOKEN");
  if (shared && req.headers.get("x-edge-token") !== shared) {
    return json({ error: "認証エラー" }, 401);
  }

  let sessionId = "";
  try {
    sessionId = String((await req.json())?.session_id ?? "");
  } catch {
    return json({ error: "リクエスト解析失敗" }, 400);
  }
  if (!sessionId) return json({ error: "session_id は必須です" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: session } = await supabase
    .from("qa_sessions").select("*").eq("id", sessionId).single();
  if (!session) return json({ error: "セッションが見つかりません" }, 404);

  const { data: rows } = await supabase
    .from("ai_responses").select("*").eq("session_id", sessionId);
  if (!rows?.length) return json({ error: "回答が見つかりません" }, 404);

  const results: AiResult[] = rows.map((r) => ({
    provider: r.provider as Provider,
    model: r.model,
    status: r.status as AiResult["status"],
    answer: r.answer ?? "",
    latencyMs: r.latency_ms ?? 0,
    error: r.error ?? undefined,
  }));

  try {
    const { synthesis, judgeModel } = await synthesize(session.question, session.context ?? "", results);
    const c = synthesis.comparison;

    // upsert（session_id が unique なので再実行で上書き）
    await supabase.from("comparisons").upsert({
      session_id: sessionId,
      axes: c.axes,
      consensus: c.consensus,
      divergences: c.divergences,
      recommended_answer: c.recommendedAnswer,
      confidence: c.confidence,
      judge_model: judgeModel,
    }, { onConflict: "session_id" });

    await supabase.from("minutes").upsert({
      session_id: sessionId,
      markdown: synthesis.minutesMarkdown,
      summary: synthesis.minutesSummary,
    }, { onConflict: "session_id" });

    const { data: decision } = await supabase.from("decision_log").insert({
      session_id: sessionId,
      title: synthesis.decision.title,
      decision: synthesis.decision.decision,
      rationale: synthesis.decision.rationale,
      alternatives: synthesis.decision.alternatives,
      owner: synthesis.decision.owner,
      tags: synthesis.decision.tags,
      status: "proposed",
    }).select().single();

    return json({ session_id: sessionId, comparison: synthesis.comparison, decision });
  } catch (e) {
    return json({ error: `再合成失敗: ${(e as Error).message}` }, 500);
  }
});
