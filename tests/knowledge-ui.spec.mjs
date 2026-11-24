/** Real built UI, Supabase SDK and local PostgreSQL. Only session issuance and HTTP routing are simulated. */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createDuelServer, ids } from './helpers/duel-server.mjs';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4173';
const api = 'https://knowledge-fixture.supabase.test';
const key = 'sb_publishable_knowledge_test_fixture_only';
const built = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const configMarker = /^const AUTH_CONFIG=[^\r\n]*;$/gm;
assert.equal([...built.matchAll(configMarker)].length, 1, 'Build must contain a single auth configuration');
const html = built.replace(configMarker, 'const AUTH_CONFIG=' + JSON.stringify({url: api, publishableKey: key}) + ';');
const backend = await createDuelServer({educationalFiles: ['migrations/007_knowledge.sql']});
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const errors = [];
const sessions = new Map();
const statements = {
  knowledge_list: ['select public.knowledge_list($1) as value', args => [args.p_admin]],
  knowledge_image: ['select public.knowledge_image($1) as value', args => [args.p_id]],
  knowledge_save_achievement: ['select public.knowledge_save_achievement($1,$2) as value', args => [JSON.stringify(args.p_record), JSON.stringify(args.p_images)]],
  knowledge_save_tool: ['select public.knowledge_save_tool($1) as value', args => [JSON.stringify(args.p_record)]],
  knowledge_delete: ['select public.knowledge_delete($1,$2,$3) as value', args => [args.p_kind, args.p_id, args.p_updated_at]]
};

function knowledgeCall(name, args, user) {
  return backend.serialize(async () => {
    try {
      await backend.db.exec(user ? 'begin; set local role authenticated' : 'begin; set local role anon');
      if (user) {
        await backend.db.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({sub: user.id, session_id: 'a' + user.id.slice(1), amr: [{method:'password'}]})
        ]);
      }
      const [query, values] = statements[name];
      const {rows} = await backend.db.query(query, values(args));
      await backend.db.exec('commit');
      return {data: rows[0].value, error: null};
    } catch (error) {
      await backend.db.exec('rollback');
      return {data: null, error: {code: error.code, message: error.message}};
    }
  });
}

async function routeAPI(route, url) {
  const request = route.request();
  const send = (status, body) => route.fulfill({status, contentType: 'application/json', json: body});
  const user = sessions.get(request.headers().authorization);
  if (url.pathname === '/auth/v1/token') {
    const result = await backend.auth(request.postDataJSON());
    if (result.error) return send(400, result.error);
    const {user: signedIn} = result.data.session;
    const segment = data => Buffer.from(JSON.stringify(data)).toString('base64url');
    const token = [segment({alg:'HS256', typ:'JWT'}), segment({sub:signedIn.id, exp:Math.floor(Date.now()/1000)+3600}), 'dGVzdA'].join('.');
    sessions.set('Bearer ' + token, signedIn);
    return send(200, {access_token:token, refresh_token:'test-only', token_type:'bearer', expires_in:3600, user:signedIn});
  }
  if (url.pathname === '/auth/v1/user' && user) return send(200, user);
  if (url.pathname === '/auth/v1/logout') return route.fulfill({status:204});
  if (url.pathname === '/rest/v1/user_progress') {
    const user_id = url.searchParams.get('user_id')?.slice(3);
    const result = await backend.call({name:'read_progress', args:{user_id}, user});
    return send(result.error ? 403 : 200, result.error || (result.data ? [result.data] : []));
  }
  if (url.pathname.startsWith('/rest/v1/rpc/')) {
    const name = url.pathname.split('/').pop();
    const args = request.postDataJSON() || {};
    const result = Object.hasOwn(statements, name) ? await knowledgeCall(name, args, user) : await backend.call({name, args, user});
    return send(result.error ? 403 : 200, result.error || result.data);
  }
  errors.push('Unexpected fixture request: ' + url.pathname);
  return send(404, {});
}

async function client(width, height) {
  const context = await browser.newContext({viewport:{width, height}, serviceWorkers:'block'});
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === api) return routeAPI(route, url);
    if (url.origin !== new URL(base).origin) {
      errors.push('Unexpected external request: ' + url.origin);
      return route.abort();
    }
    if (route.request().isNavigationRequest()) return route.fulfill({contentType:'text/html;charset=utf-8', body:html});
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(() => typeof S!=='undefined' && S.ready && Auth.current().configured);
  return page;
}

