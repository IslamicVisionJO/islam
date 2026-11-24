-- Achievement content is independent of student progress and the question banks.
begin;
create table if not exists school_private.steam_achievements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  achievement_date date,
  team text not null default '',
  published boolean not null default false,
  images jsonb not null default '[]',
  created_at timestamptz not null default now()
);
alter table school_private.steam_achievements enable row level security;
revoke all on school_private.steam_achievements from public, anon, authenticated;

-- Check a bounded JPEG frame before accepting data from the browser.
create or replace function school_private.steam_jpeg_frame(raw bytea) returns boolean
language plpgsql immutable set search_path='' as $$
declare
 pos integer := 2;
 size integer := octet_length(raw);
 marker integer;
 segment integer;
 width integer;
 height integer;
 has_frame boolean := false;
begin
 while pos+4<=size loop
  if get_byte(raw,pos)<>255 then return false; end if;
  pos:=pos+1;
  while pos<size and get_byte(raw,pos)=255 loop pos:=pos+1; end loop;
  if pos+2>=size then return false; end if;
  marker:=get_byte(raw,pos);
  segment:=256*get_byte(raw,pos+1)+get_byte(raw,pos+2);
  if segment<2 or pos+segment>=size then return false; end if;
  if marker in (192,193,194) then
   if segment<8 then return false; end if;
   height:=256*get_byte(raw,pos+4)+get_byte(raw,pos+5);
   width:=256*get_byte(raw,pos+6)+get_byte(raw,pos+7);
   if width not between 1 and 1400 or height not between 1 and 1400 then return false; end if;
   has_frame:=true;
  elsif marker=218 then
   return has_frame and pos+segment+2<size;
  end if;
  pos:=pos+segment+1;
 end loop;
 return false;
end;
$$;
revoke all on function school_private.steam_jpeg_frame(bytea) from public,anon,authenticated;

create or replace function public.steam_list(p_manage boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if p_manage and not school_private.is_admin() then
  raise exception 'steam_admin_required' using errcode='42501';
 end if;
 return coalesce((select jsonb_agg(to_jsonb(a) order by a.achievement_date desc nulls last,a.created_at desc)
  from school_private.steam_achievements a where a.published or p_manage), '[]'::jsonb);
end;
$$;

create or replace function public.steam_save(
 p_id uuid, p_title text, p_description text, p_date date, p_team text, p_published boolean, p_images jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare
 item text;
 raw bytea;
 saved uuid;
begin
 if not school_private.is_admin() then raise exception 'steam_admin_required' using errcode='42501'; end if;
 if p_title is null or char_length(btrim(p_title)) not between 1 and 120
    or p_description is null or char_length(btrim(p_description)) not between 1 and 2000
    or char_length(coalesce(p_team,'')) > 120 or p_published is null
    or p_images is null or jsonb_typeof(p_images) <> 'array' then raise exception 'steam_invalid_fields'; end if;
 if jsonb_array_length(p_images)>5 then raise exception 'steam_image_limit'; end if;
 for item in select value from jsonb_array_elements_text(p_images) t(value) loop
  if item is null or octet_length(item) > 700000 or item !~ '^[A-Za-z0-9+/]+={0,2}$' then raise exception 'steam_invalid_image'; end if;
  raw := decode(item,'base64');
  if octet_length(raw) not between 10 and 500000
     or substring(raw from 1 for 3)<>decode('ffd8ff','hex')
     or substring(raw from octet_length(raw)-1)<>decode('ffd9','hex')
     or not school_private.steam_jpeg_frame(raw) then
    raise exception 'steam_invalid_image';
  end if;
 end loop;
 if p_id is null then
  insert into school_private.steam_achievements(title,description,achievement_date,team,published,images)
  values(btrim(p_title),btrim(p_description),p_date,btrim(coalesce(p_team,'')),p_published,p_images)
  returning id into saved;
 else
  update school_private.steam_achievements set title=btrim(p_title), description=btrim(p_description),
   achievement_date=p_date,team=btrim(coalesce(p_team,'')),published=p_published,images=p_images
   where id=p_id returning id into saved;
  if not found then raise exception 'steam_missing_achievement'; end if;
 end if;
 return saved;
end;
$$;

create or replace function public.steam_delete(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not school_private.is_admin() then raise exception 'steam_admin_required' using errcode='42501'; end if;
 delete from school_private.steam_achievements where id=p_id;
 if not found then raise exception 'steam_missing_achievement'; end if;
end;
$$;

revoke all on function public.steam_list(boolean), public.steam_save(uuid,text,text,date,text,boolean,jsonb), public.steam_delete(uuid)
 from public, anon, authenticated;
grant execute on function public.steam_list(boolean) to anon,authenticated;
grant execute on function public.steam_save(uuid,text,text,date,text,boolean,jsonb), public.steam_delete(uuid) to authenticated;
commit;
