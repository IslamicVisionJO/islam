-- Apply after 003_public_email_signup.sql. No seeds, new identities or external services.
begin;

create table if not exists school_private.knowledge_achievements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 180 and title ~ '[^[:space:]]'),
  category text check (length(category) <= 100),
  description text check (length(description) <= 2500),
  participants text check (length(participants) <= 500),
  place text check (length(place) <= 100),
  event_date date,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- No filenames, shared paths, public object URLs, or standalone upload endpoint.
-- Image bytes and their parent are committed, unpublished and deleted together.
create table if not exists school_private.knowledge_images (
  id uuid primary key default gen_random_uuid(),
  achievement_id uuid not null references school_private.knowledge_achievements on delete cascade,
  position integer not null check (position between 1 and 8),
  mime text not null check (mime in ('image/png','image/jpeg','image/webp')),
  content bytea not null check (octet_length(content) between 1 and 2097152),
  unique (achievement_id, position) deferrable initially deferred
);

create table if not exists school_private.knowledge_tools (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 180 and title ~ '[^[:space:]]'),
  category text check (length(category) <= 100),
  description text check (length(description) <= 2500),
  url text not null check (length(url) <= 2048
    and url ~ '^https://[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?([.][a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*(:[0-9]{1,5})?([/?#].*)?$'
    and coalesce(substring(url from '^https://[^/:?#]+:([0-9]{1,5})(?:[/?#]|$)')::int,443) between 1 and 65535
    and url !~ '[[:space:][:cntrl:]]' and strpos(url,chr(92)) = 0),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists knowledge_achievement_feed on school_private.knowledge_achievements(published, event_date desc, created_at desc);
create index if not exists knowledge_tool_feed on school_private.knowledge_tools(published, created_at desc);
alter table school_private.knowledge_images enable row level security;
alter table school_private.knowledge_achievements enable row level security;
alter table school_private.knowledge_tools enable row level security;
revoke all on school_private.knowledge_achievements, school_private.knowledge_images, school_private.knowledge_tools from public, anon, authenticated;

-- Reject nested JSON in text fields: ->> alone would stringify it and display it as content.
create or replace function school_private.valid_knowledge_record(rec jsonb, text_fields text[])
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(rec) = 'object'
    and jsonb_typeof(rec->'title') = 'string'
    and not exists (select 1 from unnest(text_fields) as f
                    where jsonb_typeof(rec->f) not in ('string','null'))
    and (not rec ? 'published' or jsonb_typeof(rec->'published') = 'boolean'), false);
$$;

-- Unsigned integers in PNG, JPEG and WebP headers. All offsets here are zero-based.
create or replace function school_private.image_uint(b bytea, off integer, n integer, little boolean default false)
returns bigint language sql immutable strict set search_path = '' as $$
  select sum(get_byte(b, off+i)::bigint << (8 * (case when little then i else n-1-i end)))::bigint
  from generate_series(0,n-1) as i;
$$;

-- Validate container boundaries, dimensions, raster payload markers and declared MIME.
-- The UI renders images using the verified raster MIME type, never original filenames or HTML/SVG.
create or replace function school_private.valid_knowledge_image(b bytea, mime text)
returns boolean language plpgsql immutable strict set search_path = '' as $$
declare
  size integer := octet_length(b);
  pos integer; start_at integer; span bigint; tag bytea; marker integer;
  w bigint := 0; h bigint := 0; raster boolean := false;