async function login(page, userId) {
  await page.locator('#auth-email').fill(backend.users.find(u => u.id === userId).email);
  await page.locator('#auth-password').fill('local-test-password');
  await page.locator('#auth-email-form button[type="submit"]').click();
  await page.waitForFunction(id => typeof S!=='undefined' && S.ready && Auth.current().user?.id === id && db.status().userId === id, userId);
}

async function navigate(page, target) {
  const menu = page.locator('.mobile-menu');
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar [data-page="' + target + '"]').click();
}

async function fits(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Viewport overflows horizontally');
}

async function makeImage(page, filename, color) {
  const base64 = await page.evaluate(color => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 16, 16);
    return canvas.toDataURL('image/png').split(',')[1];
  }, color);
  return {name:filename, mimeType:'image/png', buffer:Buffer.from(base64, 'base64')};
}

async function emptyContent(page) {
  await page.getByText('لا توجد إنجازات مضافة حاليًا', {exact:true}).waitFor();
  await page.getByText('لا توجد مواقع أو أدوات مضافة حاليًا', {exact:true}).waitFor();
}

async function save(page) {
  const form = page.locator('#ka-form');
  await form.locator('button[type=submit]').click();
  await form.waitFor({state:'detached'});
  await page.locator('[data-ka-rows][aria-busy=false]').waitFor();
}

async function confirmDelete(page, title, accept) {
  const action = page.locator('[data-ka-action=delete]');
  page.once('dialog', async dialog => {
    assert.match(dialog.message(), new RegExp(title));
    if (accept) await dialog.accept();
    else await dialog.dismiss();
  });
  await action.click();
  if (accept) await action.waitFor({state:'detached'});
}

