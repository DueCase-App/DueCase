import { useState } from 'react';
import { ScrollView,Text,TextInput,Pressable,Alert } from 'react-native';
import { SafeModal } from './SafeModal';
import { api } from '../services/api';
import { ui } from '../theme/ui';
export function PasswordReset({visible,onClose}:{visible:boolean;onClose:()=>void}){
 const [email,setEmail]=useState(''),[code,setCode]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
 const [sent,setSent]=useState(false),[busy,setBusy]=useState(false);
 async function submit(){if(busy)return;setBusy(true);try{if(!sent){const r=await api.auth.requestReset(email);Alert.alert('Recupero password',r.message);setSent(true);}else{await api.auth.confirmReset(email,code,password,confirm);Alert.alert('Password aggiornata','Accedi con la nuova password.');onClose();}}catch(e){Alert.alert('Recupero password',e instanceof Error?e.message:'Operazione non riuscita');}finally{setBusy(false);}}
 return <SafeModal visible={visible} animationType="slide" onRequestClose={onClose}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:24,gap:18}}>
 <Pressable onPress={onClose}><Text style={{color:ui.colors.primary}}>Chiudi</Text></Pressable><Text style={{fontSize:26,fontWeight:'800',color:ui.colors.text}}>Recupera password</Text>
 <TextInput placeholder="Email" accessibilityLabel="Email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} style={{padding:16,backgroundColor:'white'}}/>
 {sent?<><TextInput placeholder="Codice ricevuto via email" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode}/><Text>Almeno 8 caratteri, una maiuscola e un carattere speciale.</Text><TextInput placeholder="Nuova password" secureTextEntry value={password} onChangeText={setPassword}/><TextInput placeholder="Conferma password" secureTextEntry value={confirm} onChangeText={setConfirm}/></>:null}
 <Pressable disabled={busy} onPress={()=>void submit()} style={{padding:18,borderRadius:14,backgroundColor:ui.colors.primary}}><Text style={{color:'white',textAlign:'center',fontWeight:'800'}}>{busy?'Attendi…':sent?'Aggiorna password':'Invia codice'}</Text></Pressable>
 </ScrollView></SafeModal>;
}
