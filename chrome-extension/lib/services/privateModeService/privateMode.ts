import { alarms, storage } from "webextension-polyfill";
import { updatePrivateMode } from "../syncService";

const PRIVATE_MODE = "user-private-mode";

export async function initPrivateMode() {
    alarms.getAll().then((alarms)=>{
        console.log(alarms);
    })
     await storage.local.set({"private":{"mode":false,"alarm":""}})
     updatePrivateMode(false,false);
}

export async function getPrivateMode() {
    const _private  = await storage.local.get("private");
    return _private;
}

export async function setPrivateMode(val:boolean) {
    
    if(val){
        const _date = new Date();
        _date.setMinutes(_date.getMinutes() + 15); 
        await storage.local.set({"private":{"mode":val,"alarm":_date}})
        await alarms.create('privatemode',{ periodInMinutes: 15 });
        updatePrivateMode(val,true);
        
    }else{
        await storage.local.set({"private":{"mode":val,"alarm":""}});
        alarms.clear('privatemode');
        updatePrivateMode(val,false);
    }   
}
