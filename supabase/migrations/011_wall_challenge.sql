begin;
create table if not exists school_private.wall_lessons(
 id text primary key, first_page int not null, last_page int not null
);
create table if not exists school_private.wall_questions(
 id text primary key, lesson_id text not null references school_private.wall_lessons(id),
 difficulty text not null check(difficulty in ('easy','medium','hard')),
 prompt text not null, options jsonb not null, correct_id text not null, explanation text not null,
 page int not null, enabled boolean not null default true
);
create table if not exists school_private.wall_rounds(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 questions jsonb not null, level text not null, unit_id text not null, lesson_id text not null,
 phase text not null default 'playing', position int not null default 0, score int not null default 0,
 streak int not null default 0, best int not null default 0, correct int not null default 0,
 height numeric not null default 0.1, speed numeric not null, elapsed numeric not null default 0,
 mark timestamptz not null, freeze_until timestamptz, created_at timestamptz not null default clock_timestamp(),
 finished_at timestamptz, reason text, hidden boolean not null default false,
 receipts jsonb not null default '[]'
);
create unique index if not exists wall_one_open_round on school_private.wall_rounds(user_id) where finished_at is null;
create index if not exists wall_rank_results on school_private.wall_rounds(finished_at,user_id,score desc) where not hidden and reason in ('danger','complete');
alter table school_private.wall_lessons enable row level security;
alter table school_private.wall_questions enable row level security;
alter table school_private.wall_rounds enable row level security;
revoke all on school_private.wall_rounds,school_private.wall_questions,school_private.wall_lessons from public,anon,authenticated;

create or replace function school_private.wall_snapshot(r school_private.wall_rounds,t timestamptz) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'phase',r.phase,'index',r.position,'total',jsonb_array_length(r.questions),
 'level',r.level,'unit',r.unit_id,'lesson',r.lesson_id,'score',r.score,'streak',r.streak,'best',r.best,'correct',r.correct,
 'height',r.height,'speed',r.speed,'elapsed',r.elapsed,'reason',r.reason,
 'delay',greatest(0,extract(epoch from r.mark-t)),
 'freeze',coalesce(greatest(0,extract(epoch from r.freeze_until-t)),0),
 'question',case when r.phase='playing' then (r.questions->r.position)-'correct_id'-'explanation' else null end,
 'feedback',case when r.phase='feedback' then r.receipts->-1 else null end,
 'receipts',case when r.phase='finished' then r.receipts else null end,
 'personalBest',case when r.phase='finished' then greatest(r.score,coalesce((select max(score) from school_private.wall_rounds where user_id=r.user_id and reason in ('complete','danger') and not hidden),0)) end);
$$;
revoke all on function school_private.wall_snapshot(school_private.wall_rounds,timestamptz) from public,anon,authenticated;

create or replace function public.wall_start(p_level text,p_unit text,p_lesson text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; r school_private.wall_rounds; qs jsonb; t timestamptz;
begin
 u:=school_private.duel_identity();
 if p_level is null or p_level not in ('easy','medium','hard') or p_unit is null or p_unit !~ '^(all|u0[1-4])$'
 or p_lesson is null or (p_lesson<>'all' and not exists(select 1 from school_private.wall_lessons where id=p_lesson and (p_unit='all' or left(id,3)=p_unit))) then
  raise exception 'wall_invalid_scope';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,811));
 t:=clock_timestamp();
 update school_private.wall_rounds set phase='finished',finished_at=t,reason='abandoned'
  where user_id=u and finished_at is null and created_at<t-interval '2 hours';
 select * into r from school_private.wall_rounds where user_id=u and finished_at is null;
 if found then return school_private.wall_snapshot(r,t); end if;
 -- Difficulty preference is explicit; where it is missing only the selected scope can supply alternatives.
 select jsonb_agg(jsonb_set(to_jsonb(q)-'enabled'-'priority'-'rnd','{options}',
     (select jsonb_agg(o order by random()) from jsonb_array_elements(q.options) o)) order by priority,rnd) into qs from
  (select w.*,case when difficulty=p_level then 0 when difficulty='medium' then 1 else 2 end priority,random() rnd
   from school_private.wall_questions w where enabled
    and (p_unit='all' or left(lesson_id,3)=p_unit) and (p_lesson='all' or lesson_id=p_lesson)
   order by priority,rnd limit 40) q;
 if qs is null then raise exception 'wall_no_questions';end if;
 insert into school_private.wall_rounds(user_id,questions,level,unit_id,lesson_id,speed,mark)
  values(u,qs,p_level,p_unit,p_lesson,case p_level when 'easy' then .034 when 'medium' then .046 else .06 end,t+interval '3 seconds') returning * into r;
 return school_private.wall_snapshot(r,t);
