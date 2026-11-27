import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
export async function offlineArcade(root,output){
 const ids=['blocks','space','bubbles','tiles'],covers={};
 for(const id of ids)covers[id]='data:image/png;base64,'+(await readFile(root+'/public/arcade/covers/'+id+'.png')).toString('base64');
 const source=`
 import {mount} from './public/arcade/app.mjs';
 import {games} from './public/arcade/core.mjs';
 import bank from './public/arcade/bank.json';
 ${ids.map(id=>"import * as "+id+" from './public/arcade/"+id+".mjs';").join('\n')}
 const engines={blocks,space,bubbles,tiles},covers=${JSON.stringify(covers)},panel=document.querySelector('main');
 let clean,history=[];
 try{history=JSON.parse(localStorage.getItem('arcade-offline-history')||'[]');if(!Array.isArray(history))history=[];}catch{}
 function menu(){clean?.();panel.replaceChildren();const h=document.createElement('h1');h.textContent='الألعاب التعليمية';panel.append(h);
 for(const [id,g] of Object.entries(games)){const b=document.createElement('button');b.textContent=g.title;b.onclick=async()=>{clean=await mount(panel,{id,offline:true,bank,cover:covers[id],loadGame:key=>engines[key],history:()=>history,close:menu,record:r=>{if(history.some(x=>x.id===r.id))return;history=[r,...history].slice(0,150);try{localStorage.setItem('arcade-offline-history',JSON.stringify(history));}catch{throw Error('تعذر الحفظ');}}});};panel.append(b);}}menu();`;
 const js=await build({stdin:{contents:source,resolveDir:root},bundle:true,external:['./online.mjs'],format:'iife',target:'es2022',minify:true,write:false,logLevel:'silent',define:{'import.meta.url':'location.href'}});
 const css=await readFile(root+'/public/arcade/arcade.css','utf8');
 await writeFile(output+'/arcade/offline.html','<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>الألعاب التعليمية</title><style>body{background:#111b2d;margin:auto;max-width:1000px}'+css+'</style><main></main><script>'+js.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+'</script></html>');
}
