// Existing lifecycle scenarios explicitly choose to finish each round.
import {chromium} from 'playwright';
const launch=chromium.launch.bind(chromium);
chromium.launch=async(...args)=>{const browser=await launch(...args);const create=browser.newContext.bind(browser);browser.newContext=async(...options)=>{const ctx=await create(...options);ctx.on('page',p=>p.on('dialog',d=>d.accept()));return ctx;};const newPage=browser.newPage.bind(browser);browser.newPage=async(...options)=>{const p=await newPage(...options);if(!p.listenerCount('dialog'))p.on('dialog',d=>d.accept());return p;};return browser;};
