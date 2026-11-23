import {readFile} from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';

// Only a deployment owner supplies this address. A preview or browser location is never inferred.
export async function buildSiteShare(root) {
  const config = JSON.parse(await readFile(path.join(root, 'config/site.public.json'), 'utf8'));
  if (!config.url) return null;
  const url = new URL(config.url);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !url.hostname.includes('.') || /(?:^|\.)(?:localhost|local|invalid|example|test)$/.test(url.hostname) ||
      /(?:^|\.)example\.(com|net|org)$/.test(url.hostname) || /^[\d.]+$/.test(url.hostname)) {
    throw new Error('Configure the verified public HTTPS entry page in config/site.public.json, or leave url empty.');
  }
  const png = await QRCode.toDataURL(url.href, {
    type: 'image/png', errorCorrectionLevel: 'M', margin: 4, scale: 20,
    color: {dark: '#000000ff', light: '#ffffffff'}
  });
  return {url: url.href, png};
}
