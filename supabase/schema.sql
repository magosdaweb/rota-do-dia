create extension if not exists "pgcrypto";

create table if not exists public.route_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  title text not null,
  category text not null default 'rotina',
  starts_on date not null,
  start_time time not null,
  end_time time not null,
  repeat_type text not null default 'none',
  custom_rule jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.route_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  item_id uuid not null references public.route_items(id) on delete cascade,
  completed_on date not null,
  completed boolean not null default true,
  created_at timestamptz not null default now(),
  unique (item_id, completed_on)
);

alter table public.route_items enable row level security;
alter table public.route_completions enable row level security;

create policy "route_items_select_own"
on public.route_items for select
to authenticated
using (auth.uid() = user_id);

create policy "route_items_insert_own"
on public.route_items for insert
to authenticated
with check (auth.uid() = user_id);

create policy "route_items_update_own"
on public.route_items for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "route_items_delete_own"
on public.route_items for delete
to authenticated
using (auth.uid() = user_id);

create policy "route_completions_select_own"
on public.route_completions for select
to authenticated
using (auth.uid() = user_id);

create policy "route_completions_insert_own"
on public.route_completions for insert
to authenticated
with check (auth.uid() = user_id);

create policy "route_completions_update_own"
on public.route_completions for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "route_completions_delete_own"
on public.route_completions for delete
to authenticated
using (auth.uid() = user_id);
