-- =============================================================================
-- 追加マイグレーション: 登録ワークフロー（解析→draft→承認→確定）
--   非破壊。既存テーブル/列は温存し、列・テーブル・関数を追加するのみ。
--
--   * workflow_status で承認前後を区別（承認前は検索に出さない）
--   * AI生成値は非確定。ai_raw / ai_confidence を保持し、確定値は承認値
--   * 監査: field_case_edits（AI値↔承認値の履歴 / AI精度評価用）と audit_logs
--   * 統計: field_case_stats と洗い替え関数 refresh_field_case_stats()
--   * ジョブ: analysis_jobs（解析）/ field_case_links（類似案件）
-- =============================================================================

-- ── 1. field_cases への列追加 ────────────────────────────────────────────────
alter table public.field_cases
  add column if not exists title             text,
  add column if not exists error_codes       text[] not null default '{}',
  add column if not exists additional_checks text[] not null default '{}',
  add column if not exists alternative_actions text[] not null default '{}',
  add column if not exists workflow_status   text not null default 'draft',
  add column if not exists case_no           text unique,
  add column if not exists approved_at       timestamptz,
  add column if not exists approved_by       text,
  add column if not exists ai_confidence     jsonb not null default '{}',
  add column if not exists ai_raw            jsonb not null default '{}',
  add column if not exists rag_text          text;

-- workflow_status の制約
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'field_cases_workflow_status_chk') then
    alter table public.field_cases
      add constraint field_cases_workflow_status_chk
      check (workflow_status in ('draft','pending_approval','approved','rejected','verified'));
  end if;
end$$;

-- 使用年数（製造年からの経過年数）は時間で変化するため保存せず、読み取り時に計算する
-- （RPC / 統計関数側で age() を用いて算出）。
create index if not exists idx_field_cases_workflow_status
  on public.field_cases (workflow_status);
create index if not exists idx_field_cases_case_no
  on public.field_cases (case_no);

-- ── 2. 監査: AI値↔承認値の修正履歴（AI精度評価用）────────────────────────────
create table if not exists public.field_case_edits (
  id             uuid primary key default gen_random_uuid(),
  case_id        uuid not null references public.field_cases(id) on delete cascade,
  field_name     text not null,          -- 例: suspected_cause / diagnosis_status / tags
  ai_value       text,                   -- AI生成値
  approved_value text,                   -- 代表者修正後の確定値
  ai_confidence  numeric,                -- 当該項目の confidence(0-1)
  edited_by      text,                   -- 修正者
  edit_reason    text,                   -- 修正理由（任意）
  edited_at      timestamptz not null default now()
);
create index if not exists idx_field_case_edits_case_id on public.field_case_edits (case_id);
create index if not exists idx_field_case_edits_field   on public.field_case_edits (field_name);

-- ── 3. システム監査ログ ──────────────────────────────────────────────────────
create table if not exists public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  entity     text not null,              -- 例: field_case
  entity_id  uuid,
  action     text not null,              -- 例: approved / rejected / held / drafted
  actor      text not null default 'AI棟梁',
  detail     jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_logs_entity on public.audit_logs (entity, entity_id);
create index if not exists idx_audit_logs_created on public.audit_logs (created_at desc);

-- ── 4. 解析ジョブ ────────────────────────────────────────────────────────────
create table if not exists public.analysis_jobs (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid references public.field_cases(id) on delete cascade,
  status      text not null default 'queued',   -- queued / running / done / failed
  input_kinds text[] not null default '{}',     -- photo / video / audio / text
  result      jsonb,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'analysis_jobs_status_chk') then
    alter table public.analysis_jobs
      add constraint analysis_jobs_status_chk
      check (status in ('queued','running','done','failed'));
  end if;
end$$;
create index if not exists idx_analysis_jobs_case on public.analysis_jobs (case_id);
create index if not exists idx_analysis_jobs_status on public.analysis_jobs (status);

drop trigger if exists trg_analysis_jobs_updated_at on public.analysis_jobs;
create trigger trg_analysis_jobs_updated_at
  before update on public.analysis_jobs
  for each row execute function public.set_updated_at();

-- ── 5. 類似案件リンク（承認後の非同期で作成）─────────────────────────────────
create table if not exists public.field_case_links (
  case_id         uuid not null references public.field_cases(id) on delete cascade,
  related_case_id uuid not null references public.field_cases(id) on delete cascade,
  score           real not null default 0,
  reason          text,
  created_at      timestamptz not null default now(),
  primary key (case_id, related_case_id),
  check (case_id <> related_case_id)
);
create index if not exists idx_field_case_links_related on public.field_case_links (related_case_id);

