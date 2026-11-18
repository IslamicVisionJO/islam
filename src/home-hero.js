/** Original supplied artwork only. Disabled until its local asset is available. */
function HomeHeroBanner(){
 if(!HOME_HERO.src)return '';
 return `<section class="home-hero-banner" aria-label="البانر الرسمي للمنصة"><img src="${e(HOME_HERO.src)}" width="${HOME_HERO.width}" height="${HOME_HERO.height}" alt="التربية الإسلامية برؤية رقمية — الأستاذ محمد الطميزي — الثاني ثانوي BTEC" fetchpriority="high" loading="eager" decoding="async"><p>بإشراف الأستاذ <strong>محمد الطميزي</strong></p></section>`;
}
