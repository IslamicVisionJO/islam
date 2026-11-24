import assert from 'node:assert/strict';
import {readFile, mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {buildSiteShare} from '../scripts/site-qr.mjs';

const require = createRequire(import.meta.url);
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4173';
const expected = JSON.parse(await readFile(new URL('../config/site.public.json', import.meta.url))).url;
const scratch = await mkdtemp(path.join(tmpdir(), 'site-qr-test-'));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
try {
  const context = await browser.newContext({permissions: ['clipboard-read', 'clipboard-write']});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  const qr = page.locator('.site-qr figure img');
  await qr.waitFor();
  await page.addScriptTag({path: require.resolve('jsqr')});

  async function decode(bytes) {
    return page.evaluate(async data => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + data;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return window.jsQR(pixels.data, pixels.width, pixels.height)?.data;
    }, bytes.toString('base64'));
  }

  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({width, height: 900});
    const boxes = await page.evaluate(() => {
      const box = sel => document.querySelector(sel).getBoundingClientRect().toJSON();
      return {
        card: box('.auth-story'), features: box('.auth-feature-list'), form: box('.auth-panel'),
        share: box('[data-site-qr="share"]'), qr: box('.site-qr img'), footer: box('.auth-story .auth-footer'),
        hasOverflow: document.documentElement.scrollWidth > innerWidth
      };
    });
    const {card, features, form, share, qr: image, footer} = boxes;
    assert.ok(!boxes.hasOverflow && image.left >= card.left && image.right <= card.right);
    assert.ok(image.bottom <= footer.top && share.bottom <= image.top);
    assert.ok(image.right <= features.left || image.top >= features.bottom);
    if (width >= 1024) assert.ok(card.left > form.left && image.right <= card.left + card.width / 2);
    assert.equal(await decode(await qr.screenshot()), expected);
    console.log('PASS login QR scan and layout at', width);
  }
  assert.equal(await page.locator('.auth-story .auth-footer').innerText(), 'إنشاء الطالب أيوب محمد البطوش');
  assert.equal(await page.locator('.auth-feature-list li').count(), 3);
  await page.evaluate(() => Object.defineProperty(navigator, 'share', {value: undefined, configurable: true}));
  const share = page.getByRole('button', {name: 'مشاركة الموقع', exact: true});
  const dialog = page.getByRole('dialog');
  await share.click();
  await dialog.waitFor();
  await dialog.getByRole('button', {name: 'نسخ الرابط'}).click();
  await page.waitForFunction(() => document.querySelector('.site-qr-status').textContent.includes('تم نسخ'));
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected);
  const whatsApp = new URL(await dialog.getByRole('link', {name: 'مشاركة عبر واتساب'}).getAttribute('href'));
  assert.equal(whatsApp.searchParams.get('text'), expected);
  const downloadPromise = page.waitForEvent('download');
  await dialog.locator('a[download]').click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'islamic-education-website-qr.png');
  assert.equal(await decode(await readFile(await download.path())), expected);
  await page.keyboard.press('Escape');
  console.log('PASS fallback options, system clipboard, WhatsApp link and decodable PNG download');

  for (const files of [true, false]) {
    await page.evaluate(files => {
      Object.defineProperty(navigator, 'canShare', {configurable: true, value: () => files});
      Object.defineProperty(navigator, 'share', {configurable: true, value: async payload => {
        window.sent = {url: payload.url, type: payload.files?.[0].type};
      }});
    }, files);
    await share.click();
    const sent = await page.evaluate(() => window.sent);
    assert.equal(sent.url, expected);
    assert.equal(sent.type, files ? 'image/png' : undefined);
  }
  await page.evaluate(() => Object.defineProperty(navigator, 'share', {configurable: true, value: async () => {throw new DOMException('', 'AbortError');}}));
  await share.click();
  assert.equal(await dialog.count(), 0);
  await page.evaluate(() => Object.defineProperty(navigator, 'share', {configurable: true, value: async () => {throw new Error('Unavailable');}}));
  await share.click();
  await dialog.waitFor();
  console.log('PASS native file/link payloads, cancellation and sharing error fallback (simulated API)');
  assert.deepEqual(errors, []);

  await mkdir(path.join(scratch, 'config'));
  const config = path.join(scratch, 'config/site.public.json');
  await writeFile(config, '{"url":""}');
  assert.equal(await buildSiteShare(scratch), null);
  for (const url of ['http://localhost', 'https://127.0.0.1/', 'https://example.com/']) {
    await writeFile(config, JSON.stringify({url}));
    await assert.rejects(buildSiteShare(scratch));
  }
  console.log('PASS absent public URL and invalid public address checks');
} finally {
  await browser.close();
  await rm(scratch, {recursive: true, force: true});
}
