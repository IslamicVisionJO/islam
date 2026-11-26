import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
const src=await readFile(new URL('../src/arcade-games.js',import.meta.url),'utf8');
const browser=await chromium.launch({headless:true});
const results=[];
try {
 for (const size of [{width:390,height:844},{width:1440,height:900}]){
  const page=await browser.newPage({viewport:size,hasTouch:size.width<500});
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.goto('http://localhost:8000/').catch(()=>{});
  await page.setContent('<!doctype html><html dir="rtl"><body><main id="catalog"></main></body></html>');
  await page.addScriptTag({content: