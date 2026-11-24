// School publishing tools are available inside the existing administrator workspace.
const KnowledgeAdmin = (() => {
  const sections = {
    students: 'إدارة الطلاب',
    academic: 'شروحات الفصل الأول',
    achievements: 'إدارة الإنجازات والمسابقات',
    tools: 'إدارة المواقع والأدوات'
  };
  let owner = null;
  let section = 'students';
  let state = null;
  let imageObserver;

  function clearEditor() {
    for (const photo of state?.editor?.photos || []) {
      if (photo.preview) URL.revokeObjectURL(photo.preview);
    }
    if (state) state.editor = null;
  }

  function reset() {
    imageObserver?.disconnect();
    clearEditor();
    state = null;
    owner = null;
    section = 'students';
  }

  function active(snapshot = state) {
    const identity = authState();
    return snapshot && snapshot === state && S.page === 'admin' &&
      identity.isAdmin && identity.user?.id === owner;
  }

  function view(studentView) {
    const identity = authState();
    if (!identity.isAdmin || !identity.user?.id) {
      reset();
      return '';
    }
    if (identity.user.id !== owner) {
      reset();
      owner = identity.user.id;
    }
    const tabs = Object.entries(sections).map(([key, label]) =>
      `<button type="button" class="btn btn-outline" data-ka-tab="${key}" aria-pressed="${key === section}" ${state?.busy ? 'disabled' : ''}>${label}</button>`).join('');
    return `<div id="knowledge-admin"><nav class="ka-tabs" aria-label="أقسام لوحة الإدارة">${tabs}</nav>
      ${section === 'students' ? studentView() : section === 'academic' ? AcademicAdmin.view() : content()}</div>`;
  }

  function changeSection(next) {
    if (!(next in sections) || next === section || state?.busy) return;
    clearEditor();
    section = next;
    state = ['students','academic'].includes(next) ? null : {
      rows: [], loading: true, loaded: false, busy: false, query: '', sort: 'newest',
      feedback: '', error: '', editor: null
    };
    render();
    document.querySelector(`[data-ka-tab="${next}"]`)?.focus();
    if (next === 'academic') void AcademicAdmin.enter();
    if (state) void load(state);
  }

  async function load(snapshot) {
    try {
      const rows = section === 'achievements'
        ? await KnowledgeAPI.listAchievements(true) : await KnowledgeAPI.listTools(true);
      if (!active(snapshot)) return;
      state.rows = rows;
      state.loaded = true;
    } catch (error) {
      if (active(snapshot)) state.error = error.message || 'تعذر تحميل السجلات.';
    } finally {
      if (active(snapshot)) {
        state.loading = false;
        render();
      }
    }
  }

  function content() {
    const achievements = section === 'achievements';
    const addLabel = achievements ? 'إضافة إنجاز جديد' : 'إضافة موقع جديد';
    const actions = state.editor ? '' :
      `<button class="btn btn-primary" data-ka-action="new" ${state.loading || state.busy ? 'disabled' : ''}>${ico(achievements ? 'award' : 'book', 18)} ${addLabel}</button>`;
    const messages = `<div aria-live="polite">${state.feedback ? `<p class="auth-message" role="status">${e(state.feedback)}</p>` : ''}</div>
      ${state.error ? `<p class="auth-message is-error" role="alert">${e(state.error)}</p>` : ''}`;
    return `<section class="ka-work" aria-labelledby="ka-heading">
      <div class="ka-heading"><h1 id="ka-heading">${sections[section]}</h1>${actions}</div>
      ${messages}${state.editor ? editorView() : listView()}</section>`;
  }

  function listView() {
    return `<section class="surface panel"><div class="ka-controls">
      <label>بحث<input type="search" data-ka-search placeholder="العنوان أو التصنيف" value="${e(state.query)}"></label>
      <label>الترتيب<select data-ka-sort>
        ${[['newest','الأحدث أولًا'],['oldest','الأقدم أولًا'],['title','العنوان']].map(([value,label]) =>
          `<option value="${value}" ${state.sort === value ? 'selected' : ''}>${label}</option>`).join('')}
      </select></label><button class="btn btn-outline" data-ka-action="refresh" ${state.busy || state.loading ? 'disabled' : ''}>${ico('refresh', 16)} تحديث</button>
      </div><div class="ka-rows" data-ka-rows aria-busy="${state.loading}">${rowList()}</div></section>`;
  }

  function rowList() {
    if (state.loading) return '<p role="status">جارٍ تحميل السجلات…</p>';
    if (!state.loaded) return '';
    const achievements = section === 'achievements';
    const query = state.query.trim().toLocaleLowerCase('ar');
    const rows = state.rows.filter(row =>
      [row.title, row.category, row.participants].some(x => (x || '').toLocaleLowerCase('ar').includes(query)));
    const sortDate = row => row.event_date || row.created_at;
    rows.sort((a,b) => state.sort === 'title' ? a.title.localeCompare(b.title, 'ar') :
      (state.sort === 'oldest' ? 1 : -1) * String(sortDate(a)).localeCompare(String(sortDate(b))));
    if (!rows.length) return `<p>${query ? 'لا توجد نتائج تطابق البحث.' : achievements ? 'لا توجد إنجازات مضافة حاليًا' : 'لا توجد مواقع أو أدوات مضافة حاليًا.'}</p>`;
    return rows.map(row => {
      const photo = row.images?.[0];
      const meta = [row.category, row.event_date, row.published ? 'منشور' : 'مسودة'].filter(Boolean);
      return `<article class="ka-row">${photo ? serverImage(photo, row.title, 'ka-thumb') : ''}
        <div class="ka-row-info"><h2>${e(row.title)}</h2><p>${meta.map(e).join(' · ')}</p></div>
        <div class="ka-row-actions"><button class="btn btn-outline btn-sm" data-ka-action="edit" data-id="${e(row.id)}" ${state.busy ? 'disabled' : ''}>تعديل<span class="ka-sr"> ${e(row.title)}</span></button>
        <button class="btn btn-danger btn-sm" data-ka-action="delete" data-id="${e(row.id)}" ${state.busy ? 'disabled' : ''}>حذف<span class="ka-sr"> ${e(row.title)}</span></button></div></article>`;
    }).join('');
  }

  function serverImage(photo, alt, css = '') {
    return `<img loading="lazy" class="${css}" data-ka-image="${e(photo.id)}" alt="${e(alt)}">`;
  }

  function edit(row = {}) {
    clearEditor();
    state.editor = {
      record: {...row, published: !!row.published},
      photos: (row.images || []).map(stored => ({stored})),
      consent: false
    };
    state.error = state.feedback = '';
    render();
    document.querySelector('#ka-form [name="title"]')?.focus();
  }

  function field(name, label, limit, type = 'text', required = false) {
    const value = e(state.editor.record[name]);
    const attrs = `name="${name}" ${name === 'category' ? 'list="ka-categories"' : ''} ${required ? 'required' : ''} ${limit ? 'maxlength="'+limit+'"' : ''}`;
    const input = type === 'textarea' ? `<textarea rows="4" ${attrs}>${value}</textarea>` :
      `<input type="${type}" ${attrs} value="${value}" ${type === 'url' ? 'dir="ltr" placeholder="https://"' : ''}>`;
    return `<label ${type === 'textarea' ? 'class="ka-wide"' : ''}>${label}${input}</label>`;
  }

  function editorView() {
    const {record, photos, consent} = state.editor;
    const achievement = section === 'achievements';
    const name = achievement ? 'إنجاز' : 'موقع';
    const categories = new Set([...(achievement ? ['مسابقة', 'مشاركة مدرسية', 'تكريم'] : ['حاسبة تعليمية', 'موقع تعليمي', 'أداة مرتبطة بالدروس']),
      ...state.rows.map(row => row.category).filter(Boolean)]);
    return `<form id="ka-form" class="surface panel"><fieldset ${state.busy ? 'disabled' : ''}>
      <legend>${record.id ? 'تعديل' : 'إضافة'} ${name}</legend>
      <div class="ka-fields">
        ${field('title', achievement ? 'عنوان الإنجاز (مطلوب)' : 'عنوان الموقع (مطلوب)', 180, 'text', true)}
        ${field('category', achievement ? 'نوع الإنجاز أو المسابقة' : 'التصنيف', 100)}
        <datalist id="ka-categories">${[...categories].map(value => `<option value="${e(value)}"></option>`).join('')}</datalist>
        ${field('description', 'الوصف', 2500, 'textarea')}
        ${achievement ? `${field('participants', 'اسم الطالب أو الطلاب', 500)}${field('placement', 'المركز المحقق', 100)}
          ${field('event_date', 'تاريخ المسابقة', null, 'date')}` : field('url', 'الرابط الخارجي (HTTPS، مطلوب)', 2048, 'url', true)}
        <label>حالة النشر<select name="published">
          <option value="draft" ${!record.published ? 'selected' : ''}>مسودة</option><option value="published" ${record.published ? 'selected' : ''}>منشور</option>
        </select></label></div>
      ${achievement ? `<section class="ka-media"><h3>صور الإنجاز</h3>
       <p>حتى ٨ صور بصيغة JPG أو PNG أو WebP. الحد لكل صورة ٢ م.ب، وللمجموعة ٨ م.ب.</p>
       <div class="ka-fields"><label>رفع الصورة الرئيسية<input type="file" data-ka-files="cover" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"></label>
       <label>رفع صور إضافية<input type="file" data-ka-files="additional" multiple accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"></label></div>
       <div class="ka-photos">${photos.map(photoView).join('')}</div></section>
       <label class="ka-consent" ${needsConsent() ? '' : 'hidden'}><input type="checkbox" name="consent" ${consent ? 'checked' : ''} ${needsConsent() ? 'required' : ''}>تتوفر الموافقات اللازمة لنشر أسماء المشاركين أو صور الإنجاز.</label>` : ''}
      <div class="ka-form-actions"><button type="submit" class="btn btn-primary">${state.busy ? 'جارٍ الحفظ…' : 'حفظ '+(achievement ? 'الإنجاز' : 'الموقع')}</button>
      <button type="button" class="btn btn-outline" data-ka-action="cancel">إلغاء</button></div></fieldset></form>`;
  }

  function photoView(photo, index) {
    const alt = index === 0 ? 'الصورة الرئيسية' : 'صورة إضافية '+nf(index);
    return `<figure>${photo.file ? `<img src="${e(photo.preview)}" alt="${e(alt)}">` : serverImage(photo.stored, alt)}
      <figcaption><strong>${e(alt)}</strong><div>
      ${index ? `<button type="button" class="btn btn-outline btn-sm" data-ka-action="cover" data-index="${index}">تعيين كرئيسية</button>` : ''}
      <button type="button" class="btn btn-outline btn-sm" data-ka-action="remove-photo" data-index="${index}">إزالة<span class="ka-sr"> ${e(alt)}</span></button></div></figcaption></figure>`;
  }

  function needsConsent() {
    const {record, photos} = state.editor;
    return section === 'achievements' && record.published && (record.participants?.trim() || photos.length);
  }

  function updateConsent(form) {
    const checkbox = form.elements.namedItem('consent');
    if (!checkbox) return;
    checkbox.required = Boolean(needsConsent());
    checkbox.closest('label').hidden = !checkbox.required;
  }

  function addPhotos(input) {
    const files = [...input.files];
    if (!files.length) return;
    const {photos} = state.editor;
    state.error = '';
    if (files.some(file => !/\.(jpe?g|png|webp)$/i.test(file.name) || (file.type && !['image/jpeg','image/png','image/webp'].includes(file.type)))) {
      state.error = 'اختر صورة بصيغة JPG أو PNG أو WebP.';
    } else if (files.some(file => !file.size || file.size > KnowledgeAPI.MAX_IMAGE_BYTES)) {
      state.error = 'يجب ألا تكون الصورة فارغة أو يتجاوز حجمها ٢ م.ب.';
    } else if (photos.length + files.length > KnowledgeAPI.MAX_IMAGES) {
      state.error = 'يمكن حفظ ٨ صور كحد أقصى لكل إنجاز.';
    } else if (photos.reduce((size, p) => size + (p.file?.size || p.stored?.bytes || 0), 0) + files.reduce((size, f) => size + f.size, 0) > KnowledgeAPI.MAX_TOTAL_BYTES) {
      state.error = 'يجب ألا يتجاوز مجموع أحجام الصور ٨ م.ب.';
    } else {
      const selected = files.map(file => ({file, preview: URL.createObjectURL(file)}));
      if (input.dataset.kaFiles === 'cover') photos.unshift(...selected);
      else photos.push(...selected);
      state.editor.consent = false;
    }
    render();
  }

  async function mutate(snapshot, operation, pending, success) {
    if (!active(snapshot) || state.busy) return;
    state.busy = true;
    state.error = '';
    state.feedback = pending;
    render();
    try {
      await operation();
      if (!active(snapshot)) return;
      clearEditor();
      state.feedback = success;
      state.loading = true;
      state.loaded = false;
      await load(snapshot);
    } catch (error) {
      if (active(snapshot)) {
        state.feedback = '';
        state.error = error.message || 'تعذر حفظ التغيير. تحقق من الاتصال وحاول مجددًا.';
      }
    } finally {
      if (active(snapshot)) {
        state.busy = false;
        render();
      }
    }
  }

  function save(event) {
    if (event.target.id !== 'ka-form') return;
    event.preventDefault();
    if (!active() || state.busy || !state.editor) return;
    const {record, photos, consent} = state.editor;
    if (needsConsent() && !consent) return;
    const achievement = section === 'achievements';
    const payload = {...record};
    const images = photos.map(photo => photo.file || photo.stored);
    void mutate(state, () => achievement ? KnowledgeAPI.saveAchievement(payload, images) : KnowledgeAPI.saveTool(payload),
      images.some(img => img instanceof File) ? 'جارٍ رفع الصور وحفظ الإنجاز…' : 'جارٍ الحفظ…',
      payload.published ? 'تم حفظ المحتوى ونشره.' : 'تم حفظ المسودة.');
  }

  function click(event) {
    const tab = event.target.closest('[data-ka-tab]');
    if (tab && authState().isAdmin) return changeSection(tab.dataset.kaTab);
    const button = event.target.closest('[data-ka-action]');
    if (!button || !active() || state.busy) return;
    const action = button.dataset.kaAction;
    const row = state.rows.find(x => x.id === button.dataset.id);
    if (action === 'new') return edit();
    if (action === 'edit' && row) return edit(row);
    if (action === 'refresh') {
      if (state.loading) return;
      state.loading = true;
      state.feedback = state.error = '';
      render();
      return void load(state);
    }
    if (action === 'delete' && row) {
      const achievement = section === 'achievements';
      const message = achievement ? 'سيُحذف الإنجاز وجميع صوره نهائيًا.' : 'سيُحذف الموقع من قائمة الأدوات نهائيًا.';
      if (window.confirm(`هل تريد حذف «${row.title}»؟\n${message}`)) {
        void mutate(state, () => achievement ? KnowledgeAPI.deleteAchievement(row) : KnowledgeAPI.deleteTool(row),
          'جارٍ الحذف…', achievement ? 'تم حذف الإنجاز وصوره.' : 'تم حذف الموقع.');
      }
      return;
    }
    if (action === 'cancel') {
      clearEditor();
      state.feedback = state.error = '';
      render();
      document.querySelector('[data-ka-action="new"]')?.focus();
      return;
    }
    if (!state.editor || !['cover','remove-photo'].includes(action)) return;
    const photos = state.editor.photos;
    const [photo] = photos.splice(Number(button.dataset.index), 1);
    if (!photo) return;
    if (action === 'cover') photos.unshift(photo);
    else if (photo.preview) URL.revokeObjectURL(photo.preview);
    render();
  }

  function change(event) {
    if (!active() || state.busy) return;
    const {target} = event;
    if (target.hasAttribute('data-ka-files') && event.type === 'change') return addPhotos(target);
    if (target.matches('[data-ka-search],[data-ka-sort]')) {
      if (target.hasAttribute('data-ka-search')) state.query = target.value;
      else state.sort = target.value;
      document.querySelector('[data-ka-rows]').innerHTML = rowList();
      observeImages();
      return;
    }
    if (state.editor && target.form?.id === 'ka-form' && target.name) {
      if (target.name === 'consent') state.editor.consent = target.checked;
      else {
        state.editor.record[target.name] = target.name === 'published' ? target.value === 'published' : target.value;
        if (target.name === 'participants') state.editor.consent = false;
        const checkbox = target.form.elements.namedItem('consent');
        if (checkbox) checkbox.checked = state.editor.consent;
      }
      updateConsent(target.form);
    }
  }

  function observeImages() {
    imageObserver?.disconnect();
    if (!active()) return;
    const snapshot = state;
    const photos = new Map(state.rows.flatMap(row => (row.images || []).map(photo => [photo.id, photo])));
    const fetchImage = async image => {
      const photo = photos.get(image.dataset.kaImage);
      if (!photo) return;
      try {
        const url = await KnowledgeAPI.imageUrl(photo);
        if (active(snapshot) && image.isConnected) image.src = url;
      } catch {
        if (image.isConnected) image.alt = 'تعذر تحميل معاينة الصورة';
      }
    };
    if (typeof IntersectionObserver === 'function') {
      imageObserver = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
          imageObserver.unobserve(entry.target);
          void fetchImage(entry.target);
        }
      }, {rootMargin: '150px'});
    }
    for (const image of document.querySelectorAll('#knowledge-admin [data-ka-image]')) {
      if (imageObserver) imageObserver.observe(image);
      else void fetchImage(image);
    }
  }

  function bind() {
    const root = document.getElementById('knowledge-admin');
    if (!root || root.dataset.bound || !authState().isAdmin) return;
    root.dataset.bound = 'true';
    root.addEventListener('click', click);
    root.addEventListener('input', change);
    root.addEventListener('change', change);
    root.addEventListener('submit', save);
    observeImages();
  }

  return {view, bind, reset};
})();