end;
$$;

create or replace function public.wall_act(p_id uuid,p_action text,p_question text default null,p_option text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; r school_private.wall_rounds; t timestamptz; dt numeric; moving numeric; q jsonb; ok boolean; remaining numeric;
begin
 u:=school_private.duel_identity();
 if p_action is null or p_action not in ('state','answer','next','pause','resume','exit') then raise exception 'wall_invalid_action';end if;
 if p_id is null and p_action<>'state' then raise exception 'wall_round_required';end if;
 select * into r from school_private.wall_rounds
  where user_id=u and (id=p_id or (p_id is null and finished_at is null)) order by created_at desc limit 1 for update;
 if not found then
  if p_id is null then return null;end if;
  raise exception 'wall_round_unavailable' using errcode='42501';
 end if;
 t:=clock_timestamp();
 if r.finished_at is not null then return school_private.wall_snapshot(r,t);end if;
 if t-r.created_at>interval '2 hours' then
  r.phase:='finished';r.finished_at:=t;r.reason:='abandoned';
 elsif r.phase='playing' and t>=r.mark then
  dt:=extract(epoch from t-r.mark);
  moving:=greatest(0,extract(epoch from t-greatest(r.mark,coalesce(r.freeze_until,r.mark))));
  remaining:=(1-r.height)/r.speed;
  r.elapsed:=r.elapsed+dt-greatest(0,moving-remaining);
  r.height:=least(1,r.height+moving*r.speed);
  r.mark:=t;
  if r.height>=1 then r.phase:='finished';r.finished_at:=t;r.reason:='danger';end if;
 end if;
 if r.finished_at is null and p_action='answer' and r.phase='playing' and t>=r.mark then
  q:=r.questions->r.position;
  if q->>'id'=p_question and exists(select 1 from jsonb_array_elements(q->'options') o where o->>'id'=p_option) then
   ok:=q->>'correct_id'=p_option;
   r.receipts:=r.receipts||jsonb_build_object('id',p_question,'prompt',q->>'prompt','choice',p_option,
     'answer',(select o->>'text' from jsonb_array_elements(q->'options') o where o->>'id'=q->>'correct_id'),
     'explanation',q->>'explanation','page',q->>'page','correct',ok);
   if ok then
    r.correct:=r.correct+1;r.streak:=r.streak+1;r.best:=greatest(r.best,r.streak);
    r.score:=r.score+100+case r.streak when 3 then 50 when 5 then 100 else 0 end;
    r.speed:=greatest(least(.063,.018+r.correct*.0012),r.speed*.85);
    r.height:=greatest(.03,r.height-.085-case when r.streak=5 then .13 else 0 end);
   else
    r.streak:=0;r.speed:=least(.14,r.speed*1.10);r.height:=least(.99,r.height+.032);
   end if;
   r.freeze_until:=null;r.phase:='feedback';
  end if;
 elsif r.finished_at is null and p_action='next' and r.phase='feedback' then
  if r.position+1>=jsonb_array_length(r.questions) then
   r.phase:='finished';r.finished_at:=t;r.reason:='complete';
  else
   r.position:=r.position+1;r.phase:='playing';r.mark:=t;
   if r.streak=10 then r.freeze_until:=t+interval '3 seconds';end if;
  end if;
 elsif r.finished_at is null and p_action='pause' and r.phase='playing' then
  r.phase:='paused';r.mark:=t;
 elsif r.finished_at is null and p_action='resume' and r.phase='paused' then
  remaining:=coalesce(greatest(0,extract(epoch from r.freeze_until-r.mark)),0);
  r.phase:='playing';r.mark:=t+interval '3 seconds';
  r.freeze_until:=case when remaining>0 then r.mark+make_interval(secs=>remaining::double precision) end;
 elsif r.finished_at is null and p_action='exit' then
  r.phase:='finished';r.finished_at:=t;r.reason:='abandoned';
 end if;
 update school_private.wall_rounds set phase=r.phase,position=r.position,score=r.score,streak=r.streak,best=r.best,
 correct=r.correct,height=r.height,speed=r.speed,elapsed=r.elapsed,mark=r.mark,freeze_until=r.freeze_until,
 finished_at=r.finished_at,reason=r.reason,receipts=r.receipts where id=r.id;
 return school_private.wall_snapshot(r,t);
end;
$$;

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
   where not hidden and reason in ('complete','danger') and score>0 and finished_at>=cutoff
   order by w.user_id,w.score desc,accuracy desc,w.elapsed desc,w.finished_at asc
  ) best order by rank limit 20
 ) r),'[]'::jsonb);
