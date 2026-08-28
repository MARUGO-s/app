\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'security assertion failed: %', message;
  end if;
end;
$$;

create or replace function pg_temp.expect_admin_denied(statement text, label text)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
  exception
    when others then
      if sqlstate = '42501'
         or lower(sqlerrm) like '%insufficient_privilege%'
         or lower(sqlerrm) like '%admin only%'
         or lower(sqlerrm) like '%permission denied%' then
        return;
      end if;
      raise exception 'security assertion failed: % returned unexpected error [%] %',
        label, sqlstate, sqlerrm;
  end;

  raise exception 'security assertion failed: % unexpectedly succeeded', label;
end;
$$;

select pg_temp.assert_true(
  (select public is false from storage.buckets where id = 'app-data'),
  'app-data must be a private bucket'
);
select pg_temp.assert_true(
  (select file_size_limit = 26214400 from storage.buckets where id = 'app-data'),
  'app-data must enforce the 25 MiB object limit'
);
select pg_temp.assert_true(
  (select file_size_limit = 12582912 from storage.buckets where id = 'recipe-images'),
  'recipe-images must enforce the 12 MiB object limit'
);
select pg_temp.assert_true(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and 'public' = any(roles)
  ),
  'storage write policies must never apply to anonymous/public callers'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and (
        has_table_privilege('anon', c.oid, 'TRUNCATE')
        or has_table_privilege('anon', c.oid, 'TRIGGER')
        or has_table_privilege('anon', c.oid, 'REFERENCES')
        or has_table_privilege('authenticated', c.oid, 'TRUNCATE')
        or has_table_privilege('authenticated', c.oid, 'TRIGGER')
        or has_table_privilege('authenticated', c.oid, 'REFERENCES')
      )
  ),
  'API roles must not hold table privileges that bypass or sit outside RLS'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from pg_policies p
    join pg_namespace n on n.nspname = p.schemaname
    join pg_class c on c.relnamespace = n.oid and c.relname = p.tablename
    where p.schemaname = 'public'
      and p.tablename <> 'profiles'
      and p.roles && array['authenticated', 'public']::name[]
      and (
        (p.cmd in ('SELECT', 'ALL') and not has_table_privilege(
          'authenticated', c.oid, 'SELECT'
        ))
        or (p.cmd in ('INSERT', 'ALL') and not has_table_privilege(
          'authenticated', c.oid, 'INSERT'
        ))
        or (p.cmd in ('UPDATE', 'ALL') and not has_table_privilege(
          'authenticated', c.oid, 'UPDATE'
        ))
        or (p.cmd in ('DELETE', 'ALL') and not has_table_privilege(
          'authenticated', c.oid, 'DELETE'
        ))
      )
  ),
  'each authenticated RLS policy must have its matching explicit table grant'
);

-- Seed an object outside the disposable user's folder so visibility can be
-- tested after assuming the authenticated API role.
insert into storage.objects (bucket_id, name, owner_id)
values (
  'app-data',
  '22222222-2222-4222-8222-222222222222/private-security-test.json',
  '22222222-2222-4222-8222-222222222222'
);

insert into public.recipes (title, tags)
values (
  'other private cost security test',
  array['owner:22222222-2222-4222-8222-222222222222']
);
insert into public.recipe_category_cost_overrides (
  recipe_id,
  category_key,
  overridden_cost_tax_included
)
select id, 'security-private', 100
from public.recipes
where title = 'other private cost security test';

-- A disposable Auth account used only inside this rolled-back transaction.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated',
  'authenticated',
  'security-test@example.invalid',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_id":"security-test"}'::jsonb,
  now(),
  now()
);

-- Exercise the same browser fallback path used when the Auth trigger has not
-- created a profile yet.
delete from public.profiles
where id = '11111111-1111-4111-8111-111111111111';

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","email":"security-test@example.invalid"}',
  true
);

set local role authenticated;

