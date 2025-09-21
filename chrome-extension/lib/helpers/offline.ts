
import { deleteDomainIdByTabId, deleteWinClosed, getAllWinClosed, getDomainIdByTabWindowNum } from "../db/services/DatabaseService";

import { tabClosed, updateDomain } from "../services/syncService";

export async function getDomainsByWinnumLocal(){
    
    try {

        const _windata:any =  await getAllWinClosed();

       // console.log(_windata);

        for (const _w of _windata) {
            const _d:any = await getDomainIdByTabWindowNum(_w.win);

            if(!_d || _d.length<=0){
                console.log('Helper no domain',_d);
            }else{
               // console.log('Has domain',_d);

                for (const t of _d) {

                   t.domains.sort(function(a,b) {
                    if (a.start_time < b.start_time) {
                        return 1;
                    }
                    return 0;
                      })
                    await updateDomain(t.domains[0],_w.close);
                    console.log(t);
                    await tabClosed(t,_w.close)
                    
                    await deleteDomainIdByTabId(t.id)
                }
            }
        }

        await deleteWinClosed();
        
    } catch (error) {
        
    }
}