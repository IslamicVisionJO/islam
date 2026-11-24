const difficulties = ['easy', 'medium', 'hard'];
const clean = text => text.normalize('NFKC').replace(/[\p{M}\u0640]/gu, '').replace(/[أإآٱ]/g, 'ا')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const distinct = list => new Set(list).size === list.length;
const itemList = list => Array.isArray(list) && list.length >= 2 &&
  list.every(item => typeof item.id === 'string' && item.id && typeof item.text === 'string' && clean(item.text)) &&
  distinct(list.map(item => item.id)) && distinct(list.map(item => clean(item.text)));
const identifiers = (ids, list, minimum, maximum) => Array.isArray(ids) &&
  ids.length >= minimum && ids.length <= maximum && distinct(ids) && ids.every(id => list.some(item => item.id === id));

function validAnswer({type,payload:p,answer:a}) {
  switch (type) {
    case 'multiple_choice':
    case 'fill_blank':
      return itemList(p?.options) && p.options.length === 4 && p.options.some(item => item.id === a?.option_id);
    case 'true_false':
      return typeof a?.value === 'boolean';
    case 'multi_select':
      return itemList(p?.options) && identifiers(a?.option_ids, p.options, 2, p.options.length - 1);
    case 'ordering':
      return itemList(p?.items) && identifiers(a?.ordered_ids, p.items, p.items.length, p.items.length);
    case 'matching':
      return itemList(p?.left) && itemList(p?.right) && p.left.length === p.right.length &&
        Array.isArray(a?.pairs) && identifiers(a.pairs.map(pair => pair.left_id), p.left, p.left.length, p.left.length) &&
        identifiers(a.pairs.map(pair => pair.right_id), p.right, p.right.length, p.right.length);
    default:
      return false;
  }
}

export function validateFirstBtec(units, bank, archivedIds, {ministerial, games:gamesIndex, priority}) {
  const fail = message => { throw new Error('First BTEC review bank: ' + message); };
  const lessons = new Map();
  for (const [ui, unit] of units.entries()) {
    const unitId = 's1_u0' + (ui + 1);
    if (unit.id !== unitId || unit.year_id !== 'btec1' || unit.lessons.length !== [6,6,6,7][ui]) fail(unit.id);
    for (const [li, lesson] of unit.lessons.entries()) {
      if (lesson.id !== unitId + '_l0' + (li + 1) || lesson.unit_id !== unitId || lesson.year_id !== unit.year_id) fail(lesson.id);
      lessons.set(lesson.id, lesson);
    }
  }
  if (units.length !== 4 || lessons.size !== 25 || bank.questions.length !== 2598) fail('unexpected counts');

  const ids = new Set(archivedIds), prompts = new Set(), counts = new Map();
  const allocation = new Map();
  function loadIndex(index, group) {
    for (const [lesson, buckets] of Object.entries(index)) {
      if (!lessons.has(lesson)) fail('indexed unknown lesson: ' + lesson);
      for (const [bucket, entries] of Object.entries(buckets)) {
        for (const id of entries) {
          if (allocation.has(id)) fail('indexed more than once: ' + id);
          allocation.set(id, [group,lesson,bucket].join(':'));
        }
      }
    }
  }
  loadIndex(ministerial, 'lesson_wizari');
  loadIndex(gamesIndex, 'games_challenges');
  let games = 0;
  for (const q of bank.questions) {
    const lesson = lessons.get(q.lesson_id);
    const prompt = clean(q.prompt);
    if (!lesson || lesson.unit_id !== q.unit_id || q.semester_id !== 's1' || ids.has(q.id) ||
        !q.id.startsWith(lesson.id + '_') || !/^s1_u0[1-4]_l0[1-7]_q\d{3}$/.test(q.id) ||
        !prompt || prompts.has(prompt) || !q.explanation?.trim()) fail(q.id);
    if (q.review?.teacher_approved !== false || q.review?.excluded !== false ||
        q.source?.document_id !== bank.document_id || !q.source.printed_pages?.length ||
        !q.source.printed_pages.every(p => Number.isInteger(p) && p >= lesson.startPage && p <= lesson.endPage)) fail('source or status: ' + q.id);
    const indexedBucket=q.delivery_allocation==='lesson_wizari'?q.difficulty:q.type;
    if (allocation.get(q.id)!==[q.delivery_allocation,q.lesson_id,indexedBucket].join(':')) fail('incorrect index: ' + q.id);
    allocation.delete(q.id);
    ids.add(q.id);
    prompts.add(prompt);
    if (!difficulties.includes(q.difficulty) || !validAnswer(q)) fail('difficulty, options or answer: ' + q.id);
    if (q.delivery_allocation === 'games_challenges') { games++; continue; }
    if (q.delivery_allocation !== 'lesson_wizari' || q.type !== 'multiple_choice') fail(q.id);
    const key = q.lesson_id + ':' + q.difficulty;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (const id of lessons.keys()) {
    for (const level of difficulties) if (counts.get(id + ':' + level) !== 30) fail(id + ':' + level);
  }
  if (games !== 348 || allocation.size) fail('games count or unrecognized index entries');
  const bankIds = new Set(bank.questions.map(q=>q.id));
  if (priority.length !== 978 || !distinct(priority.map(item=>item.id)) ||
      priority.some(item=>!bankIds.has(item.id)||item.teacher_approved!==false||!item.flags?.length)) fail('priority review index');
}
