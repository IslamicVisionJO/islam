import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
const core=await read('src/core.js');
const {accepts,content}=vm.runInNewContext(core+'\n'+await read('src/educational-core.js')+
 '\n;({accepts:isStandaloneGameQuestion,content:EducationalContent})');
const q=prompt=>({prompt,payload:{options:[]}});

test('game questions can stand alone when their lesson is hidden',()=>{
 for(const prompt of ['ما الفكرة التي ناقشها الدرس؟','ما رأي الكتاب في هذا المثال؟','ما دلالة الحديث السابق؟','ما دلالة الآية الآتية؟'])
  assert.equal(accepts(q(prompt)),false,prompt);
 for(const prompt of ['أي الآتي من شروط الاجتهاد؟','من المقصود بأهل الكتاب؟','ما منزلة الكتاب والسنة؟','ما دلالة النص الآتي: «إن الله كان عليكم رقيبًا»؟'])
  assert.equal(accepts(q(prompt)),true,prompt);
 assert.equal(accepts({prompt:'صل المفهوم بمعناه.',payload:{right:[{text:'العبارة التي عرضها الدرس'}]}}),false);
});
test('all thirteen games retain textbook-checked content across the full book',async()=>{
 const bank=JSON.parse(await read('review/bank/questions.json')).questions.filter(q=>
  q.delivery_allocation==='games_challenges'&&q.review.source_checked&&q.review.answer_checked&&accepts(q));
 assert.equal(bank.length,773);
 for(let i=0;i<13;i++) assert.ok(content.eligible(bank,i).length>=(i===2?5:1),content.names[i]);
});
