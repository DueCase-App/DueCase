import { createContext,useContext,useEffect,useState,type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from './AuthContext';
import { api } from '../services/api';
import { refreshLiveViews } from '../services/live';
const empty={notifications:0,messages:0,agreements:0,expenses:0,calendar:0,permanence:0};
const Context=createContext(empty);
export const useLiveCounts=()=>useContext(Context);
export function LiveProvider({children}:{children:ReactNode}){
 const {user}=useAuth();const [counts,setCounts]=useState(empty);
 useEffect(()=>{
  if(!user?.familyId){setCounts(empty);return;}
  let active=true,foreground=Platform.OS==='web'||AppState.currentState==='active',since='',timer:ReturnType<typeof setTimeout>|undefined;
  async function refresh(){try{const c=await api.sync.counts();if(active){setCounts(c);if(Platform.OS!=='web')void Notifications.setBadgeCountAsync(c.notifications).catch(()=>{});}}catch{}}
  async function loop(){
   if(!active)return;
   if(!foreground){timer=setTimeout(loop,1000);return;}
   try {const result=await api.sync.wait(since);if(!active)return;since=result.revision;refreshLiveViews();await refresh();timer=setTimeout(loop,100);}
   catch{timer=setTimeout(loop,5000);}
  }
  const sub=AppState.addEventListener('change',s=>{foreground=s==='active';if(foreground){since='';refreshLiveViews();void refresh();}});
  const push=Notifications.addNotificationReceivedListener(()=>{refreshLiveViews();void refresh();});
  void loop();
  return()=>{active=false;clearTimeout(timer);sub.remove();push.remove();};
 },[user?.familyId,user?.id]);
 return <Context.Provider value={counts}>{children}</Context.Provider>;
}
