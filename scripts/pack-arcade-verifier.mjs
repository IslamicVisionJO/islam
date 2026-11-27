import {mkdir,copyFile} from 'node:fs/promises';
const target='supabase/functions/arcade-verify/engine';
await mkdir(target,{recursive:true});
for(const name of ['core','replay','blocks','space','bubbles','tiles'])await copyFile('public/arcade/'+name+'.mjs',target+'/'+name+'.mjs');
