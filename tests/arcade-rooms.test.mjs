import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
// Simulates two browser sessions through an in-memory transport; does not contact Supabase.

async function roomTests(source){
 const marker="closeActive=close;count();d.showModal();";
 const code=source.replace(marker,marker+" testHook({connectRoom,start,close,finish,answer,get:()=>({active,peer,roundSeed,roundStart,roomReady,current,questions,score}),selection:()=>selection(),mode,level,status,$,send,dropRoom});");
 class Node {constructor(tag=""){this.tag=tag;this.children=[];this.map=new Map();this.handlers={};this.dataset={};this.value="";this.classList={add(){}};} set innerHTML(s){this.children=[];this.map.clear();} querySelector(s){if(s==="button")return this.children.find(x=>x.tag==="button")||null;if(!this.map.has(s)){const n=new Node(s);if(s==="[data-level]")n.value="easy";if(s==="[data-mode]")n.value="solo";this.map.set(s,n);}return this.map.get(s);} querySelectorAll(s){return this.children.filter(x=>x.tag==="button");} append(...n){this.children.push(...n);} replaceChildren(){this.children=[];} focus(){} blur(){} setAttribute(){} addEventListener(n,f){this.handlers[n]=f;} removeEventListener(n){delete this.handlers[n];} showModal(){} remove(){} getContext(){return {};}}
 const bank=Array.from({length:5},(_,i)=>({id:"q"+i,unit_id:"u",lesson_id:"l",difficulty:"easy",type:"multiple_choice",prompt:"Synthetic "+i,payload:{options:["a","b","c","d"].map(id=>({id,text:id}))},answer:{option_id:"a"},explanation:"example",source:{printed_pages:[7]},review:{source_checked:true,answer_checked:true}}));
 const channels=new Map(),queue=[],timers=new Map();let seq=0,uid=0;
 const flush=()=>{let guard=0;while(queue.length){if(++guard>1000)throw Error("queue runaway");queue.shift()();}};
 const Auth={async arcadeChannel(room){const members=channels.get(room)||new Set();channels.set(room,members);const ch={on(t,f,cb){this.receive=cb;return this;},subscribe(cb){this.status=cb;members.add(this);queue.push(()=>cb("SUBSCRIBED"));return this;},async send(msg){for(const other of members)if(other!==this)queue.push(()=>other.receive({payload:msg.payload}));return "ok";}};return {channel:ch,remove:async x=>{members.delete(x);return "ok";}};}};
 function session(kind=0,questions=bank){let hook;const doc=new Node();doc.body=new Node();doc.createElement=t=>new Node(t);
 new Function("document","S","EducationalContent","firstScope","isStandaloneGameQuestion","storageScope","notify","crypto","performance","requestAnimationFrame","cancelAnimationFrame","window","testHook","e","Auth","setTimeout","clearTimeout",code)(doc,{valid:questions},{pool:b=>b},()=>false,()=>true,()=>"account",()=>{}, {randomUUID:()=>String(++uid).padStart(32,"0"),getRandomValues:a=>{a[0]=123456;return a;}}, {now:()=>0},()=>1,()=>{},{},x=>hook=x,String,Auth,(fn,ms)=>{timers.set(++seq,{fn,ms});return seq;},id=>timers.delete(id));
 doc.handlers.click({target:{closest:()=>({dataset:{arcade:String(kind),unit:"u",lesson:"l"}})}});return hook;
 }
 const results=[];const check=(name,ok)=>results.push({name,pass:!!ok});
 const host=session(),guest=session(),bad=session(1);
 host.mode.value="host";await host.connectRoom();flush();
 const codeValue=host.status.textContent.match(/[a-f0-9]{32}/)?.[0];check("host receives invite code",!!codeValue);
 bad.mode.value="join";bad.$("[data-code]").value=codeValue;await bad.connectRoom();flush();check("different game rejected",bad.status.textContent.includes("اختر اللعبة")&&!bad.get().peer);
 guest.mode.value="join";guest.$("[data-code]").value=codeValue;await guest.connectRoom();flush();check("both peers negotiate",!!host.get().peer&&!!guest.get().peer);
 check("identical seed",host.get().roundSeed===123456&&guest.get().roundSeed===123456);check("identical scheduled start",host.get().roundStart===guest.get().roundStart&&host.get().roundStart>0);
 for(const [id,t] of [...timers])if(t.ms<15000){timers.delete(id);t.fn();}flush();
 check("both games start",host.get().active&&guest.get().active);check("same question order",JSON.stringify(host.get().questions.map(q=>q.id))===JSON.stringify(guest.get().questions.map(q=>q.id)));
 host.answer("a",{classList:{add(){}}});host.send("progress",{score:host.get().score,correct:1});flush();check("peer sees progress",guest.$("[data-peer]").textContent.includes("150"));
 host.finish("done");flush();check("peer sees finish",guest.$("[data-peer]").textContent.includes("أنهى"));
 host.close();flush();check("peer sees departure and continues solo",guest.$("[data-peer]").textContent.includes("غادر")&&guest.get().active&&!guest.get().peer);
 guest.close();bad.close();return results;
}
const results=await roomTests(readFileSync(new URL('../src/arcade-games.js',import.meta.url),'utf8'));
for(const result of results)test(result.name,()=>assert.equal(result.pass,true));
