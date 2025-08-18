import { storage } from 'webextension-polyfill';
import { findIdInStore, openDatabases, runDB } from '../db/config';
import { getCurrentUser } from './authService';
import { log } from 'console';
import { deleteDomainIdByTabId, deleteTabById, getDomainIdByTabId, getHostHostId, getTabById, getTabIdByTabId, getWinIdByWinId, setDomain, setTab, setWin } from '../db/services/DatabaseService';
import { checkHost, setPayloadByHost } from '../middleware/hosts';
import { checkHostClick, checkHostScroll, getDomainIdFromTab, getDomainsByTabLocal } from '../helpers/scrollingTab';
import { getPrivateMode } from './privateMode/privateMode';
const API_URL:any = 'https://surfcollect.gesis.org/api/'

type Window = {
  id: string
  startingTime: string
}

type Tab = {
  id: string
  startingTime: string
  windowId: string
} 

export class Doms {
  tabId?: number;
  windowId?: number;
  dom?: string;
  url?: string;
  createdAt?: number;

  constructor({ tabId = 0, windowId = 0, dom = '', url = '', createdAt = Date.now() }: Partial<Doms> = {}) {
    this.tabId = tabId;
    this.windowId = windowId;
    this.dom = dom;
    this.url = url;
    this.createdAt = createdAt;
  }
}

export async function sendData(data:any,tab:any,info){
  const _mode =  await getPrivateMode();
  console.log('host',info);

  const _checkHost = await checkHost(info.host);
  const payload = await setPayloadByHost(_checkHost, tab, data, _mode.private.mode);
  const _tab = await getTabIdByTabId(tab.id);

  if(_tab.length>0){

    let _domain:any = await getDomainIdByTabId(_tab[0].id);
    
  if (_domain?.length>0) {
    const dlength = _domain[0].domains.length -1;
    

    _domain[0].domains.sort(function(a, b) {
      if (a.start_time < b.start_time) {
          return -1;
      }
      return 0;
  });

    await updateDomain(_domain[0].domains[dlength],false);
  }
  return updateTab(payload,_tab[0])
  }else{
    return false;
  }
  
};

