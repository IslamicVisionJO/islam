-- Install after 004_online_duels.sql, then install 015_arcade_bank.sql.
begin;
create table if not exists school_private.arcade_bank(id text primary key,lesson text not null,level text not null,question jsonb not null,enabled boolean default true not null);
create table if not exists school_private.arcade_rooms(
 id uuid primary key default gen_random_uuid(), code text not null unique, owner_id uuid not null references auth.users(id),
 game text not null,level text not null,lessons text[] not null,seconds int not null,capacity int not null,mode text not null,public_queue boolean not null,
 seed int not null,deck jsonb not null,status text not null default 'waiting',created_at timestamptz default now(),starts timestamptz,deadline timestamptz);
create table if not exists school_private.arcade_players(
 room uuid references school_private.arcade_rooms(id) on delete cascade,uid uuid references auth.users(id),slot int not null,name text not null,
 ready boolean not null default false,seen timestamptz default now(),last_seq int not null default 0,last_tick int not null default -1,
 answers jsonb not null default '{}',left_room boolean not null default false, skill int not null default 0,primary key(room,uid),unique(room,slot));
create table if not exists school_private.arcade_events(
 room uuid not null,uid uuid not null,seq int not null,tick int not null,action text not null,value jsonb not null,
 primary key(room,uid,seq),foreign key(room,uid) references school_private.arcade_players(room,uid) on delete cascade);
create index if not exists arcade_players_lookup on school_private.arcade_players(uid,room);
create table if not exists school_private.arcade_disabled(game text primary key);
alter table school_private.arcade_rooms enable row level security;
alter table school_private.arcade_players enable row level security;
alter table school_private.arcade_events enable row level security;
alter table school_private.arcade_bank enable row level security;
alter table school_private.arcade_disabled enable row level security;
revoke all on school_private.arcade_rooms,school_private.arcade_players,school_private.arcade_events,school_private.arcade_bank,school_private.arcade_disabled from public,anon,authenticated;

