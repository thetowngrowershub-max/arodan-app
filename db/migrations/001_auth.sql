-- Sign-in tables and database roles used by the Arodan API server.
-- The API signs people in with SMS codes and, for each request, runs queries as the
-- `authenticated` role with the user's id set, so the row level security rules in 002_app.sql apply.
-- Some managed hosts don't let the database user create roles. Then these steps are skipped and the
-- API adds the same per-user filters to its own queries instead (see server/src/db.js).

do $$ begin create role anon nologin; exception when duplicate_object or insufficient_privilege then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object or insufficient_privilege then null; end $$;
-- The API's own database user must be able to switch into these roles.
do $$ begin execute format('grant anon, authenticated to %I', current_user); exception when others then null; end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  phone text unique,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

-- One-time SMS codes. Only a hash of the code is stored.
create table if not exists auth.otp_codes (
  id bigint generated always as identity primary key,
  phone text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists otp_codes_phone_idx on auth.otp_codes (phone, created_at desc);

-- The signed-in user's id for the current transaction (set by the API server).
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') and exists (select 1 from pg_roles where rolname = 'anon') then
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
    alter default privileges in schema public grant usage, select on sequences to anon, authenticated;
  end if;
end $$;
