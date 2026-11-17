-- Additive authenticated millionaire sessions and an authoritative, separate coin wallet.
-- Requires 001,003,004,005. Does not rewrite existing profiles, results or balances.
begin;
create table if not exists school_private.million_sessions(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
 unit_id text not null default 'all',lesson_id text not null default 'all',
 questions jsonb not null,receipts jsonb not null default '[]',status text not null default 'active' check(status in('active','won','lost','exit','timeout')),
 deadline timestamptz,created_at timestamptz not null default clock_timestamp());
create unique index if not exists million_one_active on school_private.million_sessions(user_id) where status='active';
create table if not exists school_private.million_awards(session_id uuid primary key references school_private.million_sessions(id),user_id uuid not null references auth.users(id),coins int not null check(coins>0),created_at timestamptz not null default clock_timestamp());
alter table school_private.million_sessions enable row level security;
alter table school_private.million_awards enable row level security;
revoke all on school_private.million_sessions,school_private.million_awards from public,anon,authenticated;
create or replace function school_private.million_snapshot(p_id uuid,p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r school_private.million_sessions%rowtype;
begin
 select * into r from school_private.million_sessions where id=p_id and user_id=p_user;
 if not found then raise exception 'million_session_not_found' using errcode='42501';end if;
 return jsonb_build_object('id',r.id,'unit',r.unit_id,'lesson',r.lesson_id,'ids',(select jsonb_agg(q->>'id') from jsonb_array_elements(r.questions) q),'receipts',r.receipts,'status',r.status,'deadline',r.deadline,'walletCoins',coalesce((select sum(coins) from school_private.million_awards where user_id=p_user),0),'awardCoins',coalesce((select coins from school_private.million_awards where session_id=r.id),0));
end;$$;
create or replace function public.million_start(p_unit text,p_lesson text,p_seconds int) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;rid uuid;qs jsonb;
begin
 u:=school_private.duel_identity();perform pg_advisory_xact_lock(hashtextextended(u::text,601));
 if p_unit is null or p_lesson is null or p_seconds is null or p_unit !~ '^(all|u0[1-4])$' or p_lesson !~ '^(all|u0[1-4]_l[0-9]{2})$' or p_seconds not between 0 and 1800 or (p_lesson<>'all' and p_unit<>'all' and left(p_lesson,3)<>p_unit) then raise exception 'invalid_million_settings';end if;
 update school_private.million_sessions set status='timeout' where user_id=u and status='active' and deadline<=clock_timestamp();
 select id into rid from school_private.million_sessions where user_id=u and status='active';
 if rid is not null then return school_private.million_snapshot(rid,u);end if;
 select jsonb_agg(data order by case data->>'difficulty' when 'easy' then 1 when 'medium' then 2 else 3 end) into qs from(select data from school_private.educational_questions where game=0 and (p_unit='all' or unit_id=p_unit) and(p_lesson='all' or lesson_id=p_lesson) order by random() limit 15) q;
 if qs is null then raise exception 'million_no_questions';end if;
 insert into school_private.million_sessions(user_id,unit_id,lesson_id,questions,deadline) values(u,p_unit,p_lesson,qs,case when p_seconds=0 then null else clock_timestamp()+make_interval(secs=>p_seconds) end) returning id into rid;
 return school_private.million_snapshot(rid,u);
end;$$;
create or replace function public.million_answer(p_session uuid,p_question text,p_answer text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;r school_private.million_sessions%rowtype;q jsonb;correct boolean;old jsonb;n int;
begin
 u:=school_private.duel_identity();select * into r from school_private.million_sessions where id=p_session and user_id=u for update;
 if not found then raise exception 'million_session_not_found' using errcode='42501';end if;
 if r.status<>'active' then return school_private.million_snapshot(r.id,u);end if;
 if r.deadline<=clock_timestamp() then update school_private.million_sessions set status='timeout' where id=r.id;return school_private.million_snapshot(r.id,u);end if;
 select x into old from jsonb_array_elements(r.receipts) x where x->>'id'=p_question;
 if old is not null then if old->>'response' is distinct from p_answer then raise exception 'million_answer_locked';end if;return school_private.million_snapshot(r.id,u);end if;
 n:=jsonb_array_length(r.receipts);q:=r.questions->n;
 if q->>'id' is distinct from p_question then raise exception 'million_wrong_order';end if;
 if not exists(select 1 from jsonb_array_elements(q->'payload'->'options') x where x->>'id'=p_answer) then raise exception 'million_invalid_answer';end if;
 correct:=q->'answer'->>'option_id'=p_answer;
 update school_private.million_sessions set receipts=receipts||jsonb_build_array(jsonb_build_object('id',p_question,'response',p_answer,'correct',correct)),status=case when not correct then 'lost' when n+1=jsonb_array_length(r.questions) then 'won' else 'active' end where id=r.id;
 if correct and n+1=jsonb_array_length(r.questions) and jsonb_array_length(r.questions)>=2 then insert into school_private.million_awards(session_id,user_id,coins) values(r.id,u,jsonb_array_length(r.questions)/2) on conflict(session_id) do nothing;end if;
 return school_private.million_snapshot(r.id,u);
end;$$;
create or replace function public.million_finish(p_session uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;r school_private.million_sessions%rowtype;
begin
 u:=school_private.duel_identity();select * into r from school_private.million_sessions where id=p_session and user_id=u for update;
 if not found then raise exception 'million_session_not_found' using errcode='42501';end if;
 if r.status='active' then update school_private.million_sessions set status=case when deadline<=clock_timestamp() then 'timeout' else 'exit' end where id=r.id;end if;
 return school_private.million_snapshot(r.id,u);
end;$$;
create or replace function public.million_wallet() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;
begin u:=school_private.duel_identity();return jsonb_build_object('coins',coalesce((select sum(coins) from school_private.million_awards where user_id=u),0));end;$$;
revoke all on function school_private.million_snapshot(uuid,uuid) from public,anon,authenticated;
revoke all on function public.million_start(text,text,int),public.million_answer(uuid,text,text),public.million_finish(uuid),public.million_wallet() from public,anon;
grant execute on function public.million_start(text,text,int),public.million_answer(uuid,text,text),public.million_finish(uuid),public.million_wallet() to authenticated;
commit;
