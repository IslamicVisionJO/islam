import { access, readdir, readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import { build as bundle } from 'esbuild';
import { validateFirstBtec } from './first-btec.mjs';
import { revisionData } from './revision-data.mjs';
import { buildSiteShare } from './site-qr.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFile(path.join(root, name), 'utf8');
const lessons = JSON.parse(await read('data/lessons.json'));
const reviewPreview = process.argv.includes('--review');
const release = !reviewPreview && !process.argv.includes('--legacy')
  ? JSON.parse(await read('config/question-bank-release.json')) : null;
if (release) {
  for (const name of ['questions.json','lesson-wizari-index.json','games-challenges-index.json']) {
    const hash = createHash('sha256').update(await read('review/bank/'+name)).digest('hex');
    if (hash !== release.sha256?.[name]) throw Error('The approved bank has changed: '+name);
  }
}
const bank = reviewPreview || release
  ? await (await import('./review-bank.mjs')).loadReviewBank(new URL('../', import.meta.url), lessons)
  : null;
const legacyBank = JSON.parse(await read('data/questions.json'));
if (legacyBank.questions.some(q=>q.delivery_allocation)) throw Error('The archived bank must stay separate.');
const questions = bank ? {questions: bank.gameQuestions} : legacyBank;
if (bank) {
  const legacyIds = new Set(legacyBank.questions.map(q=>q.id));
  const candidates = [...bank.gameQuestions, ...Object.values(bank.ministerial).flatMap(levels=>Object.values(levels).flat())];
  if (candidates.some(q=>legacyIds.has(q.id))) throw Error('Candidate IDs collide with archived question IDs.');
}
const savedAuthConfig = JSON.parse(await read('config/auth.public.json'));
const authConfig = reviewPreview ? {url:"",publishableKey:""} : {url:process.env.SUPABASE_URL||savedAuthConfig.url||'',publishableKey:process.env.SUPABASE_PUBLISHABLE_KEY||savedAuthConfig.publishableKey||''};
if(Object.keys(savedAuthConfig).some(k=>!['url','publishableKey'].includes(k))) throw Error('Unexpected auth configuration; never embed server secrets');
if (Object.keys(authConfig).some(k=>!['url','publishableKey'].includes(k))) throw Error('Unexpected auth configuration; never embed server secrets');
if (/^sb_secret_/i.test(authConfig.publishableKey||'')) throw Error('Secret server key cannot be embedded');
if ((authConfig.publishableKey||'').split('.').length===3) { const role=JSON.parse(Buffer.from(authConfig.publishableKey.split('.')[1],'base64url').toString()).role; if(role!=='anon') throw Error('Only public anon key may be embedded'); }
const vendor=await bundle({stdin:{contents:"export {createClient} from '@supabase/supabase-js';",resolveDir:root},bundle:true,format:'iife',globalName:'SupabaseSDK',target:'es2022',platform:'browser',write:false,minify:true,legalComments:'eof'});
const knowledgeTopics = JSON.parse(await read('data/knowledge-topics.json'));
const homeHero=JSON.parse(await read('config/home-hero.json'));
if(homeHero.src){
 if(!/^assets\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/.test(homeHero.src)||![homeHero.width,homeHero.height].every(n=>Number.isInteger(n)&&n>0))throw Error('Invalid original home banner configuration');
 await access(path.join(root,'public',homeHero.src));
}
const sources = await Promise.all(['core', 'storage', 'auth', 'sound', 'wall-core', 'wall', 'wall-match', 'wall-admin', 'home-hero', 'qr', 'ui', 'online', 'educational-core', 'educational-boards', 'educational-scenes', 'educational', 'study', 'revision', 'ministerial', 'steam-calculators', 'enrichment', 'book-solutions', 'learning', 'knowledge-api', 'knowledge', 'knowledge-admin', 'academic-semester', 'academic-admin', 'controller'].map(name => read(`src/${name}.js`)));
// Canonical editorial metadata stays in data/questions.json. Embed only fields used by the offline runtime.
const runtimeRecord = q => ({
  id:q.id,unit_id:q.unit_id,lesson_id:q.lesson_id,difficulty:q.difficulty,type:q.type,topic:q.topic,
  prompt:q.prompt,payload:q.payload,answer:q.answer,explanation:q.explanation,
  source:{document_id:q.source?.document_id,printed_pages:q.source?.printed_pages,pdf_pages:q.source?.pdf_pages},
  review:{answer_checked:q.review?.answer_checked,source_checked:q.review?.source_checked,excluded:q.review?.excluded,verification_status:q.review?.verification_status}
});
const runtimeQuestions = { ...questions, questions: questions.questions.map(runtimeRecord) };
if (bank) runtimeQuestions.archivedQuestions = legacyBank.questions.map(runtimeRecord);
const ministerialQuestions = bank ? Object.fromEntries(Object.entries(bank.ministerial).map(([lesson,levels])=>[
  lesson,Object.fromEntries(Object.entries(levels).map(([level,questions])=>[level,questions.map(runtimeRecord)]))
])) : null;
const learning=JSON.parse(await read('data/learning-manifest.json'));
const firstBtecLessons=JSON.parse(await read('data/first-btec-lessons.json'));
const bankReviewFiles = ['questions','lesson-wizari-index','games-challenges-index','PRIORITY_REVIEW'];
const [firstBtecBank, firstMinisterialIndex, firstGamesIndex, priority] = await Promise.all(
  bankReviewFiles.map(async name=>JSON.parse(await read('review/first-btec/'+name+'.json')))
);
validateFirstBtec(firstBtecLessons, firstBtecBank, [
  ...legacyBank.questions.map(q=>q.id), ...(bank?.gameQuestions ?? []).map(q=>q.id),
  ...Object.values(bank?.ministerial ?? {}).flatMap(levels=>Object.values(levels).flatMap(list=>list.map(q=>q.id)))
], {ministerial:firstMinisterialIndex,games:firstGamesIndex,priority});
for (const unit of firstBtecLessons) for (const lesson of unit.lessons) {
  const video = 'videos/first-btec/'+lesson.id+'.mp4';
  await access(path.join(root, 'public', video));
  lesson.video = video;
}
const bookSolutions=JSON.parse(await read('data/book-solutions.json'));
const wallIds=JSON.parse(await read('data/wall-question-ids.json'));
const media=JSON.parse(await read('config/media.json'));
const compendiumExam=JSON.parse(await read('data/compendium-exam.json'));
const guides=JSON.parse(await read('data/lesson-guides.json'));
const summaries=JSON.parse(await read('data/lesson-summaries.json'));
const academicSemester=JSON.parse(await read('data/academic-semester-one.json'));
const academicStudy=JSON.parse(await read('data/academic-semester-one-study.json'));
const academicMemorization=JSON.parse(await read('data/academic-memorization.json'));
const academicResources=JSON.parse(await read('data/academic-semester-resources.json'));
const revision=revisionData({review:reviewPreview});
const outputDir=path.join(root,reviewPreview?'.review-dist':'dist','lesson-data');
await mkdir(outputDir,{recursive:true});
const lessonFiles={};
for(const lesson of revision.catalog){
 lessonFiles[lesson.id]={};
 for(const [kind,records] of Object.entries({rows:revision.chapters[lesson.id],levels:ministerialQuestions?.[lesson.id]})){
  if(!records)continue;
  const payload=JSON.stringify({[kind]:records});
  const file=lesson.id+'-'+kind+'-'+createHash('sha256').update(payload).digest('hex').slice(0,12)+'.json';
  await writeFile(path.join(outputDir,file),payload);
  lessonFiles[lesson.id][kind]=file;
 }
}
const currentFiles=new Set(Object.values(lessonFiles).flatMap(Object.values));
for(const name of await readdir(outputDir)){
  if(/^(?:s1_)?u\d{2}_l\d{2}-(?:(?:rows|levels)-)?[0-9a-f]{12}\.json$/.test(name)&&!currentFiles.has(name))await rm(path.join(outputDir,name));
}
const code = `const REVISION_CATALOG=${JSON.stringify(revision.catalog)}; const LESSON_FILES=${JSON.stringify(lessonFiles)}; const OFFLINE_REVISION=null; const ACADEMIC_MEMORIZATION=${JSON.stringify(academicMemorization)}; const ACADEMIC_RESOURCES=${JSON.stringify(academicResources)}; const ACADEMIC_SEMESTER=${JSON.stringify(academicSemester)}; const ACADEMIC_STUDY=${JSON.stringify(academicStudy)};\nconst WALL_QUESTION_IDS=${JSON.stringify(wallIds)}; const KNOWLEDGE_TOPICS=${JSON.stringify(knowledgeTopics)};\nconst SITE_SHARE=${JSON.stringify(await buildSiteShare(root))};\n${vendor.outputFiles[0].text}\nconst REFINED_BANK_RELEASE=${Boolean(release)}; const MINISTERIAL_REVIEW=${JSON.stringify(ministerialQuestions ? {} : null)}; const BOOK_SOLUTIONS=${JSON.stringify(bookSolutions.lessons)}; const HOME_HERO=${JSON.stringify(homeHero)}; const COMPENDIUM_EXAM=${JSON.stringify(compendiumExam)}; const LEARNING_DATA=${JSON.stringify(learning,(key,value)=>['questionImages','answerImages'].includes(key)?undefined:value)}; const FIRST_BTEC_LESSONS=${JSON.stringify(firstBtecLessons)}; const LOCAL_REVIEW=${reviewPreview}; const MEDIA_CONFIG=${JSON.stringify(media)}; const LESSON_SUMMARIES=${JSON.stringify(summaries)}; const LESSON_GUIDES=${JSON.stringify(guides)};\nconst AUTH_CONFIG=${JSON.stringify(authConfig)};\nconst EMBEDDED_LESSONS=${JSON.stringify(lessons)};\nconst EMBEDDED_QUESTIONS=${JSON.stringify(runtimeQuestions)};\n${sources.join('\n')}`;
new vm.Script(code, { filename: 'app.bundle.js' });
const css = (await Promise.all(['styles','educational-boards','educational-scenes','learning','qr','knowledge','knowledge-admin','wall','academic-semester'].map(name=>read(`src/${name}.css`)))).join('\n');
// Inline the canonical brand icon so Pages and the standalone HTML need no asset request.
const favicon = 'data:image/svg+xml,' + encodeURIComponent(await read('assets/favicon.svg'));
const html = `<!doctype html>
<html lang="ar" dir="rtl" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#082c23">
<meta name="description" content="التربية الإسلامية برؤية رقمية، بإشراف الأستاذ محمد الطميزي. مادة التربية الإسلامية | الثاني ثانوي BTEC. إنشاء الطالب أيوب محمد البطوش.">
<meta name="color-scheme" content="dark light">
<link rel="icon" type="image/svg+xml" sizes="any" href="${favicon}">
<title>التربية الإسلامية برؤية رقمية</title>
<style>${css.replace(/<\/style/gi, '<\\/style')}</style>
</head>
<body>${reviewPreview ? '<aside class="review-preview-banner" role="note">نسخة مراجعة محلية · أسئلة مرشحة بانتظار اعتماد المعلم</aside>' : ''}
<div id="app"><div class="fatal"><h1>التربية الإسلامية برؤية رقمية</h1><p>جارٍ تحميل المنصة…</p></div></div>
<noscript>يرجى تفعيل JavaScript لتشغيل التحديات وتسجيل الدخول.</noscript>
<script>${code.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>
`;
if (reviewPreview) {
  const output = path.join(root, '.review-dist');
  await mkdir(output, {recursive:true});
  await cp(path.join(root,'public'),output,{recursive:true});
  await rm(path.join(output,'vendor/pdfjs'),{recursive:true,force:true});
  const firstReview = path.join(output, 'first-btec-review');
  const flags = new Map(priority.map(item=>[item.id,item.flags]));
  await mkdir(firstReview, {recursive:true});
  for (const unit of firstBtecLessons) for (const lesson of unit.lessons) {
    const records = firstBtecBank.questions.filter(q=>q.lesson_id===lesson.id).map(q=>({
      ...runtimeRecord(q), delivery_allocation:q.delivery_allocation, flags:flags.get(q.id)||[]
    }));
    await writeFile(path.join(firstReview, lesson.id+'.json'), JSON.stringify(records));
  }
  await writeFile(path.join(output,'index.html'), html);
  console.log(`Local review build: 2250 first BTEC and 2340 second BTEC ministerial candidates, 348 first BTEC and ${questions.questions.length} second BTEC game candidates.`);
} else {
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await writeFile(path.join(root, 'dist/index.html'), html);
  const standalone=html.replace('const OFFLINE_REVISION=null;',()=> 'const OFFLINE_REVISION='+JSON.stringify(revision.chapters).replace(/</g,'\\u003c')+';')
   .replace('const MINISTERIAL_REVIEW={};',()=> 'const MINISTERIAL_REVIEW='+JSON.stringify(ministerialQuestions).replace(/</g,'\\u003c')+';');
  await writeFile(path.join(root,'standalone.html'), standalone);
  await writeFile(path.join(root,'index.html'), standalone);
  await rm(path.join(root, 'dist/sw.js'), { force: true });
  console.log(`Production + standalone built: ${lessons.length+firstBtecLessons.length} units, ${[...lessons,...firstBtecLessons].flatMap(u=>u.lessons).length} lessons, ${questions.questions.length} bank records, ${Buffer.byteLength(html)} bytes.`);

  // The admin copy guide is independent of the student app and contains no credentials.
  await (await import('./split-educational-online.mjs')).writeEditorParts({root});
  await import('./build-online-setup.mjs');
  await import('./build-million-setup.mjs');
  await import('./build-wall-setup.mjs');

  await cp(path.join(root,'public'),path.join(root,'dist'),{recursive:true});
  await rm(path.join(root,'dist/vendor/pdfjs'),{recursive:true,force:true});
}
