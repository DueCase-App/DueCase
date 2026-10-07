import { useEffect,useState } from 'react';
import { Text,TextInput,View,Pressable,Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { ui } from '../theme/ui';
export function EmailVerification(){
 const {refreshUser}=useAuth();
 const [state,setState]=useState<{configured:boolean;verified:boolean;required:boolean}|null>(null);
 const [code,setCode]=useState('');const [busy,setBusy]=useState(false);const [sent,setSent]=useState(false);
 useEffect(()=>{void api.auth.emailStatus().then(setState).catch(()=>{});},[]);
 async function action(confirm:boolean){if(busy)return;setBusy(true);try{if(confirm){await api.auth.confirmEmail(code);await refreshUser();setState(await api.auth.emailStatus());}else{await api.auth.requestEmail();setSent(true);}}catch(e){Alert.alert('Verifica email',e instanceof Error?e.message:'Operazione non riuscita');}finally{setBusy(false);}}
 if(!state)return null;
 return <View style={{padding:16,gap:10,borderRadius:16,backgroundColor:ui.colors.primarySoft}}>
  <Text style={{fontWeight:'800',color:ui.colors.text}}>Email {state.verified?'verificata':'da verificare'}</Text>
  {!state.configured?<Text>Il servizio email sarà attivato prima della pubblicazione. Nessun codice è stato inviato.</Text>:!state.verified?<>
   {sent?<><TextInput accessibilityLabel="Codice verifica email" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="Codice a 6 cifre" style={{padding:14,backgroundColor:'white',borderRadius:12}}/><Pressable disabled={busy||code.length!==6} onPress={()=>void action(true)}><Text style={{color:ui.colors.primary,fontWeight:'800'}}>Conferma email</Text></Pressable></>:null}
   <Pressable disabled={busy} onPress={()=>void action(false)}><Text style={{color:ui.colors.primary,fontWeight:'800'}}>{busy?'Attendi…':sent?'Invia un nuovo codice':'Invia codice di verifica'}</Text></Pressable>
  </>:null}
 </View>;
}
