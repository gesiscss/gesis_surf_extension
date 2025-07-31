import {runtime, storage, tabs,windows } from 'webextension-polyfill'
import { runDB } from '../db/config'
import { sendNewTab, sendNewWindow, tabClosed, windowsClosed } from '../services/syncService'
import { setWin, setWinClose } from '../db/dblocal';

export async function getCurrentTab() {
  const w = await windows.getCurrent() 
  //console.log('WindowOpened after Login', w);
  sendNewWindow(w);
  const list = await tabs.query({ windowId:w.id})
  list.forEach((tabl) => {
    //console.log('TabsOpened after Login:', tabl);
    sendNewTab(tabl)
  });
}

export async function getUnactiveTabs(){
  const w = await windows.getCurrent()  
  const listUnactive = await tabs.query({ windowId:w.id,active: false})
  //console.log(listUnactive);
  return listUnactive;
}

export async function getCurrentWindow() {
  windows.onCreated.addListener((windowInfo) => {
    console.log('New window open:', windowInfo);
    tabs.query({ windowId: windowInfo.id }).then((tabss) => {
      console.log('Tabs in new window:', tabss);
      tabss.forEach((tab) => {
        console.log('Url Tabs:', tab.url);
      });
    });
  });
}



export async function startListeners() {

  windows.onRemoved.addListener(window =>{
    setWinClose({win:window,close:new Date().valueOf().toString()},window.toString());
  })

  windows.onCreated.addListener(async window => {
    const windowId = window.id;
    sendNewWindow(window)
    
  });

  windows.onRemoved.addListener(async windowId => {
    console.log(`La ventana con id ${windowId} ha sido cerrada.`);
    await windowsClosed(windowId);
  });

  tabs.onCreated.addListener(async tab => {
    const windowId = tab.windowId;
    sendNewTab(tab)
  });

  tabs.onRemoved.addListener(async function(tabId, removeInfo) {
    console.log(`La pestaña con id ${tabId} ha sido cerrada.`);
    await tabClosed(tabId,false)
});
}