async function updateTab(payload:any,tab:any){
  const xtoken = await storage.local.get("WTG_User");
  const _data = {
    "tab_num":tab.tab_num,
    "window_num":tab.window_num,
    "domains":payload.domains
  }
  try {
    const requestOptions = {
      method: 'PUT',
      headers: {
        'Authorization':'token ' + xtoken.WTG_User.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(_data)
     }
     
     const response = await fetch(API_URL+'tab/tabs/'+tab.id, requestOptions);
     const _tab = await response.json();
     await setDomain(_tab,_tab.id)
    return response;

  
  } catch (error) {
    return false;  
  }
}

export async function updateDomain(domain:any,offline) {
  const xtoken = await storage.local.get("WTG_User");
  const _data = {
    "closing_time": !offline ? new Date() : new Date(parseInt(offline))
  }
  console.log('ID',domain);
  console.log('hora',_data);
  console.log('Entro a closing');
  
  try {

    const requestOptions = {
      method: 'PATCH',
      headers: {
        'Authorization':'token ' + xtoken.WTG_User.token,
        'Content-Type': 'application/json',
      },
      body:JSON.stringify(_data)
     }

     const response = await fetch(API_URL+'domain/domains/'+domain.id, requestOptions);
     const _domain = await response.json();
     return _domain;
    
  } catch (error) {
    //console.log(error);
    
    return false;
  }
}

//production
export async function sendNewTab(tab:any) {

  const payload =  {
    "start_time": new Date(),
    "closing_time": new Date(),
    "tab_num": tab.id,
    "window_num": tab.windowId
  }

const xtoken = await storage.local.get("WTG_User");
 
  try {
     const requestOptions = {
       method: 'POST',
       headers: {
         'Authorization':'token '+xtoken.WTG_User.token,
         'Content-Type': 'application/json',
       },
       body: JSON.stringify(payload)
      }
     const response = await fetch(API_URL+'tab/tabs/', requestOptions);
     const tab = await response.json();
     setTab(tab,tab.id);
     return response;
   
   } catch (error) {
     return false;  
   }
  
}

///Production
export async function sendNewWindow(window:any) {

  const payload =  {
    "start_time": new Date(),
    "closing_time": new Date(),
    "window_num": window.id
  }

  const xtoken = await storage.local.get("WTG_User");

   try {
     const requestOptions = {
       method: 'POST',
       headers: {
        // 'Authorization':'token '+ xtoken.token,
         'Authorization':'token '+ xtoken.WTG_User.token,
         'Content-Type': 'application/json',
       },
       body: JSON.stringify(payload)
   }
     const response = await fetch(API_URL+'window/windows/', requestOptions);
     const win = await response.json();
      setWin(win,win.id);
     return response;
   
   } catch (error) {
     return false;  
   }
 
}


//Production
export async function windowsClosed(window){
  const _win = await getWinIdByWinId(window);

  const xtoken = await storage.local.get("WTG_User");
  const _data = {
    "closing_time": new Date(),
  }
  try {
     const requestOptions = {
      method: 'PATCH',
      headers: {
        'Authorization':'token ' + xtoken.WTG_User.token,
        'Content-Type': 'application/json',
      },
      body:JSON.stringify(_data)
     }
     
     const response = await fetch(API_URL+'window/windows/'+_win[0].id, requestOptions);
     const _domain = await response.json();
     
  } catch (error) {
    return false;
  }
}

export async function tabClosed(tab,offline){
  const _tab = await getTabIdByTabId(tab);
  const xtoken = await storage.local.get("WTG_User");
  const _data = {
    "closing_time": !offline ? new Date() : new Date(parseInt(offline))
  }

  console.log('tabupdated',_data);
  
  try {
     const requestOptions = {
      method: 'PATCH',
      headers: {
        'Authorization':'token ' + xtoken.WTG_User.token,
        'Content-Type': 'application/json',
      },
      body:JSON.stringify(_data)
     }
     
     const response = await fetch(API_URL+'tab/tabs/'+_tab[0].id, requestOptions);
     const _tabs = await response.json();
     console.log(tab);
     console.log(_tab);
     
     const _lastDomain = await getDomainsByTabLocal(_tab[0]);
     console.log("Last Domain Closed",_lastDomain);
     await updateDomain(_lastDomain,false);
  
     await deleteTabById(_tab[0].id);
     await deleteDomainIdByTabId(_tab[0].id);

  } catch (error) {
    
  }
}

export async function setScroll(tab,scroll,info){
    const _private = await getPrivateMode();

    if(_private.private.mode){
      return false;
    }
   
    const _checkHost = await checkHost(info.host);

    let _scrollCriteria = await checkHostScroll(_checkHost)

    if(!_scrollCriteria){
      return false;
    }

    const _domain = await getDomainIdFromTab(tab);
    console.log('Domain to update at Scrolling',_domain);
    
    if(_domain){
      const xtoken = await storage.local.get("WTG_User");
      const _data = {
        "scrolls":[{
            "scroll_x": scroll.x,
            "scroll_y": scroll.y,
            "page_x_offset": scroll.x,
            "page_y_offset": scroll.y,
            "scroll_time": new Date()
          }]
      }
      try {
    
        const requestOptions = {
          method: 'PATCH',
          headers: {
            'Authorization':'token ' + xtoken.WTG_User.token,
            'Content-Type': 'application/json',
          },
          body:JSON.stringify(_data)
         }
         const response = await fetch(API_URL+'domain/domains/'+_domain.id, requestOptions);
         const _domainresp = await response.json();
         return _domainresp;
        
      } catch (error) {
        return false;
      }
    }

    
  }

export async function setCick(tab,click,info){

    const _private = await getPrivateMode();

    if(_private.private.mode){
      return false;
    }
    
    const _checkHost = await checkHost(info.host);

    let _clickCriteria = await checkHostClick(_checkHost)

    if(!_clickCriteria){
      return false;
    }

    
    const _domain = await getDomainIdFromTab(tab);
    console.log('Domain to update at Clicking',_domain);
    
    if(_domain){
      const xtoken = await storage.local.get("WTG_User");
      const _data = {
        "clicks":[
          click
        ]
      }
      console.log(_data);
      try {
    
        const requestOptions = {
          method: 'PATCH',
          headers: {
            'Authorization':'token ' + xtoken.WTG_User.token,
            'Content-Type': 'application/json',
          },
          body:JSON.stringify(_data)
         }
         const response = await fetch(API_URL+'domain/domains/'+_domain.id, requestOptions);
         const _domainresp = await response.json();
         return _domainresp;
        
      } catch (error) {
        console.log(error);
        
        return false;
      }
    }

    
  }

export async function updatePrivateMode(mode,start){
  const xtoken = await storage.local.get("WTG_User");
  try {

    
    let _data:any = {
      "privacy":{
        "privacy_mode": mode
      }
    }
    let _date = new Date();
    _date.setMinutes(_date.getMinutes() + 15); 

    start ? (_data.privacy.privacy_start_time = new Date(), _data.privacy.privacy_end_time = _date ) : (_data.privacy.privacy_start_time = new Date() , _data.privacy.privacy_end_time = new Date())
    
    const requestOptions = {
      method: 'PATCH',
      headers: {
        'Authorization':'token ' + xtoken.WTG_User.token,
        'Content-Type': 'application/json',
      },
      body:JSON.stringify(_data)
     }
     const response = await fetch(API_URL+'user/me/', requestOptions);
     const _domainresp = await response.json();
     return _domainresp;
    
  } catch (error) {
    return false;
  }
  }

export async function updateConfig(data){
    const xtoken = await storage.local.get("WTG_User");
    try {
  
      const requestOptions = {
        method: 'PATCH',
        headers: {
          'Authorization':'token ' + xtoken.WTG_User.token,
          'Content-Type': 'application/json',
        },
        body:JSON.stringify(data)
       }
       const response = await fetch(API_URL+'user/me/', requestOptions);
       const _domainresp = await response.json();
       //return _domainresp;
      
    } catch (error) {
      return false;
    }
}

