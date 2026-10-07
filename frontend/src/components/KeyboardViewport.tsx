import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, Platform, View, type KeyboardEvent } from 'react-native';
/** Measure actual overlap: works with both resize and edge-to-edge overlay keyboards. */
export function KeyboardViewport({children}:{children:ReactNode}) {
 const ref=useRef<View>(null); const keyboardTop=useRef<number|null>(null);
 const [overlap,setOverlap]=useState(0);
 const measure=useCallback(()=>{ref.current?.measureInWindow((_x,y,_w,h)=>{
  setOverlap(keyboardTop.current===null?0:Math.max(0,y+h-keyboardTop.current));
 });},[]);
 useEffect(()=>{
  const show=(e:KeyboardEvent)=>{keyboardTop.current=e.endCoordinates.screenY;measure();};
  const hide=()=>{keyboardTop.current=null;setOverlap(0);};
  const a=Keyboard.addListener(Platform.OS==='ios'?'keyboardWillChangeFrame':'keyboardDidShow',show);
  const b=Keyboard.addListener('keyboardDidHide',hide);
  return()=>{a.remove();b.remove();};
 },[measure]);
 return <View ref={ref} collapsable={false} onLayout={measure} style={{flex:1,minHeight:0}}><View style={{flex:1,minHeight:0,paddingBottom:overlap}}>{children}</View></View>;
}
