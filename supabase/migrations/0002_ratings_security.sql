-- 0002_ratings_security.sql
-- Adds: denormalized + Bayesian company ratings (trigger-maintained),
--       IP-based one-review-per-IP-per-company constraint,
--       a DB-level email-verification gate for review inserts,
--       and supporting indexes (reviews lookup + company-name search).
--
-- Safe to run after 0001_init.sql. Does not modify 0001_init.sql.
-- Apply with:  supabase db push     (see notes at the bottom of this file)

----------------------------------------------------------------------
-- 1. DENORMALIZED + BAYESIAN RATINGS ON companies
----------------------------------------------------------------------

-- Denormalized aggregates kept in sync by triggers on `reviews`.
--   rating_count   = number of reviews for the company
--   rating_sum     = sum of all review ratings (so mean = sum / count)
--   bayesian_rating= shrinkage score used for ranking (see formula below)
alter table public.companies
  add column if not exists rating_count integer not null default 0,
  add column if not exists rating_sum bigint not null default 0,
  add column if not exists bayesian_rating numeric(4, 2) not null default 0;

-- Tunable prior weight `m`: the number of "virtual" reviews at the global
-- mean that a company is seeded with. Larger m => stronger pull toward the
-- global mean for low-volume companies. 10 is a reasonable starting point.
-- Centralized here so it can be changed in exactly one place.
create or replace function public.bayesian_prior_weight()
returns numeric
language sql
immutable
as $$
  select 10::numeric;
$$;

-- Pure Bayesian (shrinkage) average:
--   score = (v / (v + m)) * R  +  (m / (v + m)) * C
-- where R = company mean (sum/count), v = count, m = prior weight, C = global mean.
-- Properties: v = 0 -> C (the prior); v -> infinity -> R.
create or replace function public.bayesian_score(
  p_sum bigint,
  p_count bigint,
  p_global_mean numeric,
  p_weight numeric
)
returns numeric
language sql
immutable
as $$
  select case
    when p_count = 0 then round(p_global_mean, 2)
    else round(
      (p_count::numeric / (p_count + p_weight)) * (p_sum::numeric / p_count)
      + (p_weight / (p_count + p_weight)) * p_global_mean,
      2
    )
  end;
$$;

-- Global mean rating C (the prior). Computed from the denormalized company
-- aggregates, so it is O(number of companies) rather than O(number of reviews).
-- Returns 0 when there are no reviews anywhere yet.
create or replace function public.global_mean_rating()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    sum(rating_sum)::numeric / nullif(sum(rating_count), 0),
    0
  )
  from public.companies;
$$;

