import { getDomainIdByTabId, getTabIdByTabId } from "../db/services/DatabaseService";

export async function getDomainIdFromTab(tab:any){
    let _last:any=null;
    let _domain:any = null;
    console.log('Has domain',tab);
    const _tab = await getTabIdByTabId(tab.id);
    _tab.length>0 ? _domain = await getDomainIdByTabId(_tab[0].id) : _domain = false;
    
    if(!_domain || _domain.length<=0){
        console.log('Helper no domain',_domain);
        console.log('Helper no tab',_tab.length);
        return false
    }
    console.log('Has domain',_domain);
    _domain[0].domains.sort(function(a,b) {
        if (a.start_time < b.start_time) {
            return -1;
        }
        return 0;
    })

    _last = _domain[0].domains.length == 0 ? 0 : _domain[0].domains.length-1

    return _domain[0].domains[_last];
    
}

export async function checkHostScroll(host){
    let _criteria;
   if(host){
        _criteria = host[0].categories[0].criteria.criteria_scroll;
   }else{
    _criteria = true;
   }
   return _criteria;
}

export async function checkHostClick(host){
    let _criteria;
   if(host){
        _criteria = host[0].categories[0].criteria.criteria_click;
   }else{
    _criteria = true;
   }
   return _criteria;
}


export async function getDomainsByTabLocal(tab:any){
    let _last:any=null;
    let _domain:any = null;
    _domain = await getDomainIdByTabId(tab.id)
    
    if(!_domain || _domain.length<=0){
        console.log('Helper no domain',_domain);
        //console.log('Helper no tab',_tab.length);
        return false
    }
    console.log('Has domain',_domain);
    _domain[0].domains.sort(function(a,b) {
        if (a.start_time < b.start_time) {
            return -1;
        }
        return 0;
    })

    _last = _domain[0].domains.length == 0 ? 0 : _domain[0].domains.length-1

    return _domain[0].domains[_last];
    
}