begin
  if size not between 16 and 2097152 then return false; end if;
  if mime = 'image/png' then
    if substring(b from 1 for 16) <> decode('89504e470d0a1a0a0000000d49484452','hex') or size < 57 then return false; end if;
    w := school_private.image_uint(b,16,4); h := school_private.image_uint(b,20,4);
    if get_byte(b,26) <> 0 or get_byte(b,27) <> 0 or get_byte(b,28) > 1 then return false; end if;
    pos := 33;
    while pos+12 <= size loop
      span := school_private.image_uint(b,pos,4);
      if pos+span+12 > size then return false; end if;
      tag := substring(b from pos+5 for 4);
      if tag = 'IHDR'::bytea then return false; end if;
      if tag = 'IDAT'::bytea and span > 0 then raster := true; end if;
      if tag = 'IEND'::bytea then exit; end if;
      pos := pos + span::integer + 12;
    end loop;
    if tag is distinct from 'IEND'::bytea or span <> 0 or pos+12 <> size then return false; end if;
  elsif mime = 'image/jpeg' then
    if substring(b from 1 for 2) <> decode('ffd8','hex') or substring(b from size-1) <> decode('ffd9','hex') then return false; end if;
    pos := 2;
    while pos+3 < size loop
      if get_byte(b,pos) <> 255 then return false; end if;
      pos := pos + 1;
      while pos < size and get_byte(b,pos) = 255 loop pos := pos + 1; end loop;
      if pos+3 >= size then return false; end if;
      marker := get_byte(b,pos); pos := pos + 1;
      span := school_private.image_uint(b,pos,2);
      if span < 2 or pos+span > size-2 then return false; end if;
      if marker in (192,193,194,195,197,198,199,201,202,203,205,206,207) then
        if span < 11 then return false; end if;
        h := school_private.image_uint(b,pos+3,2); w := school_private.image_uint(b,pos+5,2);
      elsif marker = 218 then
        raster := span >= 8 and pos+span < size-2;
        exit;
      end if;
      pos := pos + span::integer;
    end loop;
  elsif mime = 'image/webp' then
    if substring(b from 1 for 4) <> 'RIFF'::bytea or substring(b from 9 for 4) <> 'WEBP'::bytea
      or school_private.image_uint(b,4,4,true) <> size-8 then return false; end if;
    pos := 12;
    while pos+8 <= size loop
      tag := substring(b from pos+1 for 4); span := school_private.image_uint(b,pos+4,4,true);
      start_at := pos+8;
      if start_at+span+(span%2) > size then return false; end if;
      if tag = 'VP8X'::bytea then
        if span <> 10 then return false; end if;
        w := 1+school_private.image_uint(b,start_at+4,3,true); h := 1+school_private.image_uint(b,start_at+7,3,true);
      elsif tag = 'VP8 '::bytea then
        if span < 11 or substring(b from start_at+4 for 3) <> decode('9d012a','hex') then return false; end if;
        w := school_private.image_uint(b,start_at+6,2,true) & 16383; h := school_private.image_uint(b,start_at+8,2,true) & 16383;
        raster := true;
      elsif tag = 'VP8L'::bytea then
        if span < 6 or get_byte(b,start_at) <> 47 then return false; end if;
        w := 1+(school_private.image_uint(b,start_at+1,2,true) & 16383);
        h := 1+((school_private.image_uint(b,start_at+2,3,true) >> 6) & 16383);
        raster := true;
      elsif tag = 'ANMF'::bytea then
        if span <= 24 or substring(b from start_at+17 for 4) not in ('VP8 '::bytea,'VP8L'::bytea,'ALPH'::bytea) then return false; end if;
        raster := true;
      end if;
      pos := start_at+span::integer+(span%2)::integer;
    end loop;
    if pos <> size then return false; end if;
  else return false;
  end if;
  -- Check individual dimensions before multiplying unsigned 32-bit PNG values.
  if w not between 1 and 16000 or h not between 1 and 16000 then return false; end if;
  return raster and w*h <= 40000000;
end;
$$;

