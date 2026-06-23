-- StagePro resale board — core schema. Single-owner model: every owner-write
-- is gated by auth.uid() = the owner (any authenticated user in this project).
create extension if not exists "pgcrypto";

-- ── assets: the gear register ───────────────────────────────────────────────
create table public.assets (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  category          text,
  qty               int  not null default 1,
  acquisition_cost  numeric(12,2) not null,
  salvage_value     numeric(12,2) not null default 0,
  useful_life_months int not null default 60,
  acquired_on       date not null,
  status            text not null default 'in_service'
                    check (status in ('in_service','idle')),
  idle_since        date,
  disposition       text check (disposition in ('keep','sell')),
  asking_price      numeric(12,2),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.buyers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  contact     text,
  token       text not null unique default encode(gen_random_bytes(9), 'hex'),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.buyer_assets (
  buyer_id  uuid not null references public.buyers(id) on delete cascade,
  asset_id  uuid not null references public.assets(id) on delete cascade,
  primary key (buyer_id, asset_id)
);

create table public.interests (
  id          uuid primary key default gen_random_uuid(),
  buyer_id    uuid not null references public.buyers(id) on delete cascade,
  asset_id    uuid not null references public.assets(id) on delete cascade,
  message     text,
  created_at  timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger trg_assets_touch before update on public.assets
  for each row execute function public.touch_updated_at();

-- ── v_assets: live straight-line book value + sell suggestion ────────────────
-- security_invoker => the view obeys the CALLER's RLS, not the owner's, so anon
-- cannot read the register through it. Partial months are floored (book value
-- steps once per whole month) — a deliberate simplification.
create or replace view public.v_assets with (security_invoker = true) as
select
  a.*,
  greatest(0, (date_part('year',  age(current_date, a.acquired_on)) * 12
             + date_part('month', age(current_date, a.acquired_on)))::int) as age_months,
  round(((a.acquisition_cost - a.salvage_value) / nullif(a.useful_life_months,0))::numeric, 2) as monthly_depreciation,
  greatest(
    a.salvage_value,
    round((a.acquisition_cost
      - (a.acquisition_cost - a.salvage_value)
        * least(1.0, (date_part('year',  age(current_date, a.acquired_on)) * 12
                    + date_part('month', age(current_date, a.acquired_on)))
                     / nullif(a.useful_life_months,0)))::numeric, 2)
  ) as book_value,
  case
    when a.disposition is not null then a.disposition
    when a.status = 'idle'
     and a.idle_since is not null
     and a.idle_since <= (current_date - interval '3 months')
    then 'sell'
    else 'keep'
  end as suggested_disposition
from public.assets a;

-- ── RLS: owner-only register, NO anon path ──────────────────────────────────
alter table public.assets       enable row level security;
alter table public.buyers       enable row level security;
alter table public.buyer_assets enable row level security;
alter table public.interests    enable row level security;

create policy owner_all_assets       on public.assets       for all to authenticated using (true) with check (true);
create policy owner_all_buyers       on public.buyers       for all to authenticated using (true) with check (true);
create policy owner_all_buyer_assets on public.buyer_assets for all to authenticated using (true) with check (true);
create policy owner_read_interests   on public.interests    for select to authenticated using (true);
-- No anon policy anywhere. interests is written ONLY by the edge fn (service role).

revoke select on public.v_assets from anon;
