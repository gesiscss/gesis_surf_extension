import { runtime, storage } from "webextension-polyfill";
import { updateConfig } from "../services/syncService";

export async function checkVersions(){

    const _vextension = await runtime.getManifest();
    const _vbrowser =  await navigator.userAgent;

    await updateConfig({"extension":{
        "extension_version":_vextension.version,
        "extension_browser":_vbrowser
        }
    });  

}   

export async function installedVersion(){

    const xtoken = await storage.local.get("WTG_User");

    if(!xtoken){
        return false;
      }

    const _vextension = await runtime.getManifest();
    const _vbrowser =  await navigator.userAgent;

    await updateConfig({"extension":{
        "extension_version":_vextension.version,
        "extension_installed_at":new Date(),
        "extension_updated_at":new Date(),
        "extension_browser":_vbrowser
        }
    });  
}   


export async function updatedVersion(){

    const _vextension = await runtime.getManifest();
    const _vbrowser =  await navigator.userAgent;

    await updateConfig({"extension":{
        "extension_version":_vextension.version,
        "extension_updated_at":new Date(),
        "extension_browser":_vbrowser
        }
    });  
}