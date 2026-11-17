# نشر المنصة

الفرع المحلي `digital-platform` مبني على `accounts-setup` عند `fae574ddd49892f1f55a34a680ed2089611ef6a9`. لا توجد نسخة العمل غير المدفوعة من المحادثة السابقة.

## التشغيل

استخدم Node.js 24 وChromium في `/usr/bin/chromium`:

```sh
npm ci --cache /workspace/.npm-cache
npm run build
npm start
```

وفي طرفية أخرى، من مجلد المستودع:

```sh
npm run check
npm run test:learning
npm run test:scenes
```

الخادم يدعم الجذر ومسار `/islam/` وطلبات Range للفيديو. روابط الدروس تستخدم `#learning/u01_l01`، فتعمل إعادة التحميل دون إعادة كتابة مسارات على الخادم.

## المصادر

المرفقات الأصلية خارج الموقع. الفيديوهات الأصلية الـ26 في `public/videos/`. مقتطفات السؤال والإجابة المصوّرة في `public/content/` تحافظ على ترتيب الحروف العربية، ولا تُنسخ ملفات PDF الأصلية إلى الإنتاج. بيانات المصدر في `data/learning-manifest.json` وتفاصيل المعالجة وحدودها في `data/extraction-repairs.json`.

إعادة الاستيراد تتطلب Python وPyMuPDF والمرفقات بنفس أسمائها، داخل مجلدات فرعية:

```sh
python scripts/import-learning.py /workspace/attachments
```

لا تحتاج عملية البناء الاعتيادية إلى المرفقات أو Python. الخط Tajawal محلي، ورخصته في `public/fonts/OFL.txt`.

لتغيير استضافة الفيديو، عدّل `config/media.json`، وضع في `baseUrl` عنوان HTTPS لمجلد يحتوي `videos/u01_l01.mp4` وبقية الملفات بالمسارات نفسها، ثم أعد البناء. يجب أن تدعم الاستضافة HTTPS وRange وأن تسمح بسياسة الوصول المناسبة. لا توجد خدمة فيديو خارجية مفترضة.

## GitHub Pages

الإعداد المستخدم حاليًا هو النشر من فرع `gh-pages`. المصدر محفوظ على فرع `digital-platform`. نُشرت النسخة الحالية بنجاح في العملية:
https://github.com/ayoubalbtoosh/islam/actions/runs/44047455340

لتحديث النسخة بعد البناء والاختبار وحفظ المصدر في Git:

```sh
git push origin digital-platform
python scripts/publish-pages.py --push
```

يحافظ السكربت على تاريخ `gh-pages` ويرفض نشر PDF أصلي أو نسخة بلا الفيديوهات الـ26، ويحافظ على CNAME إن وُجد، ولا يستخدم force push. ينشر `dist` فقط، ويسجل التزام المصدر وبصمة HTML في `release.json`. تحقق دائمًا من اكتمال عملية Pages الجديدة في GitHub؛ نجاح push وحده لا يكفي.

يوجد أيضًا Workflow يدوي للنشر عبر GitHub Actions إذا انتقل المستودع لاحقًا إلى هذا الأسلوب؛ لا تغيّر إعداد Pages دون اختيار طريقة النشر المقصودة. لا يحتاج الأسلوب الحالي إلى هذا التغيير.

الرابط: https://ayoubalbtoosh.github.io/islam/ . تأكد خارجيًا من البريد وSupabase والمزامنة بين جهازين؛ فحوصنا للخدمات تعتمد على المحاكاة. اختبار الموقع المباشر من البيئة محجوب بـ403 رغم نجاح عملية النشر المؤكدة من GitHub.
