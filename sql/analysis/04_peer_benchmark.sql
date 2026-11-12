-- Peer benchmark over the trailing 12 months.
-- CFPB data has no customer counts, so raw volumes favor small companies.
-- Instead we compare issue MIX: what share of a company's complaints fall into each issue,
-- versus the same share across all OTHER peers (the company itself is excluded from its baseline).
--   peer_index > 1.25  -> worse than peers on this issue
--   peer_index < 0.80  -> better than peers

create or replace view v_peer_benchmark as
with window_start as (
    select (max(month) - interval '11 months')::date as m from mv_monthly_issue_counts
),
last12 as (
    select mc.company_id, mc.cluster_id, sum(mc.n) as n12
    from mv_monthly_issue_counts mc
    join companies co using (company_id)
    where co.is_peer
      and mc.month >= (select m from window_start)
    group by 1, 2
),
with_totals as (
    select
        company_id,
        cluster_id,
        n12,
        sum(n12) over (partition by company_id) as company_total
    from last12
),
shares as (
    select
        company_id,
        cluster_id,
        n12,
        company_total,
        n12::numeric / nullif(company_total, 0) as share,
        (sum(n12) over (partition by cluster_id) - n12)::numeric
            / nullif(sum(company_total) over (partition by cluster_id) - company_total, 0) as peer_share
    from with_totals
)
select
    company_id,
    cluster_id,
    n12,
    company_total,
    round(share, 4)                                   as share,
    round(peer_share, 4)                              as peer_share,
    round(share / nullif(peer_share, 0), 3)           as peer_index,
    rank() over (partition by cluster_id order by share desc) as share_rank,  -- 1 = worst in peer group
    count(*) over (partition by cluster_id)           as peer_count
from shares;