-- ── 6. 統計テーブル ──────────────────────────────────────────────────────────
create table if not exists public.field_case_stats (
  dimension  text not null,   -- manufacturer/model/error_code/manufacture_year/service_years/cause/action/recurrence/ai_edit_rate/ai_match_rate
  bucket     text not null,   -- 集計キー（例: 'ノーリツ' / '2010' / 'overall'）
  count      numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (dimension, bucket)
);
create index if not exists idx_field_case_stats_dim on public.field_case_stats (dimension);

-- ── 7. 案件ID発番（FC-YYYY-NNNN）─────────────────────────────────────────────
create sequence if not exists public.field_case_no_seq;

create or replace function public.issue_field_case_no()
returns text
language sql
volatile
as $$
  select 'FC-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.field_case_no_seq')::text, 4, '0');
$$;

-- ── 8. 検索RPCを承認フィルタ付きで再定義 ─────────────────────────────────────
--   既定は approved のみ返す（承認前データの混入防止）。管理用途は
--   p_include_unapproved=true で全ステータス対象。
drop function if exists public.search_field_cases(text, text, text, int, int);

create function public.search_field_cases(
  p_query             text,
  p_category          text default null,
  p_subcategory       text default null,
  p_limit             int  default 20,
  p_offset            int  default 0,
  p_include_unapproved boolean default false
)
returns table (
  id                  uuid,
  case_no             text,
  workflow_status     text,
  title               text,
  category            text,
  subcategory         text,
  manufacturer        text,
  model_number        text,
  manufactured_on     date,
  service_years       int,
  symptoms            text[],
  error_codes         text[],
  cause               text,
  suspected_cause     text,
  confirmed_cause     text,
  diagnosis_status    text,
  diagnosis           text,
  recommended_actions text[],
  alternative_actions text[],
  repair_candidates   text[],
  additional_checks   text[],
  emergency_action    text,
  ai_judgment         text,
  risk                text,
  tags                text[],
  rank                real,
  created_at          timestamptz
)
language sql
stable
as $$
  with q as (
    select coalesce(nullif(btrim(p_query), ''), '') as term
  )
  select
    fc.id, fc.case_no, fc.workflow_status, fc.title, fc.category, fc.subcategory,
    fc.manufacturer, fc.model_number, fc.manufactured_on,
    case when fc.manufactured_on is null then null
         else extract(year from age(fc.manufactured_on))::int end as service_years,
    fc.symptoms, fc.error_codes, fc.cause, fc.suspected_cause, fc.confirmed_cause,
    fc.diagnosis_status, fc.diagnosis, fc.recommended_actions, fc.alternative_actions,
    fc.repair_candidates, fc.additional_checks, fc.emergency_action, fc.ai_judgment, fc.risk,
    coalesce(
      (select array_agg(t.name order by t.name)
         from public.field_case_tags fct
         join public.tags t on t.id = fct.tag_id
        where fct.case_id = fc.id),
      '{}'
    ) as tags,
    case
      when q.term = '' then 0::real
      else greatest(
        word_similarity(q.term, fc.search_body),
        (case when fc.search_body ilike '%' || q.term || '%' then 1.0 else 0 end)::real,
        (case when exists (
            select 1 from public.field_case_tags fct
            join public.tags t on t.id = fct.tag_id
            where fct.case_id = fc.id and t.name ilike '%' || q.term || '%'
          ) then 0.9 else 0 end)::real
      )
    end as rank,
    fc.created_at
  from public.field_cases fc, q
  where
    (p_include_unapproved or fc.workflow_status = 'approved')
    and (p_category    is null or fc.category    = p_category)
    and (p_subcategory is null or fc.subcategory = p_subcategory)
    and (
      q.term = ''
      or fc.search_body ilike '%' || q.term || '%'
      or fc.search_vector @@ plainto_tsquery('simple', q.term)
      or word_similarity(q.term, fc.search_body) > 0.3
      or exists (
        select 1 from public.field_case_tags fct
        join public.tags t on t.id = fct.tag_id
        where fct.case_id = fc.id and t.name ilike '%' || q.term || '%'
      )
    )
  order by rank desc, fc.created_at desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

-- ── 9. 統計洗い替え関数（approved のみ対象・承認処理とは分離して実行）─────────
create or replace function public.refresh_field_case_stats()
returns void
language plpgsql
as $$
declare
  v_approved bigint;
  v_edited   bigint;
  v_diag_ai  bigint;
  v_diag_match bigint;
