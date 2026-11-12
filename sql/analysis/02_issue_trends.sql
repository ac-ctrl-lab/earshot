-- Rolling windows per company x issue:
--   t12 = complaints in the trailing 12 months (annual volume)
--   t6  = trailing 6 months, p6 = the 6 months before that
--   growth = (t6 - p6) / max(p6, 3)   -- floor of 3 stops tiny issues from showing +500%

create or replace view v_issue_trends as
select
    company_id,
    cluster_id,
    month,
    n,
    sum(n) over w12                                              as t12,
    sum(n) over w6                                               as t6,
    coalesce(sum(n) over wp6, 0)                                 as p6,
    (sum(n) over w6 - coalesce(sum(n) over wp6, 0))::numeric
        / greatest(coalesce(sum(n) over wp6, 0), 3)              as growth,
    count(*) over w12                                            as months_in_window
from mv_monthly_issue_counts
window
    w12 as (partition by company_id, cluster_id order by month rows between 11 preceding and current row),
    w6  as (partition by company_id, cluster_id order by month rows between 5 preceding and current row),
    wp6 as (partition by company_id, cluster_id order by month rows between 11 preceding and 6 preceding);
