// ============================================================
// ask-multi-ai : オーケストレータ（システムの入口）
// 質問受付 → 3AI並列送信 → 保存 → 比較/議事録/決定生成 → 保存 → 返却
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { askAllProviders } from "../_shared/providers.ts";
import { synthesize } from "../_shared/synthesize.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POSTのみ対応" }, 405);

  // ── 発信元検証（Make等の外部呼び出し用の共有トークン）──────────
  const shared = Deno.env.get("EDGE_SHARED_TOKEN");
  if (shared && req.headers.get("x-edge-token") !== shared) {
    return json({ error: "認証エラー" }, 401);
  }

  // ── 入力 ─────────────────────────────────────────────────────
  let question = "", context = "", requester = "";
  try {
    const body = await req.json();
    question = String(body?.question ?? "").trim();
    context = String(body?.context ?? "");
    requester = String(body?.requester ?? "");
  } catch {
    return json({ error: "リクエスト解析失敗" }, 400);
  }
  if (!question) return json({ error: "question は必須です" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── セッション作成 ───────────────────────────────────────────
  const { data: session, error: sErr } = await supabase
    .from("qa_sessions")
    .insert({ question, context, requester, status: "running" })
    .select()
    .single();
  if (sErr || !session) return json({ error: `セッション作成失敗: ${sErr?.message}` }, 500);

  try {
    // ── 3AI 並列送信 ───────────────────────────────────────────
    const results = await askAllProviders(question, context);

    await supabase.from("ai_responses").insert(
      results.map((r) => ({
        session_id: session.id,
        provider: r.provider,
        model: r.model,
        answer: r.answer,
        latency_ms: r.latencyMs,
        prompt_tokens: r.promptTokens ?? null,
        completion_tokens: r.completionTokens ?? null,
        status: r.status,
        error: r.error ?? null,
      })),
    );

    const okCount = results.filter((r) => r.status === "ok").length;
    if (okCount === 0) {
      await supabase.from("qa_sessions").update({ status: "failed" }).eq("id", session.id);
      return json({ error: "全AIが失敗しました", session_id: session.id, responses: results }, 502);
    }

    await supabase.from("qa_sessions")
      .update({ status: "synthesizing" })
      .eq("id", session.id);

    // ── 比較・議事録・決定生成（Judge）───────────────────────────
    const { synthesis, judgeModel } = await synthesize(question, context, results);
    const c = synthesis.comparison;

    await supabase.from("comparisons").insert({
      session_id: session.id,
      axes: c.axes,
      consensus: c.consensus,
      divergences: c.divergences,
      recommended_answer: c.recommendedAnswer,
      confidence: c.confidence,
      judge_model: judgeModel,
    });

    await supabase.from("minutes").insert({
      session_id: session.id,
      markdown: synthesis.minutesMarkdown,
      summary: synthesis.minutesSummary,
    });

    const { data: decision } = await supabase.from("decision_log").insert({
      session_id: session.id,
      title: synthesis.decision.title,
      decision: synthesis.decision.decision,
      rationale: synthesis.decision.rationale,
      alternatives: synthesis.decision.alternatives,
      owner: synthesis.decision.owner,
      tags: synthesis.decision.tags,
      status: "proposed",
    }).select().single();

    await supabase.from("qa_sessions")
      .update({ status: okCount < 3 ? "partial" : "done" })
      .eq("id", session.id);

    return json({
      session_id: session.id,
      status: okCount < 3 ? "partial" : "done",
      responses: results,
      comparison: synthesis.comparison,
      minutes: { markdown: synthesis.minutesMarkdown, summary: synthesis.minutesSummary },
      decision,
    });
  } catch (e) {
    await supabase.from("qa_sessions").update({ status: "failed" }).eq("id", session.id);
    return json({ error: `処理失敗: ${(e as Error).message}`, session_id: session.id }, 500);
  }
});
