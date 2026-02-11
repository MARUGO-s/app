-- Remove legacy pingus0428 account that should no longer be used.
-- Keep current admin account (id d03ce203-5e8c-4123-8f90-b8e56b38ae69).

do $$
declare
  legacy_auth_id uuid;
begin
  -- Prefer explicit old iCloud account.
  select p.id
    into legacy_auth_id
    from public.profiles p
   where lower(coalesce(p.email, '')) = 'pingus0428@icloud.com'
   limit 1;

  -- Fallback: display_id "pingus0428" if present in profiles.
  if legacy_auth_id is null then
    select p.id
      into legacy_auth_id
      from public.profiles p
     where lower(coalesce(p.display_id, '')) = 'pingus0428'
     limit 1;
  end if;

  -- Final fallback from auth users metadata/email.
  if legacy_auth_id is null then
    select u.id
      into legacy_auth_id
      from auth.users u
     where lower(coalesce(u.email, '')) = 'pingus0428@icloud.com'
        or lower(coalesce(u.raw_user_meta_data ->> 'display_id', '')) = 'pingus0428'
     limit 1;
  end if;

  -- Safety guard: never touch the current admin auth user.
  if legacy_auth_id is null
     or legacy_auth_id = 'd03ce203-5e8c-4123-8f90-b8e56b38ae69'::uuid then
    return;
  end if;

  -- Legacy app_users row (if any)
  delete from public.app_users
   where lower(coalesce(id, '')) = 'pingus0428';

  -- Remove auth/session artifacts and user.
  delete from auth.refresh_tokens where user_id::text = legacy_auth_id::text;
  delete from auth.sessions where user_id::text = legacy_auth_id::text;
  delete from auth.identities where user_id::text = legacy_auth_id::text;

  -- Remove profile row bound to the auth uid.
  delete from public.profiles where id = legacy_auth_id;

  -- Finally remove auth user.
  delete from auth.users where id = legacy_auth_id;
end
$$;
