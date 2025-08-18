import { storage } from "webextension-polyfill";
import { getHostAll, getHostHostId, getTabById, setHost } from "../db/services/DatabaseService";
const API_URL:any = 'https://surfcollect.gesis.org/api/'

async function delay(ms) {console.log(ms);
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function getHosts() {

  const xtoken = await storage.local.get("WTG_User");
  console.log('GET HOSTS');  
   try {

     const requestOptions = {
       method: 'GET',
       headers: {
         'Authorization':'token '+xtoken.WTG_User.token,
         'Content-Type': 'application/json',
       },
      }
      let _taskHost:any;

      const response = await fetch(API_URL+'host/hosts/async_hosts/', requestOptions);
      const _hosts = await response.json();
      let a = 1000;
      do{
        _taskHost = await getTask(_hosts.task_id);
        console.log('time',a);
        a = a*2
        await delay(a);
      }
        while (_taskHost.status)
      

      if(_taskHost){
        for (const h of _taskHost) {
          await setHost(h,h.id)
      }
      }
      
   
   } catch (error) {
     return false;  
   }
}

export async function getTask(taskId:any){

  const xtoken = await storage.local.get("WTG_User");
  console.log('GET TASKID');
  
   try {
     const requestOptions = {
       method: 'GET',
       headers: {
         'Authorization':'token '+xtoken.WTG_User.token,
         'Content-Type': 'application/json',
       },
      }
     const response = await fetch(API_URL+'host/task-result/'+taskId, requestOptions);

     return await response.json();
   
   } catch (error) {
    console.log('Error in Get TASKID');
     return false;  
   }
}

export async function checkHost(host:string) {
    try {
        const _host = await getHostHostId(host);
        return _host.length>0 ? _host : false

    } catch (error) {
         return false;  
    }
}

export async function setPayloadByHost(host:any,tab,data,mode){
    
  let domain:any = {};
  console.log(host);
  
  if(mode)
    {
      console.log('PRIVATE MODE ON');
      
      domain.domain_title = 'Private Mode';
      domain.domain_url = 'Private Mode';
      domain.domain_fav_icon ='Private Mode';
      domain.domain_status= "true";

      const payload:any =  {
        "start_time": new Date(),
        "closing_time": new Date(),
        "tab_num": tab.id,
        "window_num": tab.windowId,
        "domains":[
          domain
        ]
      }
        return payload;
    }

    if(host && !mode){

    host[0].categories[0].criteria.criteria_domain==false ? (domain.domain_title = host[0].categories[0].criteria.criteria_classification,domain.domain_url = host[0].categories[0].criteria.criteria_classification, domain.snapshot_html =host[0].categories[0].criteria.criteria_classification, domain.criteria_classification = host[0].categories[0].criteria.criteria_classification) : (domain.domain_title = tab.title,domain.domain_url = tab.url, domain.criteria_classification = host[0].categories[0].criteria.criteria_classification);
      
    domain.category_label = host[0].categories[0].category_label;
    domain.category_number = host[0].categories[0].category_parent;

    host[0].categories[0].criteria.snapshot_html ? domain.snapshot_html = data : domain.snapshot_html = host[0].categories[0].criteria.criteria_classification;

    host[0].categories[0].criteria.criteria_classification=='only_host' ?  domain.domain_url = host[0].hostname : null;

    domain.closing_time = new Date();
    domain.start_time = new Date();
    domain.domain_status = 'true';

    tab.favIconUrl ? 
      domain.domain_fav_icon = tab.favIconUrl : 
        domain.domain_fav_icon = 'Not found';

    }else if(!host && !mode){

      domain.domain_title = tab.title;
      domain.domain_url = tab.url;
      domain.snapshot_html =data;
      domain.closing_time = new Date();
      domain.start_time = new Date();
      domain.domain_status = 'true';
     
      tab.favIconUrl ? 
        domain.domain_fav_icon = tab.favIconUrl : 
          domain.domain_fav_icon = 'Not found';

    }else{

      domain.domain_title = tab.title;
      domain.domain_url = tab.url;
      domain.snapshot_html =data;
      domain.closing_time = new Date();
      domain.start_time = new Date();
      domain.domain_status = 'true';
     
      tab.favIconUrl ? 
        domain.domain_fav_icon = tab.favIconUrl : 
          domain.domain_fav_icon = 'Not found';

    }

    const payload:any =  {
      "start_time": new Date(),
      "closing_time": new Date(),
      "tab_num": tab.id,
      "window_num": tab.windowId,
      "domains":[
        domain
      ]
    }
      return payload;

}

export async function hostVersion(){
  const xtoken = await storage.local.get("WTG_User");
  try {

    const requestOptions = {
      method: 'GET',
      headers: {
        'Authorization':'token ' + xtoken.WTG_User.token,
        'Content-Type': 'application/json',
      }
     }
     const response = await fetch(API_URL+'user/me/', requestOptions);
     return response.json();
    
  } catch (error) {
    console.log(error);
    
    return false;
  }
}

export async function getHostVersion(){
  return new Promise(async (resolve, reject) => {
      const _version = await hostVersion();
      const _idTask = await storage.local.get("host_version");
      const _isHosts = await getHostAll();

    if(!_isHosts){
      resolve(true)
    }

      if(_idTask){
        if(_version.extension.host_version == _idTask.host_version ){
          resolve(false);
        }else{
          await storage.local.set({"host_version":_version.extension.host_version});
          resolve(true)
        }
      }else{
        await storage.local.set({"host_version":_version.extension.host_version});
        resolve(true)
      }
  })

}


export async function getMePrivacy(){
  const xtoken = await storage.local.get("WTG_User");
  try {

    const requestOptions = {
      method: 'GET',
      headers: {
        'Authorization':'token ' + xtoken.WTG_User.token,
        'Content-Type': 'application/json',
      }
     }
     const response = await fetch(API_URL+'user/me/', requestOptions);
     return response.json();
    
  } catch (error) {
    console.log(error);
    return false;
  }
}