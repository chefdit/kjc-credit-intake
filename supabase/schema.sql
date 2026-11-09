-- Run in Supabase SQL editor.
create extension if not exists pgcrypto;

create table clients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  full_name text not null,
  dob date not null,
  email text not null,
  phone text not null,
  address1 text not null,
  city text not null,
  state text not null,
  zip text not null,
  source text not null,
  status text not null default 'intake'   -- intake | reviewing | cleanup | complete
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  goal_raw text not null,
  followups jsonb not null default '[]',
  target text,
  requirements jsonb default '[]',
  created_at timestamptz default now()
);

-- Login stored encrypted with pgsodium-style symmetric key held in Vault.
create table credit_access (
  client_id uuid primary key references clients(id) on delete cascade,
  provider text not null default 'myscoreiq',
  username_enc bytea not null,
  password_enc bytea not null,
  enrolled_via_kjc boolean not null default false,
  created_at timestamptz default now()
);

create table signatures (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  document text not null,                  -- authorization | agreement
  document_version text not null,
  signed_name text not null,
  signed_at timestamptz not null,
  ip inet,
  user_agent text
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  pulled_at date not null,
  file_path text not null,                 -- storage path of the PDF
  parsed jsonb,                            -- AI-extracted tradelines, scores, derogatories
  findings jsonb,                          -- AI review output
  plan jsonb,                              -- AI recommendations vs target
  created_at timestamptz default now()
);

create table disputes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  report_id uuid references reports(id),
  bureau text not null,                    -- experian | transunion | equifax | creditor
  item text not null,
  reason text not null,
  letter_text text,
  mailed_at date,
  mail_tracking text,
  outcome text,                            -- pending | deleted | verified | updated
  round int not null default 1
);

-- Lock everything down; only service role (edge functions) and Kristal's admin user read.
alter table clients enable row level security;
alter table goals enable row level security;
alter table credit_access enable row level security;
alter table signatures enable row level security;
alter table reports enable row level security;
alter table disputes enable row level security;

create policy "admin reads all" on clients for all
  using (auth.jwt() ->> 'email' = 'kj@kristaljconsulting.com');
create policy "admin reads goals" on goals for all
  using (auth.jwt() ->> 'email' = 'kj@kristaljconsulting.com');
create policy "admin reads signatures" on signatures for all
  using (auth.jwt() ->> 'email' = 'kj@kristaljconsulting.com');
create policy "admin reads reports" on reports for all
  using (auth.jwt() ->> 'email' = 'kj@kristaljconsulting.com');
create policy "admin reads disputes" on disputes for all
  using (auth.jwt() ->> 'email' = 'kj@kristaljconsulting.com');
-- credit_access: no client-side policy at all; decrypt only inside edge functions.
