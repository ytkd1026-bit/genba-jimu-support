-- =============================================================================
-- 追加マイグレーション: 推定原因 / 確定原因 の分離と診断ステータス、写真ステータス
--   ※ 既存マイグレーション 20260723090000_field_cases.sql への破壊的変更は行わない。
--     既存カラム（cause / diagnosis / url NOT NULL 等）は温存し、カラム追加と
--     生成カラム/検索RPCの再定義（派生データのため安全）のみ行う。
--
-- 変更点:
--   1. field_cases に suspected_cause / confirmed_cause / diagnosis_status /
--      repair_candidates を追加（原因の推定・確定を別項目で保持）
--   2. 既存 cause を suspected_cause へバックフィル
--   3. 検索用生成カラム search_body / search_vector を推定・確定原因・修理候補を
--      含めて再生成
--   4. field_case_photos に photo_status を追加し、url を NULL 許容へ（未アップロード
--      のメタデータ先行登録に対応）
--   5. search_field_cases RPC を新カラムを返すよう再定義
-- =============================================================================

-- ── 1. field_cases へカラム追加 ──────────────────────────────────────────────
alter table public.field_cases
  add column if not exists suspected_cause  text,
  add column if not exists confirmed_cause  text,
  add column if not exists diagnosis_status text not null default 'suspected',
  add column if not exists repair_candidates text[] not null default '{}';

-- diagnosis_status の値を制約（suspected / confirmed / manufacturer_confirmed / unresolved）
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'field_cases_diagnosis_status_chk'
  ) then
    alter table public.field_cases
      add constraint field_cases_diagnosis_status_chk
      check (diagnosis_status in ('suspected','confirmed','manufacturer_confirmed','unresolved'));
  end if;
end$$;

-- ── 2. 既存 cause を推定原因へバックフィル（未設定のみ）──────────────────────
update public.field_cases
   set suspected_cause = cause
 where suspected_cause is null
   and cause is not null;

-- ── 3. 検索用生成カラムを再生成（推定/確定原因・修理候補を含める）─────────────
-- generated column は式変更ができないため、依存 index を落として作り直す（派生データ）。
drop index if exists idx_field_cases_search_body_trgm;
drop index if exists idx_field_cases_search_vector;

alter table public.field_cases drop column if exists search_body;
alter table public.field_cases drop column if exists search_vector;

alter table public.field_cases
  add column search_body text generated always as (
    public.array_to_text_imm(symptoms)              || ' ' ||
    coalesce(cause, '')                             || ' ' ||
    coalesce(suspected_cause, '')                   || ' ' ||
    coalesce(confirmed_cause, '')                   || ' ' ||
    coalesce(diagnosis, '')                         || ' ' ||
    public.array_to_text_imm(recommended_actions)   || ' ' ||
    public.array_to_text_imm(repair_candidates)     || ' ' ||
    coalesce(emergency_action, '')                  || ' ' ||
    coalesce(ai_judgment, '')                       || ' ' ||
    coalesce(risk, '')                              || ' ' ||
    coalesce(manufacturer, '')                      || ' ' ||
    coalesce(model_number, '')                      || ' ' ||
    coalesce(subcategory, '')
  ) stored;

alter table public.field_cases
  add column search_vector tsvector generated always as (
    to_tsvector('pg_catalog.simple',
      public.array_to_text_imm(symptoms)              || ' ' ||
      coalesce(cause, '')                             || ' ' ||
      coalesce(suspected_cause, '')                   || ' ' ||
      coalesce(confirmed_cause, '')                   || ' ' ||
      coalesce(diagnosis, '')                         || ' ' ||
      public.array_to_text_imm(recommended_actions)   || ' ' ||
      public.array_to_text_imm(repair_candidates)     || ' ' ||
      coalesce(emergency_action, '')                  || ' ' ||
      coalesce(risk, '')                              || ' ' ||
      coalesce(model_number, '')
    )
  ) stored;

create index if not exists idx_field_cases_search_body_trgm
  on public.field_cases using gin (search_body gin_trgm_ops);
create index if not exists idx_field_cases_search_vector
  on public.field_cases using gin (search_vector);
create index if not exists idx_field_cases_diagnosis_status
  on public.field_cases (diagnosis_status);

-- ── 4. field_case_photos に photo_status を追加、url を NULL 許容へ ────────────
alter table public.field_case_photos
  add column if not exists photo_status text not null default 'uploaded';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'field_case_photos_status_chk'
  ) then
    alter table public.field_case_photos
      add constraint field_case_photos_status_chk
      check (photo_status in ('pending_upload','uploaded','failed'));
  end if;
end$$;

-- 未アップロード（メタデータ先行登録）は url を持たないため NULL 許容にする
alter table public.field_case_photos alter column url drop not null;

create index if not exists idx_field_case_photos_status
  on public.field_case_photos (photo_status);

-- ── 5. search_field_cases RPC を新カラム対応で再定義 ─────────────────────────
drop function if exists public.search_field_cases(text, text, text, int, int);

create function public.search_field_cases(
  p_query       text,
  p_category    text default null,
  p_subcategory text default null,
  p_limit       int  default 20,
  p_offset      int  default 0
)
returns table (
  id                  uuid,
  category            text,
  subcategory         text,
  manufacturer        text,
  model_number        text,
  manufactured_on     date,
  symptoms            text[],
  cause               text,
  suspected_cause     text,
  confirmed_cause     text,
  diagnosis_status    text,
  diagnosis           text,
  recommended_actions text[],
  repair_candidates   text[],
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
    fc.id, fc.category, fc.subcategory, fc.manufacturer, fc.model_number,
    fc.manufactured_on, fc.symptoms, fc.cause, fc.suspected_cause,
    fc.confirmed_cause, fc.diagnosis_status, fc.diagnosis,
    fc.recommended_actions, fc.repair_candidates, fc.emergency_action,
    fc.ai_judgment, fc.risk,
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
    (p_category    is null or fc.category    = p_category)
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