create or replace function public.arcade_room(p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare u uuid:=school_private.duel_identity(); r school_private.arcade_rooms%rowtype; me school_private.arcade_players%rowtype;
 rid uuid; game text:=p_data->>'game'; lvl text:=p_data->>'level'; duration int; capacity int; mode text;
 scope text[]; deck jsonb; t timestamptz:=clock_timestamp(); tick_now int; slot int; idx int; item jsonb; s int; et int; act text; val jsonb; current_question jsonb;
begin
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>24000 then raise exception 'invalid_settings';end if;
 if p_action='admin' then
  if not school_private.is_admin() then raise exception 'administrator_required' using errcode='42501';end if;
  if p_data?'enabled' then
   if game not in ('blocks','space','tiles','bubbles') or game is null then raise exception 'invalid_game';end if;
   if (p_data->>'enabled')::boolean then delete from school_private.arcade_disabled where arcade_disabled.game=p_data->>'game';
   else insert into school_private.arcade_disabled values(game) on conflict do nothing;end if;
  end if;
  if p_data?'question' then update school_private.arcade_bank set enabled=(p_data->>'questionEnabled')::boolean where id=p_data->>'question';end if;
  return jsonb_build_object('disabled',(select coalesce(jsonb_agg(d.game),'[]') from school_private.arcade_disabled d),'rooms',(select count(*) from school_private.arcade_rooms),'players',(select count(distinct uid) from school_private.arcade_players));
 end if;
 if p_action='ranking' then
  return coalesce((select jsonb_agg(to_jsonb(z)) from (select p.name,sum(p.skill+100*(select count(*) from jsonb_each(p.answers) a where (a.value->>'correct')::boolean)) as points,count(*) as matches from school_private.arcade_players p join school_private.arcade_rooms rm on rm.id=p.room where rm.status='finished' and not p.left_room and rm.created_at>=case p_data->>'period' when 'week' then t-interval '7 days' when 'month' then t-interval '30 days' else '-infinity'::timestamptz end group by p.uid,p.name order by points desc limit 50) z),'[]');
 end if;
 if p_action='history' then
  return coalesce((select jsonb_agg(to_jsonb(z)) from(select rm.id,rm.game,rm.status,rm.created_at,p.skill,p.left_room from school_private.arcade_players p join school_private.arcade_rooms rm on rm.id=p.room where p.uid=u order by rm.created_at desc limit 30)z),'[]');end if;
 if p_action in ('create','random','join') then
  perform pg_advisory_xact_lock(hashtextextended('arcade-rooms',0));
  update school_private.arcade_rooms set status='expired' where status='waiting' and created_at<t-interval '15 minutes';
  select rm.id into rid from school_private.arcade_players p join school_private.arcade_rooms rm on rm.id=p.room where p.uid=u and not p.left_room and (rm.status='waiting' or rm.status='playing' and rm.deadline>t) limit 1;
  if rid is null and p_action in ('create','random') then
   duration:=(p_data->>'duration')::int;capacity:=coalesce((p_data->>'capacity')::int,2);mode:=coalesce(p_data->>'mode','versus');
   select array_agg(distinct x order by x) into scope from jsonb_array_elements_text(p_data->'lessons') x;
   if game is null or game not in ('blocks','space','bubbles','tiles') or lvl is null or lvl not in ('easy','medium','hard') or duration is null or duration not between 30 and 300 or capacity not between 2 and 4 or mode not in ('versus','coop') or (mode='coop' and (game<>'space' or capacity<>2)) or coalesce(cardinality(scope),0) not between 1 and 51 then raise exception 'invalid_settings';end if;
   if exists(select 1 from school_private.arcade_disabled d where d.game=p_data->>'game') then raise exception 'game_disabled';end if;
   if p_action='random' then select rm.id into rid from school_private.arcade_rooms rm where rm.public_queue and rm.status='waiting' and rm.game=p_data->>'game' and rm.level=lvl and rm.lessons=scope and rm.seconds=duration and rm.capacity=capacity and rm.mode=coalesce(p_data->>'mode','versus') and (select count(*) from school_private.arcade_players p where p.room=rm.id)<capacity order by rm.created_at limit 1;end if;
   if rid is null then
    if (select count(*) from school_private.arcade_rooms where owner_id=u and created_at>t-interval '1 hour')>=30 then raise exception 'room_rate_limit';end if;
    select jsonb_agg(x.question order by x.draw) into deck from(select b.question,random() draw from school_private.arcade_bank b where b.enabled and b.lesson=any(scope) and b.level=lvl order by draw limit greatest(1,duration/30))x;
    if coalesce(jsonb_array_length(deck),0)<greatest(1,duration/30) then raise exception 'insufficient_questions';end if;
    insert into school_private.arcade_rooms(code,owner_id,game,level,lessons,seconds,capacity,mode,public_queue,seed,deck) values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),u,game,lvl,scope,duration,capacity,mode,p_action='random',(random()*2147483646)::int,deck) returning id into rid;
   end if;
  elsif rid is null then select id into rid from school_private.arcade_rooms where code=upper(trim(p_data->>'code')) and status='waiting';end if;
  if rid is null then raise exception 'room_not_found';end if;
 else rid:=(p_data->>'room')::uuid;end if;
 select * into strict r from school_private.arcade_rooms where id=rid for update;
 select * into me from school_private.arcade_players p where p.room=rid and p.uid=u;
 if me.uid is null then
  if p_action not in ('create','random','join') or r.status<>'waiting' then raise exception 'room_not_found';end if;
  select min(n) into slot from generate_series(0,r.capacity-1)n where not exists(select 1 from school_private.arcade_players p where p.room=rid and p.slot=n);
  if slot is null then raise exception 'room_full';end if;
  insert into school_private.arcade_players(room,uid,slot,name) select rid,u,slot,coalesce((select display_name from public.student_profiles where id=u),'لاعب') returning * into me;
 end if;
 if r.status='waiting' and r.created_at<t-interval '15 minutes' then r.status:='expired';update school_private.arcade_rooms set status=r.status where id=rid;end if;
 tick_now:=floor(extract(epoch from(t-r.starts))*60)::int;
 if p_action='ready' and r.status='waiting' then
  update school_private.arcade_players set ready=true where room=rid and uid=u;
  if (select count(*) from school_private.arcade_players p where p.room=rid and p.ready)=r.capacity then
   update school_private.arcade_rooms set starts=t+interval '3 seconds',deadline=t+interval '3 seconds'+make_interval(secs=>r.seconds),status='playing' where id=rid returning * into r;
  end if;
 elsif p_action='leave' and r.status in ('waiting','playing') then
  update school_private.arcade_players set left_room=true where room=rid and uid=u;
  if r.status='waiting' then update school_private.arcade_rooms set status='cancelled' where id=rid returning * into r;end if;
 elsif p_action='input' then
  if r.status<>'playing' or me.left_room or t>r.deadline+interval '1 second' or jsonb_typeof(p_data->'events')<>'array' or jsonb_array_length(p_data->'events')>60 then raise exception 'invalid_input';end if;
  for item in select value from jsonb_array_elements(p_data->'events') loop
   s:=(item->>'seq')::int;et:=(item->>'tick')::int;act:=item->>'action';val:=item->'value';
   if s<=me.last_seq then continue;end if;
   if s is null or et is null or act is null or val is null or s<>me.last_seq+1 or et<greatest(0,me.last_tick,tick_now-120) or et>least(tick_now+12,r.seconds*60-1) or s>r.seconds*35 then raise exception 'invalid_input';end if;
   if not (act=any(case r.game when 'tiles' then array['lane0','lane1','lane2','lane3'] when 'blocks' then array['left','right','rotate','drop','hold','down'] when 'space' then array['left','right','fire'] else array['left','right','aim','shoot'] end)) then raise exception 'invalid_action';end if;
   if act='aim' then if jsonb_typeof(val)<>'object' or not (val?'x' and val?'y') or (val->>'x')::float not between 0 and 1 or (val->>'y')::float not between 0 and 1 then raise exception 'invalid_aim';end if;
   elsif jsonb_typeof(val)<>'boolean' then raise exception 'invalid_button';end if;
   if (select count(*) from school_private.arcade_events e where e.room=rid and e.uid=u and e.tick=et)>=8 then raise exception 'input_rate';end if;
   insert into school_private.arcade_events values(rid,u,s,et,act,val);me.last_seq:=s;me.last_tick:=et;
  end loop;
  update school_private.arcade_players set last_seq=me.last_seq,last_tick=me.last_tick where room=rid and uid=u;
 elsif p_action='answer' then
  idx:=(p_data->>'index')::int;s:=(p_data->>'choice')::int;
  if r.status<>'playing' or me.left_room or idx is null or s is null or s not between 0 and 3 or idx not between 0 and jsonb_array_length(r.deck)-1 or tick_now not between (idx*30+19)*60 and (idx*30+29)*60-1 then raise exception 'answer_window_closed';end if;
  if not(me.answers?idx::text) then update school_private.arcade_players set answers=answers||jsonb_build_object(idx::text,jsonb_build_object('choice',s,'correct',s=(r.deck->idx->>'correct')::int)) where room=rid and uid=u;end if;
 elsif p_action not in ('state','ready','leave','create','random','join') then raise exception 'unknown_action';end if;
 update school_private.arcade_players set seen=t where room=rid and uid=u;
 idx:=greatest(0,coalesce(tick_now,0))/1800;
 if tick_now>=0 and tick_now%1800>=1140 and idx<jsonb_array_length(r.deck) then current_question:=(r.deck->idx)-'correct'-'explanation';end if;
 return jsonb_build_object('id',rid,'code',r.code,'status',r.status,'game',r.game,'level',r.level,'mode',r.mode,'capacity',r.capacity,'seed',r.seed,'seconds',r.seconds,'starts',r.starts,'deadline',r.deadline,'now',t,'slot',me.slot,'index',idx,'question',current_question,
 'players',(select jsonb_agg(jsonb_build_object('slot',p.slot,'name',p.name,'ready',p.ready,'seen',p.seen,'left',p.left_room,'skill',p.skill,'answers',case when r.status='finished' or tick_now>=r.seconds*60 then p.answers else (select coalesce(jsonb_object_agg(a.key,a.value),'{}') from jsonb_each(p.answers)a where a.key::int<idx or (a.key::int=idx and tick_now%1800>=1740) or p.uid=u) end,'lastSeq',p.last_seq) order by p.slot) from school_private.arcade_players p where p.room=rid),
 'events',(select coalesce(jsonb_agg(jsonb_build_object('slot',p.slot,'seq',e.seq,'tick',e.tick,'action',e.action,'value',e.value) order by e.tick,p.slot,e.seq),'[]') from school_private.arcade_events e join school_private.arcade_players p using(room,uid) where e.room=rid and e.seq>coalesce((p_data->'since'->>p.slot)::int,0)),
 'review',case when r.status='finished' then r.deck end);
