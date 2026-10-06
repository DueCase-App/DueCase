import { useEffect, useRef } from 'react';
const listeners=new Set<()=>void>();
export function refreshLiveViews(){listeners.forEach(fn=>fn());}
export function useLiveRefresh(fn:()=>unknown){
 const latest=useRef(fn);latest.current=fn;
 useEffect(()=>{const listener=()=>{void latest.current();};listeners.add(listener);return ()=>{listeners.delete(listener);};},[]);
}
