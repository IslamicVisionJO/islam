-- Requires 006 and 014. Active sessions retain their original questions and receipts.
begin;
create or replace function public.million_start(p_unit text,p_lesson text,p_seconds int) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;rid uuid;qs jsonb;
begin
 u:=school_private.duel_identity();perform pg_advisory_xact_lock(hashtextextended(u::text,601));
 if p_unit is null or p_lesson is null or p_seconds is null
    or p_unit !~ '^(all|s1_all|(s1_)?u0[1-4])$'
    or p_lesson !~ '^(all|(s1_)?u0[1-4]_l[0-9]{2})$'
    or p_seconds not between 0 and 1800
    or (p_lesson <> 'all' and ((left(p_unit,3)='s1_') <> (left(p_lesson,3)='s1_')
        or (p_unit not in ('all','s1_all') and split_part(p_lesson,'_l',1) <> p_unit)))
 then raise exception 'invalid_million_settings';end if;
 update school_private.million_sessions set status='timeout' where user_id=u and status='active' and deadline<=clock_timestamp();
 select id into rid from school_private.million_sessions where user_id=u and status='active';
 if rid is not null then return school_private.million_snapshot(rid,u);end if;
 with candidates as (
   select data,random() as draw from school_private.scoped_educational_questions
   where 0=any(games) and (left(data->>'unit_id',3)='s1_')=(left(p_unit,3)='s1_')
    and (p_unit in ('all','s1_all') or data->>'unit_id'=p_unit)
    and (p_lesson='all' or data->>'lesson_id'=p_lesson)
 ), ranked as (
   select data,draw,row_number() over(partition by data->>'difficulty' order by draw) as ordinal from candidates
 ), picked as (
   select data,draw from ranked order by ordinal,draw limit 15
 )
 select jsonb_agg(data order by case data->>'difficulty' when 'easy' then 1 when 'medium' then 2 else 3 end,draw)
 into qs from picked;
 if coalesce(jsonb_array_length(qs),0) <> 15 then raise exception 'million_no_questions';end if;
 insert into school_private.million_sessions(user_id,unit_id,lesson_id,questions,deadline) values(u,p_unit,p_lesson,qs,case when p_seconds=0 then null else clock_timestamp()+make_interval(secs=>p_seconds) end) returning id into rid;
 return school_private.million_snapshot(rid,u);
end;$$;
commit;
