-- Householder schema. All tables RLS-enabled; policies live in 0002_security.sql.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  locale text not null default 'el' check (locale in ('el', 'en')),
  created_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  code text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references public.profiles (id) on delete set null,
  used_at timestamptz
);

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active', 'completed')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz
);

create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  -- denormalized from the parent list; enables household-scoped Realtime filters
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  qty text,
  note text,
  added_by uuid references public.profiles (id) on delete set null,
  checked boolean not null default false,
  checked_by uuid references public.profiles (id) on delete set null,
  checked_at timestamptz,
  position numeric not null,
  created_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.notification_queue (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  list_id uuid references public.lists (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  event text not null check (event in ('items_added', 'list_completed')),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index on public.household_members (user_id);
create index on public.invites (household_id);
create index on public.lists (household_id, status);
create index on public.list_items (list_id);
create index on public.list_items (household_id);
create index on public.notification_queue (processed_at) where processed_at is null;

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.invites enable row level security;
alter table public.lists enable row level security;
alter table public.list_items enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_queue enable row level security;

-- Replica identity stays DEFAULT on purpose: DELETE events then carry only the PK,
-- which is the privacy-correct behavior the client design relies on.
alter publication supabase_realtime add table public.lists, public.list_items;
