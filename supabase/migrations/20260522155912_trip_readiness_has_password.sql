alter table public.profiles
  add column has_password boolean not null default false;

comment on column public.profiles.has_password is
  'True iff this user has set a password identity. Mirrors '
  'auth.users.encrypted_password presence without exposing the auth '
  'schema to RLS. Written atomically inside the same server-action '
  'closure as updateUser({password}) — never via a trigger.';

-- Backfill from auth.users (migration runs in service-role context).
update public.profiles p
  set has_password = true
  from auth.users u
  where p.id = u.id
    and u.encrypted_password is not null
    and u.encrypted_password <> '';
