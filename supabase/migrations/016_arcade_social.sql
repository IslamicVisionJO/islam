-- Friend codes reveal only a consenting player's display name.
begin;
create table if not exists school_private.arcade_contacts(uid uuid primary key references auth.users(id),code text unique not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)));
create table if not exists school_private.arcade_friends(sender uuid references auth.users(id),recipient uuid references auth.users(id),accepted boolean not null default false,primary key(sender,recipient),check(sender<>recipient));
create unique index if not exists arcade_friend_pair on school_private.arcade_friends(least(sender,recipient),greatest(sender,recipient));
create table if not exists school_private.arcade_invites(room uuid references school_private.arcade_rooms(id),sender uuid references auth.users(id),recipient uuid references auth.users(id),created timestamptz not null default now(),primary key(room,recipient));
create table if not exists school_private.arcade_question_reports(uid uuid references auth.users(id),question text references school_private.arcade_bank(id),note text not null,created timestamptz not null default now(),primary key(uid,question));
create table if not exists school_private.arcade_competitions(id uuid primary key default gen_random_uuid(),title text not null,game text not null,opens timestamptz not null,closes timestamptz not null,creator uuid references auth.users(id));
alter table school_private.arcade_competitions enable row level security;
revoke all on school_private.arcade_competitions from public,anon,authenticated;
alter table school_private.arcade_contacts enable row level security;
alter table school_private.arcade_friends enable row level security;
alter table school_private.arcade_invites enable row level security;
alter table school_private.arcade_question_reports enable row level security;
revoke all on school_private.arcade_contacts,school_private.arcade_friends,school_private.arcade_invites,school_private.arcade_question_reports from public,anon,authenticated;
create or replace function public.arcade_social(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=school_private.duel_identity(); peer uuid; room_id uuid; my_code text;
begin
 if jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>2048 then raise exception 'invalid_request';end if;
 insert into school_private.arcade_contacts(uid) values(u) on conflict(uid) do nothing;
 select code into my_code from school_private.arcade_contacts where uid=u;
 if p_action in ('request','accept','decline','invite') then
  select uid into strict peer from school_private.arcade_contacts where code=upper(trim(p_data->>'code')) and uid<>u;
 end if;
 if p_action='competition_create' then
  if not school_private.is_admin() then raise exception 'administrator_required';end if;
  if length(trim(coalesce(p_data->>'title',''))) not between 3 and 100 or coalesce(p_data->>'game','') not in ('blocks','space','tiles','bubbles') or (p_data->>'days')::int not between 1 and 90 then raise exception 'invalid_competition';end if;
  insert into school_private.arcade_competitions(title,game,opens,closes,creator) values(trim(p_data->>'title'),p_data->>'game',now(),now()+make_interval(days=>(p_data->>'days')::int),u);
  return 'true'::jsonb;
 elsif p_action='competitions' then
  return coalesce((select jsonb_agg(to_jsonb(c)) from (select id,title,game,opens,closes from school_private.arcade_competitions order by opens desc limit 30)c),'[]');
 elsif p_action='competition_scores' then
  return coalesce((select jsonb_agg(to_jsonb(scores)) from (select max(p.name) as name,max(p.skill+r.knowledge_points*(select count(*) from jsonb_each(p.answers) a where (a.value->>'correct')::boolean)) as points
   from school_private.arcade_competitions c join school_private.arcade_rooms r on c.game=r.game and r.starts>=c.opens and r.deadline<=c.closes join school_private.arcade_players p on p.room=r.id
   where c.id=(p_data->>'id')::uuid and r.status='finished' and not p.left_room group by p.uid order by points desc limit 50)scores),'[]');
 elsif p_action='request' then
  if (select count(*) from school_private.arcade_friends where sender=u and not accepted)>=30 then raise exception 'too_many_requests';end if;
  insert into school_private.arcade_friends(sender,recipient) values(u,peer) on conflict do nothing;
 elsif p_action='accept' then update school_private.arcade_friends set accepted=true where sender=peer and recipient=u;
 elsif p_action='decline' then delete from school_private.arcade_friends where sender=peer and recipient=u and not accepted;
 elsif p_action='invite' then
  room_id:=(p_data->>'room')::uuid;
  if not exists(select 1 from school_private.arcade_friends where accepted and ((sender=u and recipient=peer) or (sender=peer and recipient=u))) then raise exception 'friend_required';end if;
  if not exists(select 1 from school_private.arcade_rooms r join school_private.arcade_players m on m.room=r.id where r.id=room_id and r.status='waiting' and m.uid=u and not m.left_room) then raise exception 'room_not_found';end if;
  insert into school_private.arcade_invites(room,sender,recipient) values(room_id,u,peer) on conflict do nothing;
 elsif p_action='dismiss' then delete from school_private.arcade_invites where recipient=u and room=(p_data->>'room')::uuid;
 elsif p_action='report' then
  if length(trim(coalesce(p_data->>'note',''))) not between 3 and 400 then raise exception 'invalid_note';end if;
  insert into school_private.arcade_question_reports(uid,question,note) values(u,p_data->>'question',trim(p_data->>'note')) on conflict(uid,question) do update set note=excluded.note,created=now();
  return 'true'::jsonb;
 elsif p_action='reports' then
  if not school_private.is_admin() then raise exception 'administrator_required';end if;
  return coalesce((select jsonb_agg(to_jsonb(q)) from(select question,note from school_private.arcade_question_reports order by created desc limit 50)q),'[]');
 elsif p_action='ranking' then
  return coalesce((select jsonb_agg(to_jsonb(q)) from(select max(p.name) as name,sum(p.skill+r.knowledge_points*(select count(*) from jsonb_each(p.answers) a where (a.value->>'correct')::boolean)) as points
   from school_private.arcade_players p join school_private.arcade_rooms r on r.id=p.room
   where r.status='finished' and not p.left_room and (p.uid=u or exists(select 1 from school_private.arcade_friends f where f.accepted and ((f.sender=u and f.recipient=p.uid) or (f.recipient=u and f.sender=p.uid)))) group by p.uid order by points desc limit 50)q),'[]');
 elsif p_action<>'list' then raise exception 'unknown_action';
 end if;
 return jsonb_build_object('code',my_code,'contacts',coalesce((select jsonb_agg(jsonb_build_object('code',c.code,'name',p.display_name,'accepted',f.accepted,'incoming',f.recipient=u)) from school_private.arcade_friends f join school_private.arcade_contacts c on c.uid=case when f.sender=u then f.recipient else f.sender end join public.student_profiles p on p.id=c.uid where u in(f.sender,f.recipient)),'[]'),
 'invites',coalesce((select jsonb_agg(jsonb_build_object('room',r.id,'code',r.code,'game',r.game,'name',p.display_name)) from school_private.arcade_invites i join school_private.arcade_rooms r on r.id=i.room join public.student_profiles p on p.id=i.sender where i.recipient=u and r.status='waiting' and r.created_at>now()-interval '15 minutes'),'[]'));
end;$$;
revoke all on function public.arcade_social(text,jsonb) from public,anon;
grant execute on function public.arcade_social(text,jsonb) to authenticated;
commit;