begin
  delete from public.field_case_stats;

  -- メーカー別
  insert into public.field_case_stats (dimension, bucket, count)
  select 'manufacturer', coalesce(manufacturer,'(不明)'), count(*)
    from public.field_cases where workflow_status='approved' group by 1,2;
  -- 型式別
  insert into public.field_case_stats (dimension, bucket, count)
  select 'model', coalesce(model_number,'(不明)'), count(*)
    from public.field_cases where workflow_status='approved' group by 1,2;
  -- エラーコード別（配列展開）
  insert into public.field_case_stats (dimension, bucket, count)
  select 'error_code', ec, count(*)
    from public.field_cases fc, unnest(fc.error_codes) ec
   where fc.workflow_status='approved' group by 1,2;
  -- 製造年別
  insert into public.field_case_stats (dimension, bucket, count)
  select 'manufacture_year', to_char(manufactured_on,'YYYY'), count(*)
    from public.field_cases where workflow_status='approved' and manufactured_on is not null group by 1,2;
  -- 使用年数別（読み取り時に age() で算出）
  insert into public.field_case_stats (dimension, bucket, count)
  select 'service_years', extract(year from age(manufactured_on))::int::text, count(*)
    from public.field_cases
   where workflow_status='approved' and manufactured_on is not null group by 1,2;
  -- 原因別（確定原因があればそれ、なければ推定原因）
  insert into public.field_case_stats (dimension, bucket, count)
  select 'cause', coalesce(nullif(confirmed_cause,''), nullif(suspected_cause,''), '(未設定)'), count(*)
    from public.field_cases where workflow_status='approved' group by 1,2;
  -- 対応方法別（推奨対応の配列展開）
  insert into public.field_case_stats (dimension, bucket, count)
  select 'action', act, count(*)
    from public.field_cases fc, unnest(fc.recommended_actions) act
   where fc.workflow_status='approved' group by 1,2;
  -- 再発件数（同一 型式+主症状 が2件以上）
  insert into public.field_case_stats (dimension, bucket, count)
  select 'recurrence', model_number, count(*)
    from public.field_cases
   where workflow_status='approved' and model_number is not null
   group by model_number having count(*) >= 2;

  -- AI解析修正率 = edits を持つ承認案件数 ÷ 承認案件数
  select count(*) into v_approved from public.field_cases where workflow_status='approved';
  select count(distinct case_id) into v_edited
    from public.field_case_edits e
    join public.field_cases fc on fc.id = e.case_id
   where fc.workflow_status='approved';
  insert into public.field_case_stats (dimension, bucket, count)
  values ('ai_edit_rate','overall', case when v_approved=0 then 0 else round(v_edited::numeric / v_approved, 4) end);

  -- AIと確定診断の一致率 = diagnosisStatus の AI値と承認値が一致した割合
  -- （監査は camelCase の項目名で記録されるため field_name='diagnosisStatus' で照合）
  select count(*) into v_diag_ai
    from public.field_case_edits where field_name='diagnosisStatus';
  select count(*) into v_diag_match
    from public.field_case_edits where field_name='diagnosisStatus' and ai_value is not distinct from approved_value;
  -- 修正記録が無い＝AIと確定が一致（承認時に差分のみ記録するため）
  insert into public.field_case_stats (dimension, bucket, count)
  values ('ai_match_rate','diagnosis_status',
    case when v_approved=0 then 0
         else round((v_approved - (v_diag_ai - v_diag_match))::numeric / v_approved, 4) end);
end;
$$;

-- ── 10. RLS（追加テーブル）──────────────────────────────────────────────────
alter table public.field_case_edits enable row level security;
alter table public.audit_logs       enable row level security;
alter table public.analysis_jobs    enable row level security;
alter table public.field_case_links enable row level security;
alter table public.field_case_stats enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname='field_case_edits_write') then
    create policy field_case_edits_write on public.field_case_edits for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname='audit_logs_write') then
    create policy audit_logs_write on public.audit_logs for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname='analysis_jobs_write') then
    create policy analysis_jobs_write on public.analysis_jobs for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname='field_case_links_rw') then
    create policy field_case_links_rw on public.field_case_links for all to authenticated using (true) with check (true);
  end if;
  -- 統計は anon も読めてよい（社内ダッシュボード想定）
  if not exists (select 1 from pg_policies where policyname='field_case_stats_read') then
    create policy field_case_stats_read on public.field_case_stats for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname='field_case_stats_write') then
    create policy field_case_stats_write on public.field_case_stats for all to authenticated using (true) with check (true);
  end if;
end$$;

-- ── 11. サムネ用 Storage バケット（非同期生成先）────────────────────────────
insert into storage.buckets (id, name, public)
values ('field-photos-thumb', 'field-photos-thumb', true)
on conflict (id) do nothing;
