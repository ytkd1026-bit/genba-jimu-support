-- ============================================================
-- マルチAI並列比較システム スキーマ
-- qa_sessions / ai_responses / comparisons / minutes / decision_log
-- ============================================================

create extension if not exists "pgcrypto";

-- ── セッション（1質問 = 1セッション）───────────────────────────
create table if not exists public.qa_sessions (
  id         uuid primary key default gen_random_uuid(),
  question   text not null,
  context    text default '',
  requester  text default '',
  -- running / synthesizing / partial / done / failed
  status     text not null default 'running',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 各AIの生回答 ──────────────────────────────────────────────
create table if not exists public.ai_responses (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.qa_sessions(id) on delete cascade,
  provider          text not null,          -- openai / claude / gemini
  model             text not null,
  answer            text default '',
  latency_ms        integer,
  prompt_tokens     integer,
  completion_tokens integer,
  status            text not null default 'ok',   -- ok / error / timeout
  error             text,
  created_at        timestamptz not null default now(),
  unique (session_id, provider)
);

-- ── 比較マトリクス ────────────────────────────────────────────
create table if not exists public.comparisons (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null unique references public.qa_sessions(id) on delete cascade,
  axes               jsonb default '[]'::jsonb,   -- [{axis, openai, claude, gemini}]
  consensus          jsonb default '[]'::jsonb,   -- ["合意点", ...]
  divergences        jsonb default '[]'::jsonb,   -- [{point, openai, claude, gemini}]
  recommended_answer text default '',
  confidence         text default 'medium',       -- high / medium / low
  judge_model        text,
  created_at         timestamptz not null default now()
);

-- ── 議事録 ────────────────────────────────────────────────────
create table if not exists public.minutes (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.qa_sessions(id) on delete cascade,
  markdown   text not null,
  summary    text default '',
  created_at timestamptz not null default now()
);

-- ── Decision Log ─────────────────────────────────────────────
create table if not exists public.decision_log (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.qa_sessions(id) on delete cascade,
  title        text not null,
  decision     text not null,
  rationale    text default '',
  alternatives jsonb default '[]'::jsonb,
  owner        text default '',
  status       text not null default 'proposed',  -- proposed / adopted / rejected
  tags         text[] default '{}',
  decided_at   timestamptz not null default now()
);

create index if not exists idx_ai_responses_session on public.ai_responses(session_id);
create index if not exists idx_decision_log_session on public.decision_log(session_id);
create index if not exists idx_decision_log_status  on public.decision_log(status);

-- ── updated_at 自動更新 ──────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_qa_sessions_touch on public.qa_sessions;
create trigger trg_qa_sessions_touch
  before update on public.qa_sessions
  for each row execute function public.touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
-- 書き込みは Edge Function(service_role) のみ。認証ユーザーは読み取りのみ。
alter table public.qa_sessions  enable row level security;
alter table public.ai_responses enable row level security;
alter table public.comparisons  enable row level security;
alter table public.minutes      enable row level security;
alter table public.decision_log enable row level security;

do $$
declare t text;
begin
  foreach t in array array['qa_sessions','ai_responses','comparisons','minutes','decision_log']
  loop
    execute format('drop policy if exists "read_authenticated" on public.%I', t);
    execute format(
      'create policy "read_authenticated" on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;
-- service_role は RLS をバイパスするため書き込みポリシーは不要。