select pg_temp.assert_true(
  not exists (
    select 1
    from storage.objects
    where bucket_id = 'app-data'
      and name = '22222222-2222-4222-8222-222222222222/private-security-test.json'
  ),
  'a normal user must not read another account storage folder'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.recipe_category_cost_overrides o
    join public.recipes r on r.id = o.recipe_id
    where r.title = 'other private cost security test'
  ),
  'private recipe cost overrides must not be visible cross-account'
);

insert into storage.objects (bucket_id, name, owner_id)
values (
  'app-data',
  '11111111-1111-4111-8111-111111111111/own-security-test.json',
  '11111111-1111-4111-8111-111111111111'
);

insert into storage.objects (bucket_id, name, owner_id)
values (
  'recipe-images',
  '11111111-1111-4111-8111-111111111111/own-security-test.jpg',
  '11111111-1111-4111-8111-111111111111'
);

insert into public.profiles (
  id,
  display_id,
  email,
  store_name
)
values (
  '11111111-1111-4111-8111-111111111111',
  'security-test',
  'security-test@example.invalid',
  'TEST STORE'
);

select pg_temp.assert_true(
  (select role = 'user' from public.profiles
   where id = '11111111-1111-4111-8111-111111111111'),
  'profile creation must use the database user-role default'
);
select pg_temp.assert_true(
  (select show_master_recipes is false from public.profiles
   where id = '11111111-1111-4111-8111-111111111111'),
  'profile creation must use the database master-visibility default'
);

select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
  'authenticated must not have table UPDATE on profiles'
);
select pg_temp.assert_true(
  not has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE'),
  'authenticated must not update profiles.role'
);
select pg_temp.assert_true(
  not has_column_privilege('authenticated', 'public.profiles', 'store_name', 'UPDATE'),
  'authenticated must not directly change a profile store assignment'
);
select pg_temp.assert_true(
  not has_column_privilege('authenticated', 'public.profiles', 'show_master_recipes', 'INSERT'),
  'authenticated must not self-grant master-recipe visibility during profile creation'
);
select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.app_users', 'SELECT')
  and not has_table_privilege('authenticated', 'public.app_users', 'INSERT')
  and not has_table_privilege('authenticated', 'public.app_users', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.app_users', 'DELETE'),
  'legacy password and security-question storage must be sealed from browser roles'
);

select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.admin_list_profiles_test()', 'EXECUTE'),
  'authenticated must not execute the profile diagnostics RPC'
);
select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.admin_get_login_logs_test(uuid)', 'EXECUTE'),
  'authenticated must not execute the login diagnostics RPC'
);
select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE'),
  'authenticated must not directly execute Auth trigger functions'
);
select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.update_profile_on_recipe_change()', 'EXECUTE'),
  'authenticated must not directly execute recipe trigger functions'
);
select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.log_user_login()', 'EXECUTE'),
  'authenticated must not directly execute login trigger functions'
);
select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.owns_recipe_tags(text[])', 'EXECUTE'),
  'anonymous callers must not execute ownership helpers'
);
select pg_temp.assert_true(
  pg_get_function_result('public.list_profiles_for_reference_share()'::regprocedure)
    = 'TABLE(id uuid, display_id text)',
  'share directory must expose only id and display_id'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and (
        has_table_privilege('anon', c.oid, 'SELECT')
        or has_table_privilege('anon', c.oid, 'INSERT')
        or has_table_privilege('anon', c.oid, 'UPDATE')
        or has_table_privilege('anon', c.oid, 'DELETE')
      )
  ),
  'anonymous callers must not have direct access to public tables'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname <> 'get_maintenance_mode'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  'anonymous callers must not execute privileged functions'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and not coalesce(p.proconfig, array[]::text[]) && array['search_path=public', 'search_path=public, pg_temp']
  ),
  'every security-definer function must pin its search_path'
);

