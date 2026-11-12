-- Earshot core schema
-- Raw CFPB complaints are normalized into companies + complaints.
-- The NLP step writes clusters (root-cause issues) and complaint_clusters (assignments).

create table if not exists companies (
    company_id   serial primary key,
    name         text not null unique,
    slug         text not null unique,
    is_peer      boolean not null default true   -- included in the peer group for benchmarks
);

create table if not exists complaints (
    complaint_id      bigint primary key,
    date_received     date   not null,
    company_id        int    not null references companies(company_id),
    product           text   not null,
    sub_product       text,
    issue             text,
    sub_issue         text,
    narrative         text,
    state             text,
    submitted_via     text,
    company_response  text,
    timely            boolean
);

create index if not exists idx_complaints_company_date on complaints (company_id, date_received);
create index if not exists idx_complaints_date on complaints (date_received);

create table if not exists clusters (
    cluster_id        int primary key,
    label             text not null,
    summary           text,
    root_cause        text,
    suggested_action  text,
    owner_team        text,
    top_terms         text[],
    size              int not null default 0
);

create table if not exists complaint_clusters (
    complaint_id  bigint primary key references complaints(complaint_id) on delete cascade,
    cluster_id    int not null references clusters(cluster_id),
    similarity    real not null           -- cosine similarity to the cluster centroid
);

create index if not exists idx_cc_cluster on complaint_clusters (cluster_id);

-- Pipeline bookkeeping: what was loaded, when, from where.
create table if not exists pipeline_runs (
    run_id        serial primary key,
    started_at    timestamptz not null default now(),
    source        text not null,          -- 'cfpb' or 'sample'
    rows_loaded   int,
    date_min      date,
    date_max      date
);
