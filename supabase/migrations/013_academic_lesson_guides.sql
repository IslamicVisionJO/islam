begin;

create table if not exists school_private.academic_lesson_guides (
 lesson_id text primary key check (lesson_id ~ '^academic-s1-(u[1-3]-l0[1-6]|u4-l0[1-7])$'),
 outcome text not null check (char_length(btrim(outcome)) between 1 and 1200),
 overview text not null check (char_length(btrim(overview)) between 1 and 6000),
 practice text not null check (char_length(btrim(practice)) between 1 and 2400),
 revision bigint not null check (revision > 0)
);
alter table school_private.academic_lesson_guides enable row level security;
revoke all on school_private.academic_lesson_guides from public, anon, authenticated;

create or replace function public.academic_guide_list() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(lesson_id,
  jsonb_build_object('outcome',outcome,'overview',overview,'practice',practice,'revision',revision)), '{}'::jsonb)
 from school_private.academic_lesson_guides;
$$;

create or replace function public.academic_guide_save(
 p_lesson_id text, p_outcome text, p_overview text, p_practice text, p_revision bigint
) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not school_private.is_admin() then
  raise exception 'academic_admin_required' using errcode='42501';
 end if;
 if p_revision=0 then
  insert into school_private.academic_lesson_guides (lesson_id,outcome,overview,practice,revision)
  values (p_lesson_id,btrim(p_outcome),btrim(p_overview),btrim(p_practice),1)
  on conflict (lesson_id) do nothing;
 else
  update school_private.academic_lesson_guides
     set outcome=btrim(p_outcome), overview=btrim(p_overview), practice=btrim(p_practice), revision=revision+1
   where lesson_id=p_lesson_id and revision=p_revision;
 end if;
 if not found then
  raise exception 'academic_edit_conflict' using errcode='40001';
 end if;
end;
$$;

revoke all on function public.academic_guide_list(), public.academic_guide_save(text,text,text,text,bigint)
 from public, anon, authenticated;
grant execute on function public.academic_guide_list() to anon, authenticated;
grant execute on function public.academic_guide_save(text,text,text,text,bigint) to authenticated;
commit;
