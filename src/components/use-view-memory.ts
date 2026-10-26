'use client';
import { useEffect,useRef,useState } from 'react';
/** Only view preferences, scoped to the authenticated user and this browser tab.
 * Financial records and authentication tokens never enter this storage. */
export function useViewMemory<T extends Record<string,unknown>>(userId:string|undefined,scope:string,value:T,restore:(saved:Record<string,unknown>)=>void) {
 const key=userId?`finora:view:v1:${userId}:${scope}`:null;
 const [ready,setReady]=useState<string|null>(null);
 const defaults=useRef(value);
 const restoreRef=useRef(restore);restoreRef.current=restore;
 useEffect(()=>{
  if(!key){setReady(null);return;}
  restoreRef.current(defaults.current);
  try {const raw=sessionStorage.getItem(key);if(raw){const saved:unknown=JSON.parse(raw);if(saved&&typeof saved==='object'&&!Array.isArray(saved))restoreRef.current(saved as Record<string,unknown>);}}
  catch { /* Storage restrictions and invalid old preferences must not block the app. */ }
  setReady(key);
 },[key]);
 const serialized=JSON.stringify(value);
 useEffect(()=>{if(key&&ready===key){try{sessionStorage.setItem(key,serialized);}catch{}}},[key,ready,serialized]);
 return key!==null&&ready===key;
}