select pg_temp.expect_admin_denied(
  $sql$select public.admin_set_role('11111111-1111-4111-8111-111111111111', 'admin')$sql$,
  'admin_set_role'
);
select pg_temp.expect_admin_denied(
  $sql$select public.admin_delete_user('11111111-1111-4111-8111-111111111111')$sql$,
  'admin_delete_user'
);
select pg_temp.expect_admin_denied(
  $sql$select public.admin_set_show_master_recipes('11111111-1111-4111-8111-111111111111', true)$sql$,
  'admin_set_show_master_recipes'
);
select pg_temp.expect_admin_denied(
  $sql$select public.admin_set_profile_store_name('11111111-1111-4111-8111-111111111111', 'FORGED STORE')$sql$,
  'admin_set_profile_store_name'
);
select pg_temp.expect_admin_denied(
  $sql$select public.admin_set_feature_flag('voice_input_enabled', true)$sql$,
  'admin_set_feature_flag'
);
select pg_temp.expect_admin_denied(
  $sql$select public.admin_copy_ingredient_master('11111111-1111-4111-8111-111111111111', true)$sql$,
  'admin_copy_ingredient_master'
);
select pg_temp.expect_admin_denied(
  $sql$select public.admin_copy_master_to_all_users('11111111-1111-4111-8111-111111111111')$sql$,
  'admin_copy_master_to_all_users'
);
select pg_temp.expect_admin_denied(
  $sql$select public.admin_clear_all_non_admin_ingredient_master()$sql$,
  'admin_clear_all_non_admin_ingredient_master'
);
select pg_temp.expect_admin_denied(
  $sql$select public.admin_clear_target_user_ingredient_master('11111111-1111-4111-8111-111111111111')$sql$,
  'admin_clear_target_user_ingredient_master'
);
select pg_temp.expect_admin_denied(
  $sql$select public.admin_clear_all_user_trash()$sql$,
  'admin_clear_all_user_trash'
);
select pg_temp.expect_admin_denied(
  $sql$select public.admin_save_backup('11111111-1111-4111-8111-111111111111', '{}'::jsonb, 0, 'forged')$sql$,
  'admin_save_backup'
);
select pg_temp.expect_admin_denied(
  $sql$select public.admin_list_all_backups()$sql$,
  'admin_list_all_backups'
);
select pg_temp.expect_admin_denied(
  $sql$select public.admin_list_profiles()$sql$,
  'admin_list_profiles'
);
select pg_temp.expect_admin_denied(
  $sql$select public.admin_get_login_logs('11111111-1111-4111-8111-111111111111')$sql$,
  'admin_get_login_logs'
);
select pg_temp.expect_admin_denied(
  $sql$select public.admin_write_audit_log('forged', null, '{}'::jsonb)$sql$,
  'admin_write_audit_log'
);
select pg_temp.expect_admin_denied(
  $sql$select public.get_user_recipe_counts()$sql$,
  'get_user_recipe_counts'
);

select pg_temp.assert_true(
  public.owns_recipe_tags(array['owner:11111111-1111-4111-8111-111111111111']),
  'single owner tag for the current user must be accepted'
);
select pg_temp.assert_true(
  not public.owns_recipe_tags(array[
    'owner:11111111-1111-4111-8111-111111111111',
    'owner:admin'
  ]),
  'multiple owner tags must be rejected'
);
select pg_temp.assert_true(
  not public.owns_recipe_tags(array['owner:22222222-2222-4222-8222-222222222222']),
  'another user owner tag must be rejected'
);

