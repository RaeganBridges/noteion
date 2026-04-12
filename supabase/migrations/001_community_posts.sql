-- Run in Supabase SQL editor (or supabase db push) after creating a project.
-- Community posts: one row per published track (id matches client pub id).

create table if not exists public.community_posts (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists community_posts_user_id_idx on public.community_posts (user_id);
create index if not exists community_posts_updated_at_idx on public.community_posts (updated_at desc);

alter table public.community_posts enable row level security;

create policy "community_posts_select_all"
  on public.community_posts for select
  to anon, authenticated
  using (true);

create policy "community_posts_insert_own"
  on public.community_posts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "community_posts_update_own"
  on public.community_posts for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "community_posts_delete_own"
  on public.community_posts for delete
  to authenticated
  using (auth.uid() = user_id);
