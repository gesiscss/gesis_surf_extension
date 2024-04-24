import { openDB, DBSchema } from 'idb';
import { config } from 'process';

interface DBGesis extends DBSchema {
  'winlives': {
    key: string;
    value: Object;
  };
  'tabslives': {
    key: string;
    value: Object;
  };
  'domainslives': {
    key: string;
    value: Object;
  };
  'hostslives': {
    key: string;
    value: Object;
  };
  'config': {
    key: string;
    value: Object;
  };
  'winclose': {
    key: string;
    value: Object;
  };
}

export async function demoDB() {

const db = await openDB<DBGesis>('gesisdb', 1, {
    upgrade(db) {
      db.createObjectStore('winlives',{
        autoIncrement: true
      });
      db.createObjectStore('tabslives',{
        autoIncrement: true
      });
      db.createObjectStore('domainslives',{
        autoIncrement: true
      });
      db.createObjectStore('hostslives',{
        autoIncrement: true
      });
      db.createObjectStore('config',{
        autoIncrement: true
      });
      db.createObjectStore('winclose',{
        autoIncrement: true
      });
    },
  });
}

export async function setWin(data:object,id:string) {
  const db = await openDB<DBGesis>('gesisdb');
  return await db.put('winlives', data, id)
}

export async function getWinById(id:string) {
  const db = await openDB<DBGesis>('gesisdb');
  return await db.get('winlives',id);
}

export async function getWinIdByWinId(id:number) {
  const db = await openDB<DBGesis>('gesisdb');
  const _wins =  await db.getAll('winlives');

  const _windId:any = _wins.filter((win:any)=>win.window_num == id.toString());

  return _windId;
}


export async function setTab(data:object,id:string) {
  const db = await openDB<DBGesis>('gesisdb');
  return await db.put('tabslives', data, id)
}

export async function getTabById(id:string) {
  const db = await openDB<DBGesis>('gesisdb');
  return await db.get('tabslives',id);
}


export async function getTabIdByTabId(id:number) {
  const db = await openDB<DBGesis>('gesisdb');
  const _tabs =  await db.getAll('tabslives');
  const _tabId:any = _tabs.filter((tab:any)=>tab.tab_num == id.toString());
  return _tabId;
}

export async function setDomain(data:object,id:string) {
  const db = await openDB<DBGesis>('gesisdb');
  return await db.put('domainslives', data, id)
}

export async function getDomain(id:string) {
  const db = await openDB<DBGesis>('gesisdb');
  return await db.get('domainslives',id);
}


export async function getDomainIdByTabId(id:string) {
  const db = await openDB<DBGesis>('gesisdb');
  const _domains =  await db.getAll('domainslives');
  const _d  = _domains.filter((d:any)=>d.id ==id);
  return _d;
}

export async function setHost(data:object,id:string) {
  const db = await openDB<DBGesis>('gesisdb');
  return await db.put('hostslives', data, id)
}

export async function getHostHostId(host:string) {
  const db = await openDB<DBGesis>('gesisdb');
  const _hosts =  await db.getAll('hostslives');
  const _hostId:any = _hosts.filter((hostin:any)=>hostin.hostname == host);
  return _hostId;
}

export async function getHostAll() {
  const db = await openDB<DBGesis>('gesisdb');
  const _hosts =  await db.getAll('hostslives');
  const _h  = _hosts.length ? true : false;
  return _h;
}

export async function deleteDomainIdByTabId(id:string) {
  const db = await openDB<DBGesis>('gesisdb');
  await db.delete("domainslives",id);
}

export async function deleteTabById(id:string) {
  const db = await openDB<DBGesis>('gesisdb');
  await db.delete('tabslives',id);
}

export async function setWinClose(data:object,id:string) {
  const db = await openDB<DBGesis>('gesisdb');
  return await db.put('winclose', data, id)
}

export async function getAllWinClosed() {
  const db = await openDB<DBGesis>('gesisdb');
   const _wins = await db.getAll('winclose');
   return _wins;
}

export async function getDomainIdByTabWindowNum(id:string) {
  const db = await openDB<DBGesis>('gesisdb');
  const _domains =  await db.getAll('domainslives');
  const _d  = _domains.filter((d:any)=>d.window_num ==id);
  return _d;
}

export async function deleteWinClosed(){
  const db = await openDB<DBGesis>('gesisdb');
   const _wins:any = await db.getAll('winclose');
   _wins.map(win=>db.delete("winclose",win.win.toString()));
}