do $$
begin
  begin
    insert into public.material_costs (name, standard_cost, unit)
    values ('forged global cost', 1, 'g');
    raise exception 'normal-user global material cost write unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'app-data',
      '22222222-2222-4222-8222-222222222222/forged-security-test.json',
      '11111111-1111-4111-8111-111111111111'
    );
    raise exception 'cross-account app-data upload unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'recipe-images',
      'root-level-forged-security-test.jpg',
      '11111111-1111-4111-8111-111111111111'
    );
    raise exception 'unscoped recipe-image upload unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.profiles
    set role = 'admin'
    where id = '11111111-1111-4111-8111-111111111111';
    raise exception 'role escalation unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.profiles (id, display_id, role)
    values (
      '22222222-2222-4222-8222-222222222222',
      'security-admin-attempt',
      'admin'
    );
    raise exception 'explicit admin profile creation unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.admin_set_show_master_recipes(
      '11111111-1111-4111-8111-111111111111',
      true
    );
    raise exception 'non-admin master visibility grant unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.admin_copy_master_to_all_users(
      '11111111-1111-4111-8111-111111111111'
    );
    raise exception 'non-admin bulk master copy unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.get_user_recipe_counts();
    raise exception 'non-admin aggregate access unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.admin_list_profiles_test();
    raise exception 'diagnostic profile RPC unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.recipes (title, tags)
    values (
      'invalid owner security test',
      array[
        'owner:11111111-1111-4111-8111-111111111111',
        'owner:admin'
      ]
    );
    raise exception 'multiple-owner recipe insert unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

insert into public.recipes (title, tags)
values (
  'valid owner security test',
  array['owner:11111111-1111-4111-8111-111111111111']
);

select pg_temp.assert_true(
  exists (
    select 1 from public.recipes
    where title = 'valid owner security test'
  ),
  'a normal user must retain access to their own recipe'
);

reset role;

-- Positive administrator path plus safeguards that prevent an administrator
-- from deleting or demoting the active account.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '33333333-3333-4333-8333-333333333333',
    'authenticated', 'authenticated', 'security-admin@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_id":"security-admin"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '44444444-4444-4444-8444-444444444444',
    'authenticated', 'authenticated', 'security-delete@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_id":"security-delete"}'::jsonb,
    now(), now()
  );

update public.profiles
set role = 'admin'
where id = '33333333-3333-4333-8333-333333333333';

select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","email":"security-admin@example.invalid"}',
  true
);

set local role authenticated;

select pg_temp.expect_admin_denied(
  $sql$select public.admin_set_role('33333333-3333-4333-8333-333333333333', 'user')$sql$,
  'admin self-demotion'
);
select pg_temp.expect_admin_denied(
  $sql$select public.admin_delete_user('33333333-3333-4333-8333-333333333333')$sql$,
  'admin self-deletion'
);

do $$
begin
  begin
    perform public.admin_set_role(
      '11111111-1111-4111-8111-111111111111',
      'superadmin'
    );
    raise exception 'invalid role unexpectedly succeeded';
  exception
    when invalid_parameter_value then null;
  end;

  begin
    perform public.admin_set_profile_store_name(
      '11111111-1111-4111-8111-111111111111',
      repeat('x', 101)
    );
    raise exception 'oversized store assignment unexpectedly succeeded';
  exception
    when invalid_parameter_value then null;
  end;
end;
$$;

select public.admin_set_role(
  '11111111-1111-4111-8111-111111111111',
  'admin'
);
select public.admin_set_profile_store_name(
  '11111111-1111-4111-8111-111111111111',
  'SECURITY STORE'
);
select public.admin_set_show_master_recipes(
  '11111111-1111-4111-8111-111111111111',
  true
);
select public.admin_delete_user(
  '44444444-4444-4444-8444-444444444444'
);

reset role;

select pg_temp.assert_true(
  not exists (
    select 1 from auth.users
    where id = '44444444-4444-4444-8444-444444444444'
  ),
  'administrator deletion must remove the targeted Auth account'
);
select pg_temp.assert_true(
  (select count(*) = 4
   from public.admin_audit_logs
   where admin_id = '33333333-3333-4333-8333-333333333333'
     and target_id in (
       '11111111-1111-4111-8111-111111111111',
       '44444444-4444-4444-8444-444444444444'
     )),
  'successful administrator mutations must create atomic audit records'
);

rollback;
