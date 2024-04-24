import { alarms, runtime, storage } from "webextension-polyfill";

let heartbeatInterval;
let alarmInterval;

export async function runHeartbeat() {
  await storage.local.set({ 'last-heartbeat': new Date().getTime() });
}

export async function startHeartbeat() {

  runHeartbeat().then(() => {
    
    heartbeatInterval = setInterval(runHeartbeat, 10 * 1000);
  });
}

export async function stopHeartbeat() {
  clearInterval(heartbeatInterval);
}

export async function getLastHeartbeat() {
  return (await storage.local.get('last-heartbeat'))['last-heartbeat'];
}

export async function runAlarmAll() {
    alarms.create('heartBeat',{
      delayInMinutes:1
    })
}

export async function startAlarmAll() {
  runAlarmAll().then(() => {
    alarmInterval = setInterval(runAlarmAll, 10 * 1000);
  });
}


