// The three editorial examples are bundled from data/knowledge-topics.json.
const Knowledge = (() => {

  const fallbackAchievements = 'لا توجد إنجازات مضافة حاليًا';
  const retryButton = '<button type="button" class="btn btn-outline btn-sm" data-k-retry>إعادة المحاولة</button>';
  let disconnect = () => {};

  function section(title, icon, content) {
    return `<section class="knowledge-section"><h2><span class="knowledge-section-icon">${ico(icon,21)}</span>${title}</h2>${content}</section>`;
  }

  function view() {
    const lessons = KNOWLEDGE_TOPICS.map(topic => `<article class="knowledge-topic">
      <div class="knowledge-topic-skill">${ico(topic.icon,17)}${e(topic.subject)}</div>
      <h3>${e(topic.title)}</h3><p>${e(topic.introduction)}</p>
      <details><summary>اعرف المزيد<span class="sr-only"> عن ${e(topic.title)}</span></summary><p>${e(topic.example)}</p></details>
    </article>`).join('');
    return `<div id="knowledge-page" class="knowledge-page">
      <header class="heading"><h1>التكامل المعرفي</h1></header>
      ${section('الإنجازات والمسابقات والمشاركات', 'trophy', '<div data-k-achievements role="status">جارٍ تحميل الإنجازات…</div>')}
      ${section('التربية الإسلامية في حياتنا', 'book', `<div class="knowledge-grid">${lessons}</div>`)}
      ${section('مواقع وأدوات مفيدة', 'list', '<div data-k-tools role="status">جارٍ تحميل المواقع والأدوات…</div>')}
      <dialog class="knowledge-dialog" aria-labelledby="knowledge-detail-title"></dialog>
    </div>`;
  }

  function empty(icon, title, message) {
    return `<div class="knowledge-empty">${ico(icon,30)}<div><strong>${title}</strong><p>${message}</p></div></div>`;
  }

  function metadata(record) {
    let date = '';
    if (record.event_date) {
      const day = new Date(record.event_date + 'T00:00:00Z');
      if (Number.isFinite(day.getTime())) {
        date = `<time datetime="${e(record.event_date)}">${day.toLocaleDateString('ar-JO', {dateStyle:'medium', timeZone:'UTC'})}</time>`;
      }
    }
    return [record.category && `<span>${e(record.category)}</span>`, record.placement && `<span>المركز: ${e(record.placement)}</span>`, date]
      .filter(Boolean).join('');
  }

  function imageFrame(image, alt) {
    return `<div class="knowledge-picture" data-k-image="${e(image.id)}">
      <span class="knowledge-image-status">جارٍ تحميل الصورة…</span><img alt="${e(alt)}" decoding="async" hidden>
    </div>`;
  }

  function card(record) {
    return `<article class="knowledge-card">
      ${record.images.length ? imageFrame(record.images[0], record.title) : ''}
      <div class="knowledge-card-body"><div class="knowledge-meta">${metadata(record)}</div>
        <h3>${e(record.title)}</h3>${record.description ? `<p>${e(record.description)}</p>` : ''}
        <button type="button" class="text-link" data-k-open="${e(record.id)}" aria-label="عرض التفاصيل: ${e(record.title)}">عرض التفاصيل ${ico('arrow',17)}</button>
      </div></article>`;
  }

  function linkCard(tool) {
    const safe = KnowledgeAPI.httpsUrl(tool.url);
    if (!safe) return '';
    const url = new URL(safe);
    return `<a class="knowledge-tool" href="${e(url.href)}" target="_blank" rel="noopener noreferrer">
      ${tool.category ? `<span class="knowledge-meta">${e(tool.category)}</span>` : ''}<h3>${e(tool.title)}</h3>
      ${tool.description ? `<p>${e(tool.description)}</p>` : ''}<span class="knowledge-tool-url" dir="ltr">${e(url.host)} ↗</span>
      <span class="sr-only">يفتح في علامة تبويب جديدة</span></a>`;
  }

  function bind() {
    disconnect();
    const page = document.getElementById('knowledge-page');
    if (!page) return;
    const achievementList = page.querySelector('[data-k-achievements]');
    const tools = page.querySelector('[data-k-tools]');
    const dialog = page.querySelector('dialog');
    let achievements = new Map();
    let images = new Map();
    let selected = null;
    let index = 0;
    let readVersion = 0;
    let previousAchievements, previousLinks;
    let lastReadAt = 0;

    async function showImage(frame) {
      const image = images.get(frame.dataset.kImage);
      if (!image || !frame.isConnected || frame.dataset.loading) return;
      frame.dataset.loading = 'true';
      const img = frame.querySelector('img');
      const status = frame.querySelector('.knowledge-image-status');
      try {
        const src = await KnowledgeAPI.imageUrl(image);
        if (!frame.isConnected) return;
        img.src = src;
        await img.decode();
        if (!frame.isConnected) return;
        img.hidden = false;
        status.hidden = true;
      } catch {
        if (frame.isConnected) {
          delete frame.dataset.loading;
          status.innerHTML = 'تعذر عرض الصورة. <button type="button" class="text-link" data-k-retry-image>إعادة تحميل الصورة</button>';
        }
      }
    }

    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        observer.unobserve(entry.target);
        void showImage(entry.target);
      }
    }, {rootMargin:'100px'}) : null;

    async function refresh() {
      const version = ++readVersion;
      lastReadAt = Date.now();
      achievementList.setAttribute('aria-busy', 'true');
      tools.setAttribute('aria-busy', 'true');
      try {
        const rows = await KnowledgeAPI.list();
        if (!page.isConnected || version !== readVersion) return;
        const published = rows.achievements.filter(item => item.published);
        const signature = JSON.stringify(published);
        if (signature !== previousAchievements) {
          previousAchievements = signature;
          achievements = new Map(published.map(item => [item.id, item]));
          images = new Map(published.flatMap(item => item.images.map(image => [image.id, image])));
          if (dialog.open && JSON.stringify(achievements.get(selected.id)) !== JSON.stringify(selected)) dialog.close();
          observer?.disconnect();
          achievementList.innerHTML = published.length ? `<div class="knowledge-grid">${published.map(card).join('')}</div>` :
            empty('award', fallbackAchievements, 'سيتم عرض إنجازات طلاب المدرسة ومشاركاتهم في المسابقات والأنشطة الدينية هنا قريبًا.');
          for (const frame of achievementList.querySelectorAll('[data-k-image]')) {
            if (observer) observer.observe(frame);
            else void showImage(frame);
          }
        }
        const links = rows.tools.filter(tool => tool.published).map(linkCard).join('');
        if (links !== previousLinks) {
          previousLinks = links;
          tools.innerHTML = links ? `<div class="knowledge-grid">${links}</div>` :
            empty('book', 'لا توجد مواقع أو أدوات مضافة حاليًا', 'ستظهر هنا الروابط التعليمية التي ينشرها الأستاذ.');
        }
      } catch {
        if (!page.isConnected || version !== readVersion) return;
        previousAchievements = previousLinks = undefined;
        observer?.disconnect();
        if (dialog.open) dialog.close();
        achievementList.innerHTML = `<div class="knowledge-error">تعذر تحميل الإنجازات. ${retryButton}</div>`;
        tools.innerHTML = `<div class="knowledge-error">تعذر تحميل المواقع والأدوات. ${retryButton}</div>`;
      } finally {
        if (version === readVersion) {
          achievementList.removeAttribute('aria-busy');
          tools.removeAttribute('aria-busy');
        }
      }
    }

    function showSlide() {
      const gallery = dialog.querySelector('[data-k-slide]');
      const current = selected.images[index];
      gallery.innerHTML = imageFrame(current, `${selected.title}، الصورة ${nf(index + 1)}`);
      void showImage(gallery.firstElementChild);
      const count = dialog.querySelector('[data-k-count]');
      if (count) count.textContent = `الصورة ${nf(index + 1)} من ${nf(selected.images.length)}`;
    }

    function openRecord(record) {
      selected = record;
      index = 0;
      dialog.innerHTML = `<header><h2 id="knowledge-detail-title">${e(record.title)}</h2>
        <button type="button" class="icon-btn" data-k-close aria-label="إغلاق تفاصيل الإنجاز" autofocus>${ico('close',18)}</button></header>
        ${record.images.length ? '<div data-k-slide></div>' : ''}
        ${record.images.length > 1 ? '<div class="knowledge-controls"><button type="button" class="btn btn-outline btn-sm" data-k-step="-1">السابق</button><span data-k-count role="status"></span><button type="button" class="btn btn-outline btn-sm" data-k-step="1">التالي</button></div>' : ''}
        <div class="knowledge-meta">${metadata(record)}</div>
        ${record.description ? `<p>${e(record.description)}</p>` : ''}
        ${record.participants ? `<p><strong>المشاركون</strong><br>${e(record.participants)}</p>` : ''}`;
      dialog.showModal();
      if (record.images.length) showSlide();
    }

    page.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-k-retry')) { button.disabled = true; void refresh(); }
      if (button.hasAttribute('data-k-retry-image')) void showImage(button.closest('[data-k-image]'));
      if (button.hasAttribute('data-k-close')) dialog.close();
      const record = achievements.get(button.dataset.kOpen);
      if (record) openRecord(record);
      if (button.dataset.kStep && selected) {
        index = (index + Number(button.dataset.kStep) + selected.images.length) % selected.images.length;
        showSlide();
      }
    });
    dialog.addEventListener('close', () => {
      if (dialog.open) return;
      dialog.replaceChildren();
      selected = null;
    });
    function refreshVisible() {
      if (page.isConnected && !document.hidden && Date.now() - lastReadAt > 1000) void refresh();
    }
    const interval = setInterval(refreshVisible, 60000);
    document.addEventListener('school-content-changed', refresh);
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    disconnect = () => {
      clearInterval(interval);
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
      document.removeEventListener('school-content-changed', refresh);
      observer?.disconnect();
      disconnect = () => {};
    };
    void refresh();
  }
  return {view, bind};
})();