end;$$;
revoke all on function public.arcade_room(text,jsonb) from public,anon;
grant execute on function public.arcade_room(text,jsonb) to authenticated;
create or replace function public.arcade_verify_commit(p_room uuid,p_scores jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r school_private.arcade_rooms%rowtype; p record; points int;
begin
 select * into strict r from school_private.arcade_rooms where id=p_room for update;
 if r.status='finished' then return jsonb_build_object('verified',true);end if;
 if r.status<>'playing' or clock_timestamp()<r.deadline+interval '1 second' then raise exception 'match_in_progress';end if;
 if jsonb_typeof(p_scores)<>'array' or jsonb_array_length(p_scores)<>r.capacity then raise exception 'invalid_scores';end if;
 for p in select * from school_private.arcade_players where room=p_room loop
  points:=(p_scores->>p.slot)::int;
  if points is null or points<0 then raise exception 'invalid_scores';end if;
  update school_private.arcade_players set skill=case when p.left_room then 0 else points end where uid=p.uid and room=p_room;
 end loop;
 update school_private.arcade_rooms set status='finished' where id=p_room;
 return jsonb_build_object('verified',true);
end;$$;
revoke all on function public.arcade_verify_commit(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.arcade_verify_commit(uuid,jsonb) to service_role;
commit;
