-- Emerging-issue detection: rolling z-score of this month against the 6 months before it.
-- The baseline window excludes the current month, so a spike cannot dampen itself.
-- The standard deviation is floored at 1 so near-silent issues do not produce huge z-scores.

create or replace view v_issue_spikes as
with baseline as (
    select
        company_id,
        cluster_id,
        month,
        n,
        avg(n)         over w as base_mean,
        stddev_samp(n) over w as base_sd,
        count(*)       over w as base_len
    from mv_monthly_issue_counts
    window w as (partition by company_id, cluster_id order by month rows between 6 preceding and 1 preceding)
)
select
    company_id,
    cluster_id,
    month,
    n,
    round(base_mean, 2)                                        as base_mean,
    round((n - base_mean) / greatest(coalesce(base_sd, 0), 1), 2) as z,
    (
        (n - base_mean) / greatest(coalesce(base_sd, 0), 1) >= 2.5
        and n >= 8
        and n >= 1.5 * base_mean
    )                                                          as is_spike
from baseline
where base_len = 6;