end;
$$;

create or replace function public.wall_admin(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare code text; lesson text; diff text; stem text; why text; opts jsonb; answer text; page_no int; allowed boolean;
begin
 if not school_private.is_admin() then raise exception 'wall_admin_required' using errcode='42501';end if;
 if p_action='questions' then
  return coalesce((select jsonb_agg(to_jsonb(q) order by id) from school_private.wall_questions q),'[]'::jsonb);
 elsif p_action='results' then
  return coalesce((select jsonb_agg(to_jsonb(w)) from
   (select r.id,r.score,r.finished_at,r.hidden,case when p.display_name like '%@%' then 'طالب' else p.display_name end name
    from school_private.wall_rounds r join public.student_profiles p on p.id=r.user_id
    where r.reason in ('complete','danger') order by r.finished_at desc limit 100) w),'[]'::jsonb);
 elsif p_action='visibility' then
  if jsonb_typeof(p_data->'hidden') is distinct from 'boolean' then raise exception 'wall_invalid_fields';end if;
  update school_private.wall_rounds set hidden=(p_data->>'hidden')::boolean
  where id=(p_data->>'id')::uuid and reason in ('complete','danger');
 elsif p_action='delete' then
  delete from school_private.wall_questions where id=p_data->>'id';
 elsif p_action='save' then
  code:=coalesce(nullif(p_data->>'id',''),'custom-'||gen_random_uuid()::text);
  lesson:=p_data->>'lesson_id';diff:=p_data->>'difficulty';stem:=btrim(p_data->>'prompt');why:=btrim(p_data->>'explanation');
  opts:=p_data->'options';answer:=p_data->>'correct_id';page_no:=(p_data->>'page')::int;allowed:=(p_data->>'enabled')::boolean;
  if char_length(code)>64 or diff is null or diff not in ('easy','medium','hard') or
   stem is null or char_length(stem) not between 5 and 500 or why is null or char_length(why) not between 5 and 1200 or
   allowed is null or jsonb_typeof(opts) is distinct from 'array' or
   not exists(select 1 from school_private.wall_lessons where id=lesson and page_no between first_page and last_page) then raise exception 'wall_invalid_fields';end if;
  if jsonb_array_length(opts)<>4 or answer not in ('1','2','3','4') or answer is null or
   (select count(distinct o->>'id') from jsonb_array_elements(opts) o)<>4 or
   (select count(distinct btrim(o->>'text')) from jsonb_array_elements(opts) o)<>4 or
   exists(select 1 from jsonb_array_elements(opts) o where (o->>'id') not in ('1','2','3','4') or
    jsonb_typeof(o->'text') is distinct from 'string' or char_length(btrim(o->>'text')) not between 1 and 400)
   then raise exception 'wall_invalid_options';end if;
  if (stem||opts::text) ~ '(الدرس|الدروس|الخريطة التنظيمية|الفقرة السابقة|النص أعلاه)' then raise exception 'wall_context_required';end if;
  perform pg_advisory_xact_lock(hashtextextended('wall-admin-questions',812));
  if exists(select 1 from school_private.wall_questions q where q.id<>code and
    regexp_replace(q.prompt,'[[:space:][:punct:]ًٌٍَُِّْـ]','','g')=regexp_replace(stem,'[[:space:][:punct:]ًٌٍَُِّْـ]','','g')) then
   raise exception 'wall_invalid_duplicate';
  end if;
  insert into school_private.wall_questions(id,lesson_id,difficulty,prompt,options,correct_id,explanation,page,enabled)
   select code,lesson,diff,stem,jsonb_agg(jsonb_build_object('id',o->>'id','text',btrim(o->>'text'))),answer,why,page_no,allowed
   from jsonb_array_elements(opts) o
   on conflict(id) do update set lesson_id=excluded.lesson_id,difficulty=excluded.difficulty,prompt=excluded.prompt,options=excluded.options,
   correct_id=excluded.correct_id,explanation=excluded.explanation,page=excluded.page,enabled=excluded.enabled;
 else raise exception 'wall_invalid_action';end if;
 return 'true'::jsonb;
end;
$$;

revoke all on function public.wall_start(text,text,text),public.wall_act(uuid,text,text,text),public.wall_board(text),public.wall_admin(text,jsonb) from public,anon,authenticated;
grant execute on function public.wall_start(text,text,text),public.wall_act(uuid,text,text,text),public.wall_admin(text,jsonb) to authenticated;
grant execute on function public.wall_board(text) to anon,authenticated;
commit;
