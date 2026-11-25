import {mkdir,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
import {revisionData} from './revision-data.mjs';

const review=process.argv.includes('--review');
const {catalog,chapters}=revisionData({review});
const dir=new URL(review?'../.review-dist/revision-downloads/':'../public/revision-downloads/',import.meta.url);
await mkdir(dir,{recursive:true});
const font=await readFile(new URL('../public/fonts/Tajawal-Regular.ttf',import.meta.url),'base64');
const escape=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
try{
 const page=await browser.newPage();
 for(const term of [1,2,0]){
  const lessons=catalog.filter(l=>!term||l.semester===term);
  const title='مكثف التربية الإسلامية · '+(term?'الفصل '+term:'الفصلان');
  const contents='<nav><h1>'+title+'</h1><h2>فهرس الدروس</h2>'+lessons.map((l,i)=>
   (lessons[i-1]?.unit!==l.unit||lessons[i-1]?.semester!==l.semester?`<h3>الفصل ${l.semester} · الوحدة ${l.unit}</h3>`:'')+
   `<a href="#${l.id}">${escape(l.title)}</a>`).join('')+'</nav>';
  const html=lessons.map(l=>`<section id="${l.id}"><header>الفصل ${l.semester} · الوحدة ${l.unit} · الدرس ${l.number}</header>
   <h1>${escape(l.title).replace(/(\d+)–(\d+)/g,'من $1 إلى $2')}</h1><p>صفحات الدرس من ${l.pages[0]} إلى ${l.pages[1]} · مراجعة دراسية</p>
   ${chapters[l.id].map((q,i)=>`<article><small>${escape(q.category)} · ${q.range?'نطاق الدرس':'ص'} ${q.pages.join(q.range?'–':'، ')} · ${escape(q.source)}</small>
   <h3>${i+1}. ${escape(q.question)}</h3><p>${q.status==='draft'?'مادة مراجعة أولية · ':q.status==='suggested'?'إجابة مقترحة · ':['verify','needs_human_review'].includes(q.status)?'إجابة تحتاج إلى تحقق · ':''}${escape(q.answer)}</p></article>`).join('')}</section>`).join('');
  await page.setContent(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>${title}</title>
   <style>@page{size:A4;margin:15mm 14mm 17mm}@font-face{font-family:Tajawal;src:url(data:font/ttf;base64,${font})}body{font:12pt/1.6 Tajawal,sans-serif;color:#172920}nav a{display:block;color:#14543e}nav h3{break-after:avoid}nav+section,section+section{break-before:page}h1,h3{color:#14543e;break-after:avoid}h3,p{margin:.3em 0}p{white-space:pre-line}article{break-inside:avoid;border-top:1px solid #aaa;padding:5pt 0}small{font-size:9pt}</style><body>${contents}${html}</body></html>`);
  await page.evaluate(()=>document.fonts.ready);
  await page.pdf({path:new URL(term?'semester-'+term+'.pdf':'full.pdf',dir).pathname,outline:true,preferCSSPageSize:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="width:100%;text-align:center;font-size:9px"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'});
 }
}finally{await browser.close();}
