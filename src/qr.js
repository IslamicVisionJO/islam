const siteQrFilename = 'islamic-education-website-qr.png';

function siteQrView() {
  if (!SITE_SHARE) return '';
  const url = e(SITE_SHARE.url);
  return `<div class="site-qr">
    <div class="site-qr-actions">
      <button type="button" data-site-qr="share" title="مشاركة الموقع">
        <svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 10.5 6.5-4m-6.5 7 6.5 4"/></svg>
        مشاركة الموقع
      </button>
      <button type="button" data-site-qr="options" class="site-qr-more" title="خيارات المشاركة" aria-label="خيارات نسخ رابط الموقع وتنزيل الرمز" aria-haspopup="dialog">•••</button>
    </div>
    <figure><figcaption>امسح الرمز لزيارة الموقع</figcaption><img src="${SITE_SHARE.png}" width="148" height="148" alt="رمز QR لرابط المنصة"></figure>
    <dialog class="site-qr-dialog" aria-labelledby="site-qr-dialog-title">
      <div class="site-qr-dialog-head"><h2 id="site-qr-dialog-title">مشاركة الموقع</h2>
        <button type="button" data-site-qr="close" aria-label="إغلاق خيارات المشاركة">${ico('close',18)}</button></div>
      <label for="site-public-link">رابط المنصة</label>
      <input id="site-public-link" dir="ltr" readonly value="${url}">
      <div class="site-qr-options">
        <button type="button" data-site-qr="copy">نسخ الرابط</button>
        <a href="${SITE_SHARE.png}" download="${siteQrFilename}">${ico('download',17)} تنزيل رمز QR بصيغة PNG</a>
        <a href="https://wa.me/?text=${encodeURIComponent(SITE_SHARE.url)}" target="_blank" rel="noopener noreferrer">مشاركة عبر واتساب</a>
      </div>
      <p class="site-qr-status" role="status" aria-live="polite"></p>
    </dialog>
  </div>`;
}

function openSiteQrOptions(dialog, message = '') {
  dialog.querySelector('[role=status]').textContent = message;
  if (!dialog.open) dialog.showModal();
}

async function copySiteQrLink(dialog) {
  const input = dialog.querySelector('input');
  const status = dialog.querySelector('[role=status]');
  try {
    await navigator.clipboard.writeText(SITE_SHARE.url);
    status.textContent = 'تم نسخ رابط الموقع.';
  } catch {
    input.focus();
    input.select();
    try {
      if (document.execCommand('copy')) {
        status.textContent = 'تم نسخ رابط الموقع.';
        return;
      }
    } catch {}
    status.textContent = 'حدّدنا الرابط لك. اختر نسخ من قائمة جهازك.';
  }
}

async function shareSiteQr(button, dialog) {
  if (typeof navigator.share !== 'function') return openSiteQrOptions(dialog);
  if (button.getAttribute('aria-busy') === 'true') return;
  button.setAttribute('aria-busy', 'true');
  try {
    let payload = {title: 'التربية الإسلامية برؤية رقمية', url: SITE_SHARE.url};
    if (typeof navigator.canShare === 'function' && typeof File === 'function') {
      const data = atob(SITE_SHARE.png.split(',')[1]);
      const file = new File([Uint8Array.from(data, char => char.charCodeAt(0))], siteQrFilename, {type: 'image/png'});
      const withImage = {...payload, files: [file]};
      if (navigator.canShare(withImage)) payload = withImage;
    }
    await navigator.share(payload);
  } catch (error) {
    if (error.name !== 'AbortError') openSiteQrOptions(dialog, 'تعذرت المشاركة المباشرة. اختر إحدى الطرق المتاحة.');
  } finally {
    button.removeAttribute('aria-busy');
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-site-qr]');
  if (!button) return;
  const dialog = button.closest('.site-qr').querySelector('dialog');
  switch (button.dataset.siteQr) {
    case 'share': shareSiteQr(button, dialog); break;
    case 'options': openSiteQrOptions(dialog); break;
    case 'copy': copySiteQrLink(dialog); break;
    case 'close': dialog.close(); break;
  }
});
