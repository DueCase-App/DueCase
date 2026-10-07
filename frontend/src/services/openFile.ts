import { fetch as expoFetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
/** Downloads private files with authentication; never expose a bearer token in a URL. */
export async function openPrivateFile(source:{uri:string;headers:Record<string,string>},name:string,mime:string):Promise<void>{
 const response=await (Platform.OS==='web'?fetch:expoFetch)(source.uri,{headers:source.headers});
 if(!response.ok){const detail=await response.json().catch(()=>null) as {error?:string}|null;throw new Error(detail?.error??'Impossibile scaricare il file. Riprova.');}
 if(Platform.OS==='web'){
  const url=URL.createObjectURL(await response.blob());
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);return;
 }
 const safe=name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100)||'allegato';
 const file=new File(Paths.cache,`${Date.now()}-${safe}`);file.create({overwrite:true});file.write(new Uint8Array(await response.arrayBuffer()));
 if(!await Sharing.isAvailableAsync())throw new Error('Nessuna app disponibile per aprire o salvare il file.');
 await Sharing.shareAsync(file.uri,{mimeType:mime,dialogTitle:'Apri o salva allegato'});
}
