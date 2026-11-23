import {readFile,writeFile} from 'node:fs/promises';
import vm from 'node:vm';
import {loadReviewBank} from './review-bank.mjs';

const root = new URL('../',import.meta.url);
const read = name => readFile(new URL(name,root),'utf8');
const legacy = JSON.parse(await read('data/questions.json')).questions;
const units = JSON.parse(await read('data/lessons.json'));
const {ministerial,gameQuestions} = await loadReviewBank(root,units);
const lessons = JSON.parse(await read('data/learning-manifest.json')).units.flatMap(u=>u.lessons);
const records = [...Object.values(ministerial).flatMap(levels=>Object.values(levels).flat()),...gameQuestions];
const {EducationalContent:E} = vm.runInNewContext(await read('src/educational-core.js')+'\n({EducationalContent})');
const normalize = text => text.normalize('NFKC').replace(/[\p{M}\p{P}\p{Z}\u0640]/gu,'').replace(/[أإآ]/g,'ا');
const byQuestion = new Map();
const signals = {};
const flags = {};
const outsideLessonRange = [];
const legacyById = new Map(legacy.map(q=>[q.id,q]));
const reusedIds = [];
for (const q of records) {
 const lesson=lessons.find(l=>l.id===q.lesson_id);
 const pages=q.source.printed_pages;
 if (pages.some(p=>p<lesson.startPage||p>lesson.endPage)) outsideLessonRange.push({id:q.id,pages,range:[lesson.startPage,lesson.endPage]});
 const previous = legacyById.get(q.id);
 if (previous) reusedIds.push({id:q.id, changedPrompt:normalize(previous.prompt)!==normalize(q.prompt), changedPayload:JSON.stringify(previous.payload)!==JSON.stringify(q.payload), changedKey:JSON.stringify(previous.answer)!==JSON.stringify(q.answer)});
 const {options} = q.payload;
 const signature = JSON.stringify([q.lesson_id,q.type,normalize(q.prompt),options?.map(o=>normalize(o.text)).sort()]);
 if (!byQuestion.has(signature)) byQuestion.set(signature,[]);
 byQuestion.get(signature).push(q.id);
 for (const flag of new Set([...(q.review.risk_flags || []), ...(q.review.quality_risk_flags || [])])) (flags[flag]??=[]).push(q.id);
 if (q.type!=='multiple_choice') continue;
 const issues=[];
 const correct=options.find(o=>o.id===q.answer.option_id);
 const others=options.filter(o=>o.id!==correct.id);
 if (correct.text.length>1.8*Math.max(...others.map(o=>o.text.length))) issues.push('correct_longer_than_every_distractor');
 if (new Set(options.map(o=>normalize(o.text))).size!==4) issues.push('normalized_option_collision');
 if (options.some(o=>/جميعما(ذكر|سبق)|لاشيءمما(ذكر|سبق)/.test(normalize(o.text)))) issues.push('all_or_none_option');
 if (issues.length) signals[q.id]=issues;
}

const gameCoverage = E.names.map((name,game)=>{
 const minimum=game===2?5:1;
 const perLesson=Object.fromEntries(lessons.map(l=>[l.id,E.eligible(E.pool(gameQuestions,l.unitId,l.id),game).length]));
 return {name,total:E.eligible(gameQuestions,game).length,minimum,perLesson,insufficient:Object.keys(perLesson).filter(id=>perLesson[id]<minimum)};
});
const result = {records:records.length,teacherApproved:records.filter(q=>q.review.teacher_approved).length,
 independentlyReviewed:0, outsideLessonRange, normalizedDuplicateGroups:[...byQuestion.values()].filter(ids=>ids.length>1),
 legacyIdCollisions:reusedIds, gameCoverage, signals, packageRiskFlags:flags,
 note:'Heuristic review leads only. No scientific approval, question deletion, or answer-key edits.'};
await writeFile(new URL('review/reports/current-audit.json',root),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({records:records.length,teacherApproved:result.teacherApproved,
 outsideLessonRange:outsideLessonRange.length, normalizedDuplicateGroups:result.normalizedDuplicateGroups.length,
 legacyIdCollisions:reusedIds.length, changedLegacyIds:reusedIds.filter(x=>x.changedPrompt||x.changedPayload||x.changedKey).length,
 additionalOptionSignals:Object.keys(signals).length,gameCoverage:gameCoverage.map(({name,total,insufficient})=>({name,total,insufficient:insufficient.length}))},null,2));

// Start a fresh worksheet with the current choices, including local edits.
const csv = value => {
 const cell = String(value ?? '');
 return '"' + (/^[=+\-@]/.test(cell) ? "'" : '') + cell.replaceAll('"','""') + '"';
};
const columns = ['id','lesson','difficulty','allocation','type','printed_pages','prompt','choices_or_payload',
 'answer_key','explanation','review_signals','teacher_decision','reviewer','review_notes'];
const rows = [...records].sort((a,b)=>
 Number(Boolean(signals[b.id]?.length||b.review.review_priority==='HIGH')) -
 Number(Boolean(signals[a.id]?.length||a.review.review_priority==='HIGH')) || a.id.localeCompare(b.id)
).map(q=>[
 q.id,q.lesson_id,q.difficulty,q.delivery_allocation,q.type,q.source.printed_pages.join(' '),
 q.prompt, q.payload.options?.map(o=>o.id+': '+o.text).join('\n') || JSON.stringify(q.payload),
 JSON.stringify(q.answer),q.explanation,
 [...new Set([...(signals[q.id]||[]),...(q.review.risk_flags||[]),...(q.review.quality_risk_flags||[])])].join(' | '),
 'pending','',''
]);
await writeFile(new URL('review/reports/teacher-worksheet.csv',root),
 '\ufeff'+[columns,...rows].map(row=>row.map(csv).join(',')).join('\n')+'\n');
