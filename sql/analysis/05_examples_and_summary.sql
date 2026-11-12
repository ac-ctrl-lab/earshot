-- Evidence and headline numbers.

-- Up to 3 recent, readable complaints per company x issue that sit closest to the issue's center.
create or replace view v_issue_examples as
with ranked as (
    select
        c.company_id,
        cc.cluster_id,
        c.complaint_id,
        c.date_received,
        c.sub_product,
        c.state,
        c.narrative,
        row_number() over (
            partition by c.company_id, cc.cluster_id
            order by cc.similarity desc, c.date_received desc
        ) as rn
    from complaints c
    join complaint_clusters cc using (complaint_id)
    where c.date_received >= (select max(date_received) - interval '12 months' from complaints)
      and length(c.narrative) between 180 and 1400
)
select company_id, cluster_id, complaint_id, date_received, sub_product, state, narrative
from ranked
where rn <= 6;  -- the export keeps the first 3 distinct ones

-- One row per company: annual volume, change vs the prior year, timely-response rate.
create or replace view v_company_summary as
with bounds as (
    select max(date_received) as d1 from complaints
)
select
    co.company_id,
    co.name,
    co.slug,
    count(*) filter (where c.date_received >  b.d1 - interval '12 months')                          as complaints_12m,
    count(*) filter (where c.date_received <= b.d1 - interval '12 months'
                       and c.date_received >  b.d1 - interval '24 months')                          as complaints_prior_12m,
    round(avg(case when c.timely then 1.0 else 0.0 end)
          filter (where c.date_received > b.d1 - interval '12 months'), 3)                          as timely_rate_12m
from companies co
join complaints c using (company_id)
cross join bounds b
group by co.company_id, co.name, co.slug;
