/** Copy-only installer for the repository's existing Wall schema and textbook seed. */
import {readFile,readdir,writeFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const seedDir=new URL('supabase/wall-seed/',root);
const seedFiles=(await readdir(seedDir)).filter(name=>/^\d\d\.sql$/.test(name)).sort();
if(!seedFiles.length)throw Error('Missing Wall Challenge seed');
const project=JSON.parse(await readFile(new URL('supabase/project.public.json',root),'utf8')).projectRef;
if(!/^[a-z0-9]+$/.test(project))throw Error('Unexpected public Supabase project reference');
const parts=await Promise.all([
 readFile(new URL('supabase/migrations/011_wall_challenge.sql',root),'utf8'),
 ...seedFiles.map(name=>readFile(new URL(name,seedDir),'utf8'))
]);
const sql=parts.join('');
const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const html=`<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>تفعيل سباق الجدار</title>
<style>
body{margin:0;background:#0b3028;color:#fff;font:18px/1.8 system-ui}
main{max-width:720px;margin:auto;padding:clamp(16px,4vw,32px)}a{color:#f2cf85}
section,details{background:#ffffff09;border:1px solid #ffffff30;border-radius:16px;padding:18px;margin-block:16px}
button{font:inherit;background:#f2cf85;color:#17252b;padding:11px 18px;border:0;border-radius:10px;cursor:pointer}
button:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid white;outline-offset:4px}
summary{cursor:pointer}.parts{display:flex;flex-wrap:wrap;gap:10px;margin-block:14px}
#status{min-height:2em;margin:12px 0 0;overflow-wrap:anywhere}
textarea{width:100%;box-sizing:border-box;background:#061f1a;color:white;font:14px monospace;padding:10px}
</style></head><body><main>
<a href="./">العودة إلى المنصة</a>
<h1>تفعيل سباق الجدار</h1>
<section>
<p>انسخ SQL ثم الصقه في <a href="https://supabase.com/dashboard/project/${project}/sql/new" target="_blank" rel="noopener">محرر SQL في Supabase</a> واضغط <bdi>Run</bdi>.</p>
<button type="button" id="copy-all" data-copy="all">نسخ SQL كامل</button>
<p id="status" role="status" aria-live="polite"></p>
<textarea id="manual-copy" aria-label="SQL للنسخ اليدوي" dir="ltr" rows="5" readonly hidden></textarea>
</section>
<details><summary>إذا رفض Supabase حجم النص</summary>
<p>شغّل الترحيل أولًا، ثم شغّل أجزاء الأسئلة بالترتيب. استخدم استعلامًا جديدًا لكل جزء.</p>
<div class="parts">
<button type="button" data-copy="0">نسخ الترحيل 011</button>
${seedFiles.map((name,i)=>`<button type="button" data-copy="${i+1}">نسخ الجزء ${name.slice(0,2)}</button>`).join('')}
</div></details>
${parts.map((part,i)=>`<template id="sql-${i}">${escape(part)}</template>`).join('\n')}
<script>
const blocks=[...document.querySelectorAll('template')].map(node=>node.content.textContent);
const status=document.querySelector('#status');
const manual=document.querySelector('#manual-copy');
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-copy]');
 if(!button)return;
 const key=button.dataset.copy;
 const sql=key==='all'?blocks.join(''):blocks[Number(key)];
 manual.hidden=true;
 try{
  await navigator.clipboard.writeText(sql);
  status.textContent='تم النسخ. الصق النص في Supabase واضغط Run.';
 }catch{
  manual.value=sql;
  manual.hidden=false;
  manual.focus();
  manual.select();
  status.textContent='المتصفح منع النسخ التلقائي. النص محدد وجاهز للنسخ اليدوي.';
 }
});
</script></main></body></html>`;
await Promise.all([
 writeFile(new URL('dist/setup-wall.html',root),html),
 writeFile(new URL('setup-wall.html',root),html)
]);
console.log('Wall Challenge copy guide built ('+Buffer.byteLength(sql)+' SQL bytes).');
