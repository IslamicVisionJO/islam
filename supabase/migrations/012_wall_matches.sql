-- Adds private two-player rooms to the existing Wall Race service.
begin;
create table if not exists school_private.wall_matches(
 id uuid primary key default gen_random_uuid(),
 code text not null unique,
 host_id uuid not null references auth.users(id) on delete cascade,
 guest_id uuid references auth.users(id) on delete cascade,
 questions jsonb not null, level text not null, unit_id text not null, lesson_id text not null,
 status text not null default 'waiting' check(status in ('waiting','active','completed','cancelled')),
 created_at timestamptz not null default clock_timestamp(), deadline timestamptz,
 winner_id uuid, reason text
);
alter table school_private.wall_matches enable row level security;
revoke all on school_private.wall_matches from public,anon,authenticated;
alter table school_private.wall_rounds add column if not exists match_id uuid references school_private.wall_matches(id) on delete cascade;
create unique index if not exists wall_one_round_per_player_match on school_private.wall_rounds(match_id,user_id) where match_id is not null;
create index if not exists wall_match_host_recent on school_private.wall_matches(host_id,created_at desc);
create index if not exists wall_match_guest_recent on school_private.wall_matches(guest_id,created_at desc);

-- Keep the original round engine private. The solo RPCs may only reach independent rounds.
do $$begin
 if to_regprocedure('school_private.wall_act(uuid,text,text,text)') is null then
  alter function public.wall_act(uuid,text,text,text) set schema school_private;
 end if;
 if to_regprocedure('school_private.wall_start(text,text,text)') is null then
  alter function public.wall_start(text,text,text) set schema school_private;
 end if;
end;$$;
revoke all on function school_private.wall_act(uuid,text,text,text),school_private.wall_start(text,text,text) from public,anon,authenticated;

create or replace function school_private.wall_close_expired(p_user uuid,p_now timestamptz) returns void
language plpgsql set search_path='' as $$
declare m school_private.wall_matches; a int; b int;
begin
 for m in select * from school_private.wall_matches where status in ('waiting','active')
   and p_user in (host_id,guest_id)
   and ((status='waiting' and created_at<=p_now-interval '10 minutes') or (status='active' and deadline<=p_now))
   for update
 loop
  if m.status='waiting' then
   update school_private.wall_matches set status='cancelled',reason='expired' where id=m.id;
  else
   update school_private.wall_rounds set phase='finished',finished_at=m.deadline,reason='match-time'
    where match_id=m.id and finished_at is null;
   select score into a from school_private.wall_rounds where match_id=m.id and user_id=m.host_id;
   select score into b from school_private.wall_rounds where match_id=m.id and user_id=m.guest_id;
   update school_private.wall_matches set status='completed',reason='timeout',
    winner_id=case when a>b then m.host_id when b>a then m.guest_id end where id=m.id;
  end if;
 end loop;
end;$$;
revoke all on function school_private.wall_close_expired(uuid,timestamptz) from public,anon,authenticated;

