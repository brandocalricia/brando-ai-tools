-- Run this in Supabase SQL Editor to set up tables

-- Users table (extends Supabase auth.users)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  -- plan values: 'free', 'pro' (bundle), or comma-separated extensions like 'linkedin,youtube'
  plan text not null default 'free',
  stripe_customer_id text,
  created_at timestamptz not null default now()
);

-- Usage tracking table (per extension)
create table public.usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null default current_date,
  extension text not null default 'linkedin',
  generation_count int not null default 0,
  unique (user_id, date, extension)
);

-- Enable RLS
alter table public.users enable row level security;
alter table public.usage enable row level security;

-- Service role can do everything (backend uses service key)
-- No user-facing RLS policies needed since all access goes through the API

-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: If you already ran the original schema with the CHECK constraint,
-- run this to allow per-extension plan values:
-- ══════════════════════════════════════════════════════════════════════════════
-- ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_plan_check;
