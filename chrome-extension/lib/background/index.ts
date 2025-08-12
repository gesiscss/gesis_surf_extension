console.log('Background script loaded');

// import { alarms, runtime, storage} from 'webextension-polyfill'
// import {getCurrentTab, startListeners} from './helpers/tabs'
// import { syncData } from './controllers/core'
// import { demoDB, getDomainIdByTabWindowNum } from './db/dblocal'
// import { setCick, setScroll } from './services/syncService'
// import { startAlarmAll, startHeartbeat } from './services/heartbeat'
// import { initPrivateMode, setPrivateMode } from './services/privateMode'
// import { checkVersions, installedVersion } from './helpers/config'
// import { getHostVersion, getHosts } from './middleware/hosts'
// import { getDomainsByWinnumLocal } from './helpers/offline'
// type Message = {
//   from: string
//   info: string
//   action: string,
//   tab:number,
//   to:string,
//   meta:object
// }

// export async function init() {

//   runtime.onMessage.addListener(async (message: Message, sender) => {
//     if (message.action === 'pageLoaded'){
//        syncData(message.info,sender,message.meta);
//     }

//     if (message.action === 'setToken'){
//      await storage.local.set({ "WTG_User": message.meta});
//      await getHostVersion().then(data=>data ? getHosts() : null);
//     } 

//     if(message.action == 'scrollEnd'){
//       await setScroll(sender.tab,message.info,message.meta)
//     }

//     if(message.action == 'clickContent'){
//       await setCick(sender.tab,message.info,message.meta)
//     }
    

//     if(message.action == 'login'){
//         await getCurrentTab();
//         await installedVersion();
//     }

//   });

//   alarms.onAlarm.addListener((alarm) => {
//     if(alarm.name=='privatemode'){
//       setPrivateMode(false);
//     }
//   });

//   startListeners();
//   initPrivateMode();

// }

// runtime.onStartup.addListener(()=>{
//   init().then(async () => {
//     console.log('[background] Startup ');
//     startHeartbeat();
//     await getHostVersion().then(data=>data ? getHosts() : null);
//     getCurrentTab();
//     checkVersions();
//     getDomainsByWinnumLocal();
//     startAlarmAll(); 
//   })
// });

// runtime.onInstalled.addListener(() => {
//   init().then(async () => {
//     console.log('[background] loaded ');
//     startHeartbeat();
//     demoDB();
//     installedVersion();
//     startAlarmAll(); 
//   })
// });

// runtime.onUpdateAvailable.addListener(()=>{
//   init().then(async () => {
//     console.log('[background] loaded ');
//     startHeartbeat();
//     getCurrentTab();
//     checkVersions();
//     getDomainsByWinnumLocal();
//     getHostVersion().then((host)=>{
//       host ? getHosts() : null
//     });
//     startAlarmAll();  
//   })
// });

// runtime.onSuspendCanceled.addListener(() => {
//   console.log('Canceled');
// });

// runtime.onSuspend.addListener(() => {
//   console.log('Suspend');
//   startHeartbeat();
// })