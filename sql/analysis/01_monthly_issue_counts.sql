-- Monthly complaint counts per company x issue cluster, zero-filled.
-- Zero-filling matters: a month with no complaints must count as 0,
-- otherwise rolling averages and spike detection silently skip it.
-- The final month is dropped when it is incomplete, so a partial month
-- never looks like a sudden drop.

drop materialized view if exists mv_monthly_issue_counts cascade;

create materialized view mv_monthly_issue_counts as
with bounds as (
    select
        date_trunc('month', min(date_received))::date                                    as first_month,
        (date_trunc('month', max(date_received) + interval '1 day') - interval '1 month')::date as last_full_month
    from complaints
),
months as (
    select generate_series(first_month, last_full_month, interval '1 month')::date as month
    from bounds
),
grid as (
    select co.company_id, cl.cluster_id, m.month
    from companies co
    cross join clusters cl
    cross join months m
),
counts as (
    select
        c.company_id,
        cc.cluster_id,
        date_trunc('month', c.date_received)::date as month,
        count(*)                                   as n
    from complaints c
    join complaint_clusters cc using (complaint_id)
    group by 1, 2, 3
)
select g.company_id, g.cluster_id, g.month, coalesce(ct.n, 0)::int as n
from grid g
left join counts ct using (company_id, cluster_id, month);

create unique index on mv_monthly_issue_counts (company_id, cluster_id, month);
