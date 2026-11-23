import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

export async function loadReviewBank(root, units) {
  const read = async name => JSON.parse(await readFile(new URL('review/bank/' + name, root), 'utf8'));
  const [bank, wizari, games] = await Promise.all([
    read('questions.json'), read('lesson-wizari-index.json'), read('games-challenges-index.json')
  ]);
  const {validQuestion} = vm.runInNewContext(
    await readFile(new URL('src/core.js', root), 'utf8') + '\n({validQuestion})'
  );
  const lessons = new Set(units.flatMap(unit => unit.lessons.map(lesson => lesson.id)));
  const records = new Map();
  for (const question of bank.questions) {
    if (!validQuestion(question) || records.has(question.id) || !lessons.has(question.lesson_id) ||
        question.review?.teacher_approved !== false || question.review.excluded ||
        !question.source.printed_pages.every(page => page >= 6 && page <= 178)) {
      throw Error('Invalid review record: ' + question.id);
    }
    records.set(question.id, question);
  }
  const used = new Set();
  function claim(id, allocation) {
    const question = records.get(id);
    if (!question || used.has(id) || question.delivery_allocation !== allocation) {
      throw Error('Invalid allocation: ' + id);
    }
    used.add(id);
    return question;
  }
  if (lessons.size !== 26 || Object.keys(wizari.lessons).length !== lessons.size) throw Error('Invalid lesson distribution');
  const ministerial = {};
  for (const lesson of lessons) {
    ministerial[lesson] = {};
    for (const difficulty of ['easy', 'medium', 'hard']) {
      const ids = wizari.lessons[lesson]?.[difficulty];
      if (ids?.length !== 30) throw Error('Invalid level quota: ' + lesson + '/' + difficulty);
      ministerial[lesson][difficulty] = ids.map(id => {
        const q = claim(id, 'lesson_wizari');
        if (q.lesson_id !== lesson || q.difficulty !== difficulty || q.type !== 'multiple_choice') {
          throw Error('Invalid ministerial scope: ' + id);
        }
        return q;
      });
    }
  }
  const gameQuestions = games.question_ids.map(id => claim(id, 'games_challenges'));
  for (const type of new Set(gameQuestions.map(q => q.type))) {
    const expected = new Set(gameQuestions.filter(q => q.type === type).map(q => q.id));
    const ids = games.by_type[type];
    if (ids?.length !== expected.size || new Set(ids).size !== ids.length || !ids.every(id => expected.has(id))) {
      throw Error('Invalid game type index: ' + type);
    }
  }
  if (used.size !== records.size || bank.question_count !== records.size ||
      wizari.question_count !== 2340 || games.question_count !== gameQuestions.length) {
    throw Error('Incomplete bank allocation');
  }
  return {ministerial, gameQuestions};
}
