// School-wide content lives in Supabase and uses the same session as the rest of the site.
const KnowledgeAPI = (() => {
 const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
 const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
 const MAX_IMAGES = 8;
 const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
 const fileTypes = {jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp'};

 async function list(admin = false) {
  const data = await Auth.knowledgeRpc('knowledge_list', {p_admin:admin === true});
  if (!Array.isArray(data?.achievements) || !Array.isArray(data?.tools))
   throw Error('تعذر قراءة قائمة المحتوى المدرسي.');
  const achievements = data.achievements.map(({place, ...row}) => ({...row, placement:place}));
  const dateOf = row => row.event_date || row.created_at?.slice(0, 10) || '';
  achievements.sort((a,b) => dateOf(b).localeCompare(dateOf(a)) ||
    b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
  return {achievements, tools:data.tools};
 }

 async function imageUrl(image) {
  if (!image?.id) throw Error('الصورة غير متاحة.');
  const result = await Auth.knowledgeRpc('knowledge_image', {p_id:image.id});
  if (!allowedTypes.has(result?.mime) || typeof result.data !== 'string' || !result.data.length)
   throw Error('الصورة غير متاحة.');
  return 'data:' + result.mime + ';base64,' + result.data;
 }

 function newImageType(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const mime = fileTypes[ext];
  if (!allowedTypes.has(mime) || (file.type && file.type !== mime))
   throw Error('اختر صورة بصيغة JPG أو PNG أو WebP.');
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw Error('الحد الأقصى لكل صورة ٢ ميبيبايت.');
  return mime;
 }

 async function encodeImage(image) {
  if (image.id) return {id:image.id};
  const mime = newImageType(image);
  const encoded = await new Promise((resolve, reject) => {
   const reader = new FileReader();
   reader.onload = () => resolve(reader.result);
   reader.onerror = reader.onabort = () => reject(Error('تعذرت قراءة ملف الصورة.'));
   reader.readAsDataURL(image);
  });
  return {mime, data:encoded.slice(encoded.indexOf(',') + 1)};
 }

 async function change(name, args) {
  const result = await Auth.knowledgeRpc(name, args);
  document.dispatchEvent(new Event('school-content-changed'));
  return result;
 }

 function commonFields(row) {
  return {
   ...(row.id ? {id:row.id, updated_at:row.updated_at} : {}),
   title:row.title?.trim(), description:row.description?.trim() || null,
   category:row.category?.trim() || null, published:row.published === true
  };
 }

 async function saveAchievement(row, images) {
  if (images.length > MAX_IMAGES) throw Error('يمكن إرفاق ثماني صور على الأكثر.');
  const total = images.reduce((sum, item) => sum + (item.id ? Number(item.bytes || 0) : item.size), 0);
  if (total > MAX_TOTAL_BYTES) throw Error('يجب ألّا يتجاوز مجموع أحجام الصور ٨ ميبيبايت.');
  const record = {...commonFields(row), participants:row.participants?.trim() || null,
   place:row.placement?.trim() || null, event_date:row.event_date || null};
  const encoded = await Promise.all(images.map(encodeImage));
  return change('knowledge_save_achievement', {p_record:record, p_images:encoded});
 }

 function httpsUrl(value) {
  try {
   const url = new URL(value);
   if (url.protocol === 'https:' && !url.username && !url.password && /^https:\/\//i.test(value) &&
       !/[\s\\]/u.test(value)) return url.href;
  } catch {}
  return '';
 }

 function saveTool(row) {
  const url = httpsUrl(row.url?.trim());
  if (!url) throw Error('أدخل رابط HTTPS كاملًا دون معلومات دخول.');
  return change('knowledge_save_tool', {p_record:{...commonFields(row), url}});
 }

 function remove(kind, row) {
  return change('knowledge_delete', {p_kind:kind, p_id:row.id, p_updated_at:row.updated_at});
 }

 return {list, imageUrl, saveAchievement, saveTool, httpsUrl, MAX_IMAGES, MAX_TOTAL_BYTES, MAX_IMAGE_BYTES,
  listAchievements:async admin => (await list(admin)).achievements,
  listTools:async admin => (await list(admin)).tools,
  deleteAchievement:row => remove('achievement',row), deleteTool:row => remove('tool',row)};
})();