try {
  const guest = await client(360, 800);
  await guest.locator('[data-action=guest-name]').click();
  await guest.waitForFunction(() => Auth.current().mode === 'guest' && !S.authBusy);
  await navigate(guest, 'knowledge');
  await emptyContent(guest);
  for (const heading of ['الإنجازات والمسابقات والمشاركات', 'التربية الإسلامية في حياتنا', 'مواقع وأدوات مفيدة']) {
    await guest.getByRole('heading', {name:heading, exact:true}).waitFor();
  }
  for (const topic of await guest.locator('.knowledge-topic').all()) {
    await topic.locator('summary').click();
    await topic.locator('details[open] p').waitFor();
  }
  assert.equal(await guest.locator('.knowledge-topic details[open]').count(), 3);
  assert.equal(await guest.locator('[data-page=admin]').count(), 0);
  await fits(guest);
  console.log('PASS guest navigation, empty school sections, three learning examples and phone layout');

  const admin = await client(1366, 900);
  await login(admin, ids.admin);
  await navigate(admin, 'admin');
  await admin.locator('[data-ka-tab=achievements]').click();
  await admin.locator('[data-ka-action=new]').click();
  const form = admin.locator('#ka-form');
  const title = 'شهادة اختبار واجهة النشر';
  await form.locator('[name=title]').fill(title);
  await save(admin);
  await admin.locator('.ka-row').getByRole('heading', {name:title}).waitFor();
  await guest.reload();
  await emptyContent(guest);
  console.log('PASS existing owner can save a title-only draft invisible to guests');

  await admin.locator('[data-ka-action=edit]').click();
  await form.locator('[name=category]').fill('نشاط تجريبي للاختبار');
  await form.locator('[name=description]').fill('وصف اختبار محلي');
  await form.locator('[name=placement]').fill('الأول');
  await form.locator('[name=event_date]').fill('2025-01-01');
  const cover = await makeImage(admin, 'cover.png', 'teal');
  const other = await makeImage(admin, 'other.png', 'gold');
  const removed = await makeImage(admin, 'removed.png', 'blue');
  await form.locator('[data-ka-files=cover]').setInputFiles(cover);
  await form.locator('[data-ka-files=additional]').setInputFiles([other, removed]);
  assert.equal(await form.locator('.ka-photos figure').count(), 3);
  await form.locator('[data-ka-action=remove-photo]').last().click();
  await form.locator('[data-ka-action=cover]').click();
  await form.locator('[name=published]').selectOption('published');
  await form.locator('[name=consent]').check();
  await save(admin);
  await admin.locator('.ka-row').getByText(/منشور/).waitFor();
  await admin.locator('[data-ka-search]').fill('لا يطابق السجل');
  assert.equal(await admin.locator('.ka-row').count(), 0);
  await admin.locator('[data-ka-search]').fill('');
  await admin.locator('[data-ka-sort]').selectOption('title');
  assert.equal(await admin.locator('.ka-row').count(), 1);
  await fits(admin);

  await guest.reload();
  await guest.waitForFunction(() => typeof S!=='undefined' && S.ready && S.page==='knowledge' && Auth.current().mode==='signed-out');
  await guest.getByRole('heading', {name:title}).waitFor();
  await guest.locator('[data-k-open]').click();
  const dialog = guest.locator('.knowledge-dialog[open]');
  await dialog.locator('.knowledge-picture img:not([hidden])').waitFor();
  const currentImage = () => dialog.locator('.knowledge-picture img').getAttribute('src');
  assert.equal((await currentImage()).split(',')[1], other.buffer.toString('base64'));
  await dialog.locator('[data-k-step="1"]').click();
  await dialog.locator('.knowledge-picture img:not([hidden])').waitFor();
  assert.equal((await currentImage()).split(',')[1], cover.buffer.toString('base64'));
  await fits(guest);
  await dialog.locator('[data-k-close]').click();
  console.log('PASS multiple uploads, preview removal, cover selection, search and cross-device gallery after reload');

  await admin.locator('[data-ka-tab=tools]').click();
  await admin.locator('[data-ka-action=new]').click();
  const tool = 'أداة اختبار محلية';
  await form.locator('[name=title]').fill(tool);
  await form.locator('[name=url]').fill('http://tools.test/lesson');
  await form.locator('[name=published]').selectOption('published');
  await form.locator('button[type=submit]').click();
  await admin.getByRole('alert').getByText(/HTTPS/).waitFor();
  await form.locator('[name=url]').fill('https://tools.test/lesson');
  await save(admin);
  await admin.locator('[data-ka-action=edit]').click();
  await form.locator('[name=description]').fill('تم تحديث وصف الأداة');
  await save(admin);

  const student = await client(1366, 900);
  await login(student, ids.host);
  const before = await student.evaluate(async () => {
    await createSession('training','u01_l01','easy','all',1,['a','b'],'none');
    const q = S.session.questions[0], a = q.answer;
    const response = q.type === 'true_false' ? a.value :
      ['multiple_choice','fill_blank'].includes(q.type) ? a.option_id :
      q.type === 'multi_select' ? a.option_ids : q.type === 'ordering' ? a.ordered_ids :
      Object.fromEntries(a.pairs.map(p => [p.left_id, p.right_id]));
    await autoAnswer(response);
    await Auth.syncNow();
    return {badges:S.achievements, xp:S.profile.xp, resultIds:S.results.map(r => r.id)};
  });
  assert.ok(before.badges.first && before.xp > 0 && before.resultIds.length === 1);
  await navigate(student, 'knowledge');
  await student.getByRole('heading', {name:title}).waitFor();
  const link = student.getByRole('link', {name:new RegExp(tool)});
  await link.waitFor();
  assert.equal(await link.getAttribute('href'), 'https://tools.test/lesson');
  assert.equal(await link.getAttribute('target'), '_blank');
  assert.match(await link.getAttribute('rel'), /noopener/);
  assert.match(await link.innerText(), /تم تحديث وصف الأداة/);
  assert.equal(await student.locator('[data-page=admin]').count(), 0);
  await student.reload();
  await student.waitForFunction(() => typeof S!=='undefined' && S.ready && Auth.current().mode === 'account');
  await navigate(student, 'achievements');
  await student.getByRole('heading', {name:'إنجازاتي', exact:true}).waitFor();
  await student.locator('.achievement-card.unlocked').getByText('أول خطوة').waitFor();
  assert.deepEqual(await student.evaluate(() => ({badges:S.achievements, xp:S.profile.xp, resultIds:S.results.map(r=>r.id)})), before);
  console.log('PASS HTTPS tool create/edit, safe student link, personal achievement label and retained learning progress');

  await confirmDelete(admin, tool, false);
  assert.equal(await admin.locator('.ka-row').count(), 1);
  await confirmDelete(admin, tool, true);
  await admin.locator('[data-ka-tab=achievements]').click();
  await admin.locator('[data-ka-action=edit]').click();
  await form.locator('[name=published]').selectOption('draft');
  await form.locator('[data-ka-action=remove-photo]').last().click();
  await save(admin);
  await guest.reload();
  await emptyContent(guest);
  await confirmDelete(admin, title, true);
  await admin.locator('[data-ka-action=refresh]').click();
  await admin.getByText('لا توجد إنجازات مضافة حاليًا', {exact:true}).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS unpublishing, confirmed deletion, persistent empty states and clean browser execution');
} finally {
  await browser.close();
  await backend.db.close();
}
