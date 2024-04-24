import { storage } from "webextension-polyfill";
import { sendData } from "../services/syncService";

export async function syncData(data:any,tab:any,info:any){
    //const xtoken = localStorage.getItem('WTG_User')
    const xtoken = await storage.local.get("WTG_User");
    if(!xtoken){
      return false;
    }
    const _sendData: Response = await sendData(data, tab.tab, info) as Response;
    if(_sendData){
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions, eqeqeq
      _sendData?.status != 200 ? null : null;
    }else{
      console.log('API services is unavailable');
      //console.log(_sendData);
      
      //saveLocal(data, tab);
    } 
}
