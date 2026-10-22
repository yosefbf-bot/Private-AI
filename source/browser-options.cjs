'use strict';
const fs=require('node:fs'),path=require('node:path');
const {fail}=require('./security.cjs');
const browsers=Object.freeze({
 edge:{name:'Microsoft Edge',engine:'chromium',channel:'msedge'},
 chrome:{name:'Google Chrome',engine:'chromium',channel:'chrome'},
 firefox:{name:'Firefox (managed automation build)',engine:'firefox'},
 chromium:{name:'Chromium (managed automation build)',engine:'chromium'},
 brave:{name:'Brave',engine:'chromium',relative:'BraveSoftware/Brave-Browser/Application/brave.exe'},
 vivaldi:{name:'Vivaldi',engine:'chromium',relative:'Vivaldi/Application/vivaldi.exe'},
});
function browserId(value='edge'){if(typeof value!=='string'||!Object.hasOwn(browsers,value))throw fail('INVALID');return value;}
function launchOptions(id,env=process.env,exists=fs.existsSync){
 const b=browsers[browserId(id)],options={headless:false,acceptDownloads:true,viewport:null};
 if(b.channel)options.channel=b.channel;
 if(b.relative){
  options.executablePath=[env.LOCALAPPDATA,env.PROGRAMFILES,env['PROGRAMFILES(X86)']].filter(Boolean).map(root=>path.join(root,b.relative)).find(exists);
  if(!options.executablePath)throw fail('BROWSER_SETUP');
 }
 if(b.engine==='chromium')options.ignoreDefaultArgs=['--disable-extensions','--disable-component-extensions-with-background-pages','--password-store=basic','--use-mock-keychain'];
 else options.firefoxUserPrefs={'signon.rememberSignons':true,'signon.autofillForms':true};
 return options;
}
function profilePath(root,id){browserId(id);return path.join(root,id==='edge'?'browser-profile':'browser-profile-'+id);}
function checkReportBrowser(context,id,platform=process.platform){
 // Chromium's Windows persistent-download history crash is fixed in 155.
 // Inspect the actual launched engine, including an already open setup session.
 if(platform!=='win32'||browsers[browserId(id)].engine!=='chromium')return;
 let version;try{version=context.browser().version();}catch{throw fail('BROWSER_UPDATE');}
 if(typeof version!=='string'||!/^\d{1,4}(?:\.\d{1,6}){3}$/.test(version)||Number(version.split('.')[0])<155)throw fail('BROWSER_UPDATE');
}
module.exports={browsers,browserId,launchOptions,profilePath,checkReportBrowser};