create or replace function public.knowledge_list(p_admin boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_admin and not school_private.is_admin() then
    raise exception 'administrator_required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'achievements', coalesce((
      select jsonb_agg(to_jsonb(a) || jsonb_build_object('images',coalesce((
        select jsonb_agg(jsonb_build_object('id',i.id,'mime',i.mime,'bytes',octet_length(i.content)) order by i.position)
        from school_private.knowledge_images i where i.achievement_id = a.id
      ), '[]'::jsonb)) order by coalesce(a.event_date, (a.created_at at time zone 'UTC')::date) desc, a.created_at desc, a.id)
      from school_private.knowledge_achievements a where p_admin or a.published
    ), '[]'::jsonb),
    'tools', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created_at desc, t.id) from school_private.knowledge_tools t where p_admin or t.published
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.knowledge_image(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('mime',i.mime,'data',replace(encode(i.content,'base64'),chr(10),''))
  from school_private.knowledge_images i join school_private.knowledge_achievements a on a.id = i.achievement_id
  where i.id = p_id and (a.published or school_private.is_admin());
$$;

create or replace function public.knowledge_save_achievement(p_record jsonb,p_images jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  item school_private.knowledge_achievements%rowtype;
  expected_time timestamptz;
  image jsonb; image_id uuid; image_bytes integer; total_bytes integer := 0;
  blob bytea; image_ids uuid[] := '{}'; pos integer := 0;
begin
  if not school_private.is_admin() then raise exception 'administrator_required' using errcode = '42501'; end if;
  if not school_private.valid_knowledge_record(p_record,array['id','updated_at','title','category','description','participants','place','event_date'])
    or jsonb_typeof(p_images) is distinct from 'array' then
    raise exception 'invalid_record' using errcode = '22023';
  end if;
  if jsonb_array_length(p_images) > 8 then raise exception 'too_many_images' using errcode = '22023'; end if;
  item.id := (p_record->>'id')::uuid;
  item.title := btrim(p_record->>'title'); item.category := nullif(btrim(p_record->>'category'),'');
  item.description := nullif(btrim(p_record->>'description'),''); item.participants := nullif(btrim(p_record->>'participants'),'');
  item.place := nullif(btrim(p_record->>'place'),''); item.event_date := nullif(p_record->>'event_date','')::date;
  item.published := coalesce((p_record->>'published')::boolean,false);
  if item.id is null then
    insert into school_private.knowledge_achievements(title,category,description,participants,place,event_date,published)
      values(item.title,item.category,item.description,item.participants,item.place,item.event_date,item.published) returning id into item.id;
  else
    expected_time := (p_record->>'updated_at')::timestamptz;
    update school_private.knowledge_achievements set title=item.title, category=item.category, description=item.description,
      participants=item.participants, place=item.place, event_date=item.event_date, published=item.published, updated_at=clock_timestamp()
      where id=item.id and updated_at=expected_time;
    if not found then raise exception 'stale_record' using errcode = '40001'; end if;
  end if;

  for image in select value from jsonb_array_elements(p_images) loop
    pos := pos+1;
    if jsonb_typeof(image) is distinct from 'object' then raise exception 'invalid_image' using errcode = '22023'; end if;
    if image ? 'id' then
      image_id := (image->>'id')::uuid;
      if image_id = any(image_ids) then raise exception 'duplicate_image' using errcode = '22023'; end if;
      update school_private.knowledge_images set position=pos where id=image_id and achievement_id=item.id
        returning octet_length(content) into image_bytes;
      if not found then raise exception 'invalid_image_reference' using errcode = '22023'; end if;
    else
      if length(image->>'data') not between 1 and 2796204 or image->>'data' is null or
        coalesce(image->>'mime','') not in ('image/png','image/jpeg','image/webp') then
        raise exception 'invalid_image' using errcode = '22023';
      end if;
      blob := decode(image->>'data','base64');
      if not school_private.valid_knowledge_image(blob,image->>'mime') then raise exception 'invalid_image' using errcode = '22023'; end if;
      image_bytes := octet_length(blob);
      insert into school_private.knowledge_images(achievement_id,position,mime,content) values(item.id,pos,image->>'mime',blob) returning id into image_id;
    end if;
    total_bytes := total_bytes+image_bytes;
    if total_bytes > 8388608 then raise exception 'album_too_large' using errcode = '22023'; end if;
    image_ids := array_append(image_ids,image_id);
  end loop;
  delete from school_private.knowledge_images where achievement_id=item.id and not (id = any(image_ids));
  return item.id;
end;
$$;

create or replace function public.knowledge_save_tool(p_record jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare item school_private.knowledge_tools%rowtype;
begin
  if not school_private.is_admin() then raise exception 'administrator_required' using errcode = '42501'; end if;
  if not school_private.valid_knowledge_record(p_record,array['id','updated_at','title','category','description','url']) then
    raise exception 'invalid_record' using errcode = '22023';
  end if;
  item.id := (p_record->>'id')::uuid; item.title := btrim(p_record->>'title'); item.url := btrim(p_record->>'url');
  item.description := nullif(btrim(p_record->>'description'),''); item.category := nullif(btrim(p_record->>'category'),'');
  item.published := coalesce((p_record->>'published')::boolean,false);
  if item.id is null then
    insert into school_private.knowledge_tools(title,description,category,url,published) values(item.title,item.description,item.category,item.url,item.published)
      returning id into item.id;
  else
    update school_private.knowledge_tools set title=item.title, description=item.description, category=item.category, url=item.url,
      published=item.published, updated_at=clock_timestamp() where id=item.id and updated_at=(p_record->>'updated_at')::timestamptz;
    if not found then raise exception 'stale_record' using errcode = '40001'; end if;
  end if;
  return item.id;
end;
$$;

create or replace function public.knowledge_delete(p_kind text,p_id uuid,p_updated_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not school_private.is_admin() then raise exception 'administrator_required' using errcode = '42501'; end if;
  if p_kind = 'achievement' then
    delete from school_private.knowledge_achievements where id=p_id and updated_at=p_updated_at;
  elsif p_kind = 'tool' then
    delete from school_private.knowledge_tools where id=p_id and updated_at=p_updated_at;
  else raise exception 'invalid_record_kind' using errcode = '22023';
  end if;
  if not found then raise exception 'stale_record' using errcode = '40001'; end if;
end;
$$;

revoke all on function school_private.valid_knowledge_record(jsonb,text[]),school_private.image_uint(bytea,integer,integer,boolean),school_private.valid_knowledge_image(bytea,text),
  public.knowledge_list(boolean),public.knowledge_image(uuid),public.knowledge_save_achievement(jsonb,jsonb),
  public.knowledge_save_tool(jsonb),public.knowledge_delete(text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.knowledge_list(boolean),public.knowledge_image(uuid) to anon,authenticated;
grant execute on function public.knowledge_save_achievement(jsonb,jsonb),public.knowledge_save_tool(jsonb),
  public.knowledge_delete(text,uuid,timestamptz) to authenticated;
notify pgrst, 'reload schema';
commit;
