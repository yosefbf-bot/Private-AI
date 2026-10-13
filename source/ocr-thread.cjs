'use strict';
// OCR has no permission to fetch data or language/core files. They must already
// exist locally at verified paths. This guard also blocks a future CDN fallback.
const blocked=()=>{throw Error('Offline OCR network access is disabled');};
globalThis.fetch=async()=>blocked();
for(const module of ['node:http','node:https']){const client=require(module);client.request=blocked;client.get=blocked;}
require('tesseract.js/src/worker-script/node/index.js');
