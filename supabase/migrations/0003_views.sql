-- REVO OS KPIビュー v1（Dashboard用）
-- KPI: 月次売上・月次粗利・顧客別利益（残タスク S-1/S-2/A-1/A-2 に対応）
-- security_invoker = 呼び出しユーザーのRLSが効く（自組織のみ集計される）

-- ─── 案件別損益（全KPIの土台） ───────────────────────────
create view v_project_profit with (security_invoker = true) as
select
  p.organization_id,
  p.id                as project_id,
  p.project_number,
  p.name              as project_name,
  p.customer_id,
  p.client_name,
  p.inflow_route,
  p.inflow_source_name,
  p.status,
  coalesce(i.sales, 0)                       as sales,
  coalesce(w.cost, 0)                        as cost,
  coalesce(i.sales, 0) - coalesce(w.cost, 0) as gross_profit,
  i.first_invoice_date,
  i.last_invoice_date
from projects p
left join (
  select project_id,
         sum(total)        as sales,
         min(invoice_date) as first_invoice_date,
         max(invoice_date) as last_invoice_date
  from invoices
  group by project_id
) i on i.project_id = p.id
left join (
  select project_id, sum(cost_amount) as cost
  from work_items
  group by project_id
) w on w.project_id = p.id;

-- ─── 月次売上・月次粗利（S-1 / S-2） ─────────────────────
-- 売上は請求月ベース。原価は案件の初回請求月に全額計上（小規模運用向けの単純方式）
create view v_monthly_profit with (security_invoker = true) as
with monthly_sales as (
  select organization_id,
         date_trunc('month', invoice_date)::date as month,
         sum(total)  as sales,
         count(*)    as invoice_count
  from invoices
  group by 1, 2
),
monthly_cost as (
  select organization_id,
         date_trunc('month', first_invoice_date)::date as month,
         sum(cost) as cost
  from v_project_profit
  where first_invoice_date is not null
  group by 1, 2
)
select
  s.organization_id,
  s.month,
  s.sales,
  coalesce(c.cost, 0)           as cost,
  s.sales - coalesce(c.cost, 0) as gross_profit,
  s.invoice_count
from monthly_sales s
left join monthly_cost c
  on c.organization_id = s.organization_id and c.month = s.month;

-- ─── 顧客別売上・粗利（A-1 / A-2） ───────────────────────
create view v_customer_profit with (security_invoker = true) as
select
  pp.organization_id,
  pp.customer_id,
  coalesce(c.name, pp.client_name, '（未紐付け）') as customer_name,
  count(*)             as project_count,
  sum(pp.sales)        as sales,
  sum(pp.cost)         as cost,
  sum(pp.gross_profit) as gross_profit
from v_project_profit pp
left join customers c on c.id = pp.customer_id
group by pp.organization_id, pp.customer_id, coalesce(c.name, pp.client_name, '（未紐付け）');

-- ─── 流入経路別（売上・粗利・件数） ──────────────────────
create view v_inflow_profit with (security_invoker = true) as
select
  organization_id,
  coalesce(inflow_route::text, 'unset') as inflow_route,
  count(*)             as project_count,
  sum(sales)           as sales,
  sum(gross_profit)    as gross_profit
from v_project_profit
group by 1, 2;

-- ─── 元請別（流入経路=元請けの取引先別） ─────────────────
create view v_contractor_profit with (security_invoker = true) as
select
  organization_id,
  inflow_source_name   as contractor_name,
  count(*)             as project_count,
  sum(sales)           as sales,
  sum(gross_profit)    as gross_profit
from v_project_profit
where inflow_route = 'contractor' and inflow_source_name is not null
group by 1, 2;

-- ─── 経路別成約率（CARE: 相談→案件化） ───────────────────
create view v_inflow_conversion with (security_invoker = true) as
select
  organization_id,
  channel,
  count(*)                                  as consultation_count,
  count(project_id)                         as converted_count,
  round(count(project_id)::numeric / nullif(count(*), 0) * 100, 1) as conversion_rate_pct
from consultations
group by 1, 2;

-- ─── 未請求案件（請求もれゼロ運用） ──────────────────────
create view v_uninvoiced_projects with (security_invoker = true) as
select organization_id, project_id, project_number, project_name, status, sales, cost
from v_project_profit
where status in ('completed', 'in_progress', 'approved', 'scheduled')
  and sales = 0;

-- ─── 未入金請求 ──────────────────────────────────────────
create view v_unpaid_invoices with (security_invoker = true) as
select organization_id, id as invoice_id, invoice_no, project_id, invoice_date, due_date, total
from invoices
where paid_at is null;

-- ─── 見直し期限が来た意思決定（Decision Log運用） ────────
create view v_decisions_due with (security_invoker = true) as
select organization_id, id as decision_id, title, decided_at, review_at
from decisions
where status = 'active' and review_at is not null and review_at <= current_date;
