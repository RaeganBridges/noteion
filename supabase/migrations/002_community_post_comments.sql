-- Per-post comments (cross-device). Run in Supabase SQL editor after 001_community_posts.sql.

create table if not exists public.community_post_comments (
  id text primary key,
  post_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists community_post_comments_post_id_idx
  on public.community_post_comments (post_id);

create index if not exists community_post_comments_post_created_idx
  on public.community_post_comments (post_id, created_at desc);

alter table public.community_post_comments enable row level security;

create policy "community_post_comments_select_all"
  on public.community_post_comments for select
  to anon, authenticated
  using (true);

create policy "community_post_comments_insert_own"
  on public.community_post_comments for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "community_post_comments_delete_own"
  on public.community_post_comments for delete
  to authenticated
  using (auth.uid() = user_id);