create or replace function public.wall_start(p_level text,p_unit text,p_lesson text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid;
begin
 u:=school_private.duel_identity();
 perform pg_advisory_xact_lock(hashtextextended(u::text,811));
 perform school_private.wall_close_expired(u,clock_timestamp());
 if exists(select 1 from school_private.wall_matches where status in ('waiting','active') and u in (host_id,guest_id)) then
  raise exception 'wall_match_already_open';
 end if;
 return school_private.wall_start(p_level,p_unit,p_lesson);
end;
$$;

create or replace function public.wall_act(p_id uuid,p_action text,p_question text default null,p_option text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; rid uuid;
begin
 u:=school_private.duel_identity();
 if p_id is null and p_action<>'state' then raise exception 'wall_round_required';end if;
 select id into rid from school_private.wall_rounds where user_id=u and match_id is null and
  (id=p_id or (p_id is null and finished_at is null)) order by created_at desc limit 1;
 if rid is null then
  if p_id is null then return null;end if;
  raise exception 'wall_round_unavailable' using errcode='42501';
 end if;
 return school_private.wall_act(rid,p_action,p_question,p_option);
end;
$$;

create or replace function public.wall_match(
 p_action text, p_id uuid default null,p_code text default null,
 p_level text default 'medium',p_unit text default 'all',p_lesson text default 'all',
 p_move text default 'state',p_question text default null,p_option text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid; t timestamptz; m school_private.wall_matches; a school_private.wall_rounds; b school_private.wall_rounds;
 qs jsonb; invite text; tries int; start_at timestamptz; state jsonb; speed numeric; other uuid;
begin
 u:=school_private.duel_identity();t:=clock_timestamp();
 if p_action is null or p_action not in ('create','join','state','play','leave') then raise exception 'wall_invalid_action'; end if;
 -- Only creation/joining need to serialize against another round started by this user.
 if p_action in ('create','join') then perform pg_advisory_xact_lock(hashtextextended(u::text,811));end if;
 perform school_private.wall_close_expired(u,t);
 if p_action='create' then
  if p_level is null or p_level not in ('easy','medium','hard') or p_unit is null or p_unit !~ '^(all|u0[1-4])$'
   or p_lesson is null or (p_lesson<>'all' and not exists(select 1 from school_private.wall_lessons where id=p_lesson and (p_unit='all' or left(id,3)=p_unit)))
   then raise exception 'wall_invalid_scope';end if;
  if exists(select 1 from school_private.wall_matches where status in ('waiting','active') and u in (host_id,guest_id))
   then raise exception 'wall_match_already_open';end if;
  if exists(select 1 from school_private.wall_rounds where user_id=u and finished_at is null)
   then raise exception 'wall_solo_already_open';end if;
  select jsonb_agg(jsonb_set(to_jsonb(q)-'enabled'-'priority'-'rnd','{options}',
   (select jsonb_agg(o order by random()) from jsonb_array_elements(q.options) o)) order by priority,rnd) into qs
   from (select w.*,case when difficulty=p_level then 0 when difficulty='medium' then 1 else 2 end priority,random() rnd
   from school_private.wall_questions w where enabled and (p_unit='all' or left(lesson_id,3)=p_unit)
   and (p_lesson='all' or lesson_id=p_lesson) order by priority,rnd limit 20) q;
  if qs is null then raise exception 'wall_no_questions';end if;
  for tries in 1..5 loop
   invite:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
   insert into school_private.wall_matches(code,host_id,questions,level,unit_id,lesson_id)
    values(invite,u,qs,p_level,p_unit,p_lesson) on conflict(code) do nothing returning * into m;
   if found then exit;end if;
  end loop;
  if m.id is null then raise exception 'wall_invite_unavailable';end if;
 elsif p_action='join' then
  invite:=upper(btrim(coalesce(p_code,'')));
  if invite !~ '^[0-9A-F]{8}$' then raise exception 'wall_invalid_code';end if;
  if exists(select 1 from school_private.wall_matches where status in ('waiting','active') and u in (host_id,guest_id))
   then raise exception 'wall_match_already_open';end if;
  if exists(select 1 from school_private.wall_rounds where user_id=u and finished_at is null)
   then raise exception 'wall_solo_already_open';end if;
  select * into m from school_private.wall_matches where code=invite for update;
  if not found or m.status<>'waiting' or m.host_id=u or m.created_at<=clock_timestamp()-interval '10 minutes'
    then raise exception 'wall_invite_unavailable';end if;
  t:=clock_timestamp();start_at:=t+interval '3 seconds';
  speed:=case m.level when 'easy' then .034 when 'medium' then .046 else .06 end;
  insert into school_private.wall_rounds(user_id,questions,level,unit_id,lesson_id,speed,mark,match_id)
   select player,m.questions,m.level,m.unit_id,m.lesson_id,speed,start_at,m.id from unnest(array[m.host_id,u]) player;
  update school_private.wall_matches set guest_id=u,status='active',deadline=start_at+interval '90 seconds'
   where id=m.id returning * into m;
 else
  if p_id is null and p_action<>'state' then raise exception 'wall_round_required';end if;
  select * into m from school_private.wall_matches where u in (host_id,guest_id) and
   (id=p_id or p_id is null) order by created_at desc limit 1 for update;
  if not found then
   if p_id is null then return null;end if;
   raise exception 'wall_round_unavailable' using errcode='42501';
  end if;
 end if;
 t:=clock_timestamp();
 if m.status='active' and m.deadline<=t then
  perform school_private.wall_close_expired(u,t);
  select * into m from school_private.wall_matches where id=m.id;
 end if;
 if p_action='leave' then
  if m.status='waiting' then
   update school_private.wall_matches set status='cancelled',reason='cancelled' where id=m.id returning * into m;
  elsif m.status='active' then
   update school_private.wall_rounds set phase='finished',finished_at=t,reason='match-forfeit' where match_id=m.id and finished_at is null;
   update school_private.wall_matches set status='completed',reason='forfeit',
    winner_id=case when u=m.host_id then m.guest_id else m.host_id end where id=m.id returning * into m;
  end if;
 end if;
 if m.status='active' then
  if p_action='play' and (p_move is null or p_move not in ('state','answer','next')) then raise exception 'wall_invalid_action';end if;
  select * into a from school_private.wall_rounds where match_id=m.id and user_id=u;
  if a.finished_at is null then
   state:=school_private.wall_act(a.id,case when p_action='play' then p_move else 'state' end,p_question,p_option);
  end if;
  select * into a from school_private.wall_rounds where match_id=m.id and user_id=u;
  select * into b from school_private.wall_rounds where match_id=m.id and user_id<>u;
  if a.finished_at is not null and b.finished_at is not null then
   update school_private.wall_matches set status='completed',reason='played',
    winner_id=case when a.score>b.score then a.user_id when b.score>a.score then b.user_id end
    where id=m.id returning * into m;
  end if;
 end if;
 if m.guest_id is not null then
  select * into a from school_private.wall_rounds where match_id=m.id and user_id=u;
  select * into b from school_private.wall_rounds where match_id=m.id and user_id<>u;
  state:=school_private.wall_snapshot(a,clock_timestamp());
 end if;
 other:=case when u=m.host_id then m.guest_id else m.host_id end;
 return jsonb_build_object('id',m.id,'code',m.code,'status',m.status,'reason',m.reason,'deadline',m.deadline,
  'serverNow',clock_timestamp(),'winner',case when m.status<>'completed' then null when m.winner_id is null then 'tie' when m.winner_id=u then 'you' else 'opponent' end,
  'opponent',(select case when display_name like '%@%' then 'لاعب' else left(display_name,64) end from public.student_profiles where id=other),
  'opponentScore',coalesce(b.score,0),'opponentFinished',b.finished_at is not null,'round',state);
end;
$$;

-- Head-to-head results have their own room record and don't perturb the solo ranking.
create or replace function public.wall_board(p_period text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare cutoff timestamptz;
begin
 cutoff:=case p_period when 'day' then date_trunc('day',now() at time zone 'Asia/Amman') at time zone 'Asia/Amman'
 when 'week' then date_trunc('week',now() at time zone 'Asia/Amman') at time zone 'Asia/Amman'
 when 'all' then '-infinity'::timestamptz else null end;
 if cutoff is null then raise exception 'wall_invalid_period';end if;
 if not exists(select 1 from school_private.wall_questions) then raise exception 'wall_no_questions';end if;
 return coalesce((select jsonb_agg(to_jsonb(r) order by rank) from (
  select row_number() over(order by score desc,accuracy desc,elapsed desc,finished_at asc) rank,name,score,accuracy,round(elapsed,1) elapsed
  from (
   select distinct on (w.user_id) w.score,w.elapsed,w.finished_at,
    case when s.display_name is null or s.display_name like '%@%' then 'طالب' else left(s.display_name,64) end name,
    round(100.0*w.correct/greatest(1,jsonb_array_length(w.receipts)),1) accuracy
   from school_private.wall_rounds w join public.student_profiles s on s.id=w.user_id
   join public.allowed_accounts a on a.email=lower(btrim(s.email)) and a.enabled
   where w.match_id is null and not hidden and reason in ('complete','danger') and score>0 and finished_at>=cutoff
   order by w.user_id,w.score desc,accuracy desc,w.elapsed desc,w.finished_at asc
  ) best order by rank limit 20
 ) r),'[]'::jsonb);
end;
$$;

revoke all on function public.wall_match(text,uuid,text,text,text,text,text,text,text),public.wall_start(text,text,text),public.wall_act(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.wall_match(text,uuid,text,text,text,text,text,text,text),public.wall_start(text,text,text),public.wall_act(uuid,text,text,text) to authenticated;
commit;
