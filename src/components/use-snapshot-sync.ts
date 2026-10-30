'use client';
import {useEffect,useRef} from 'react';
/** Notify other tabs of a change, never transmit records or authentication data. */
export function useSnapshotSync(userId:string|undefined,onRefresh:()=>void){
 const callback=useRef(onRefresh);callback.current=onRefresh;
 const channel=useRef<BroadcastChannel|null>(null);
 useEffect(()=>{
  if(!userId)return;
  const key=`finora:refresh:${userId}`;
  try{if('BroadcastChannel' in window){const active=new BroadcastChannel(key);channel.current=active;active.onmessage=event=>{if(event.data==='changed')callback.current();};}}catch{/* Focus/storage refresh remains available in restricted browsers. */}
  const storage=(event:StorageEvent)=>{if(event.key===key&&event.newValue)callback.current();};
  window.addEventListener('storage',storage);
  return()=>{window.removeEventListener('storage',storage);channel.current?.close();channel.current=null;};
 },[userId]);
 return()=>{
  if(!userId)return;
  try{if(channel.current){channel.current.postMessage('changed');return;}}catch{/* Optional notification must never block the local refresh. */}
  try{localStorage.setItem(`finora:refresh:${userId}`,crypto.randomUUID());}catch{/* Saving is independent from optional cross-tab notification. */}
 };
}
