import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
// Isolated game logic test with synthetic questions, mocked DOM/Canvas; not a browser or network test.

function run(source){
 const marker="closeActive=close;count();d.showModal();";
 if(!source.includes(marker))throw Error("missing instrumentation marker");
 const code=source.replace(marker,marker+" testHook({start,answer,update,draw,input,close,finish,tap,lock,bubbleSet,showQuestion,get:()=>({state,score,correct,wrong,health,active,ended,current,paused,questions,elapsed}),setElapsed:v=>{elapsed=v;},next:()=>{const b=qbox.querySelectorAll('button');b[b.length-1].onclick();}});");
 class Node {constructor(tag=""){this.tag=tag;this.children=[];this.map=new Map();this.handlers={};this.dataset={};this.hidden=false;this.disabled=false;this.value="";this.classList={add(){}};} set innerHTML(s){this.html=s;this.children=[];this.map.clear();} get innerHTML(){return this.html;} querySelector(s){if(s==="button")return this.children.find(x=>x.tag==="button")||null;if(!this.map.has(s)){const n=new Node(s==="canvas"?"canvas":s);if(s==="[data-level]")n.value="easy";if(s==="[data-mode]")n.value="solo";this.map.set(s,n);}return this.map.get(s);} querySelectorAll(s){return s==="button"?this.children.filter(x=>x.tag==="button"):[];} append(...n){this.children.push(...n);} replaceChildren(){this.children=[];} focus(){} blur(){} setAttribute(){} addEventListener(n,f){this.handlers[n]=f;} removeEventListener(n){delete this.handlers[n];} showModal(){} remove(){this.removed=true;} getContext(){return new Proxy({},{get(t,k){return t[k]??(()=>{});},set(t,k,v){t[k]=v;return true;}});} }
 const bank=Array.from({length:14},(_,i)=>({id:"q"+i,unit_id:"u",lesson_id:"l",difficulty:"easy",type:"multiple_choice",prompt:"Synthetic question "+i,payload:{options:["a","b","c","d"].map(id=>({id,text:id}))},answer:{option_id:"a"},explanation:"example",source:{printed_pages:[7]},review:{source_checked:true,answer_checked:true}}));
 let hooks;const doc=new Node();doc.body=new Node();doc.createElement=t=>new Node(t);let uid=0;
 const api=new Function("document","S","EducationalContent","firstScope","isStandaloneGameQuestion","storageScope","notify","crypto","performance","requestAnimationFrame","cancelAnimationFrame","window","testHook","e",code+"\nreturn ArcadeGames;")(doc,{valid:bank},{pool:b=>b},()=>false,()=>true,()=>"account",()=>{}, {randomUUID:()=>String(++uid)}, {now:()=>0},()=>1,()=>{},{},x=>hooks=x,String);
 const results=[];const check=(name,ok)=>results.push({name,pass:!!ok});
 for(let i=0;i<4;i++){let h;try{doc.handlers.click({target:{closest:()=>({dataset:{arcade:String(i),unit:"u",lesson:"l"}})}});h=hooks;h.start();check(i+" start and initial question",h.get().active&&h.get().current);h.answer("a",{classList:{add(){}}});h.answer("a",{classList:{add(){}}});check(i+" correct reward once",h.get().correct===1&&h.get().score===150);h.next();check(i+" resume",h.get().current===null);const s=h.get().state;
 if(i===0){s.board[19]=Array(10).fill(1);h.input("down");check("tetris clears full row",s.lines===1&&s.board.length===20&&h.get().score>=250);}
 if(i===1){s.enemies=[{x:s.x,y:350,c:"#fff"}];h.input("up");for(let j=0;j<7;j++)h.update(.02);check("space projectile kills enemy and advances wave",s.enemies.length>1&&s.wave===2&&h.get().score>=400);}
 if(i===2){s.grid=Array.from({length:11},()=>Array(8).fill(-1));s.grid[0][0]=s.grid[0][1]=0;h.bubbleSet({x:96,y:25,c:0});check("bubble match",h.get().score>=240);}
 if(i===3){s.tiles=[{lane:2,y:345,hit:false}];h.tap(2);check("piano hit",s.tiles[0].hit&&s.combo===1&&h.get().score>150);}
 h.draw();check(i+" canvas draw calls",true);h.setElapsed(8);h.update(.001);check(i+" next question",!!h.get().current);if(h.get().current){h.answer("b",{classList:{add(){}}});check(i+" wrong answer counted",h.get().wrong===1);h.next();}h.finish("done");check(i+" finish",h.get().ended&&!h.get().active);h.close();}catch(err){results.push({name:i+" runtime",pass:false,error:String(err)});try{h?.close()}catch{}}}
 return results;
}
const results=run(readFileSync(new URL('../src/arcade-games.js',import.meta.url),'utf8'));
for(const result of results)test(result.name,()=>assert.equal(result.pass,true,result.error));