-- Recompute the stored aggregates + Bayesian score for a single company.
-- Step 1/2 cost only that company's reviews (indexed); step 3 is over the
-- (small) companies table; step 4 writes the Bayesian score.
create or replace function public.refresh_company_rating(p_company uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sum bigint;
  v_count bigint;
  v_global numeric;
begin
  if p_company is null then
    return;
  end if;

  -- 1. exact aggregates for this company (uses reviews(company_id, ...) index)
  select coalesce(sum(rating), 0), count(*)
    into v_sum, v_count
    from public.reviews
    where company_id = p_company;

  -- 2. persist the counts so the global mean (step 3) sees fresh data
  update public.companies
    set rating_sum = v_sum,
        rating_count = v_count
    where id = p_company;

  -- 3. global mean prior C, now reflecting this company's updated counts
  v_global := public.global_mean_rating();

  -- 4. Bayesian score for this company
  update public.companies
    set bayesian_rating = public.bayesian_score(
          v_sum, v_count, v_global, public.bayesian_prior_weight()
        )
    where id = p_company;
end;
$$;

-- Row-level trigger fn: keep the affected company (or companies, if a review
-- is ever moved between companies) in sync after any review write.
create or replace function public.reviews_rating_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT') then
    perform public.refresh_company_rating(new.company_id);
  elsif (tg_op = 'DELETE') then
    perform public.refresh_company_rating(old.company_id);
  elsif (tg_op = 'UPDATE') then
    perform public.refresh_company_rating(new.company_id);
    if (new.company_id is distinct from old.company_id) then
      perform public.refresh_company_rating(old.company_id);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists reviews_rating_aiud on public.reviews;
create trigger reviews_rating_aiud
  after insert or update or delete on public.reviews
  for each row execute function public.reviews_rating_trigger();

-- Full recompute for all companies. Run after backfills, bulk imports, or on a
-- schedule (e.g. pg_cron) to refresh every company's Bayesian score against the
-- latest global mean. Per-write triggers only refresh the *touched* company, so
-- other companies' Bayesian scores drift slightly as C moves — this re-syncs them.
create or replace function public.recompute_all_company_ratings()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- counts for companies that have reviews
  update public.companies co
    set rating_sum = agg.s,
        rating_count = agg.c
    from (
      select company_id, coalesce(sum(rating), 0) as s, count(*) as c
      from public.reviews
      group by company_id
    ) agg
    where co.id = agg.company_id;

  -- zero out companies with no reviews
  update public.companies
    set rating_sum = 0,
        rating_count = 0
    where id not in (select distinct company_id from public.reviews);

  -- Bayesian score for everyone against the (now fresh) global mean
  update public.companies
    set bayesian_rating = public.bayesian_score(
          rating_sum, rating_count,
          public.global_mean_rating(),
          public.bayesian_prior_weight()
        );
end;
$$;

-- Backfill existing rows created by 0001/seed.
select public.recompute_all_company_ratings();

----------------------------------------------------------------------
-- 2. IP-BASED RATE LIMIT: ONE REVIEW PER IP PER COMPANY
----------------------------------------------------------------------

-- Store a salted hash of the submitter's IP (never the raw IP) — see the
-- review server action for hashing. Nullable so historical rows and any
-- path that can't resolve an IP are not blocked.
alter table public.reviews
  add column if not exists ip_hash text;

-- Partial unique index: at most one review per (company, ip_hash) when an IP
-- hash is present. NULLs are excluded, so missing IPs never collide.
create unique index if not exists reviews_company_ip_unique
  on public.reviews (company_id, ip_hash)
  where ip_hash is not null;

----------------------------------------------------------------------
-- 3. EMAIL-VERIFICATION GATE (DB-LEVEL)
----------------------------------------------------------------------

-- Source of truth = auth.users.email_confirmed_at. SECURITY DEFINER so the
-- policy can read auth.users regardless of the caller's privileges.
create or replace function public.is_email_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users
    where id = auth.uid()
      and email_confirmed_at is not null
  );
$$;

-- Replace the original insert policy with one that also requires a verified
-- email. (The existing unique (company_id, user_id) constraint from 0001 is
-- left untouched and still enforces one review per user per company.)
drop policy if exists "reviews_insert_authenticated" on public.reviews;
create policy "reviews_insert_verified" on public.reviews
  for insert
  with check (
    auth.uid() = user_id
    and public.is_email_verified()
  );

----------------------------------------------------------------------
-- 4. INDEXES
----------------------------------------------------------------------

-- Fast "reviews for a company, newest first" reads (company page, pagination).
create index if not exists reviews_company_created_idx
  on public.reviews (company_id, created_at desc);

-- Trigram index for company-name search (supports ILIKE '%term%').
create extension if not exists pg_trgm;
create index if not exists companies_name_trgm_idx
  on public.companies using gin (name gin_trgm_ops);

----------------------------------------------------------------------
-- HOW TO APPLY
----------------------------------------------------------------------
-- Local dev (resets local DB and replays all migrations + seed):
--   supabase db reset
--
-- Apply pending migrations to the linked/remote project:
--   supabase db push
--
-- Verify after pushing, e.g.:
--   select slug, rating_count, rating_sum, bayesian_rating from public.companies order by bayesian_rating desc;
