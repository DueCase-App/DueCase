import { Ionicons } from '@expo/vector-icons';
import { fetch as expoFetch } from 'expo/fetch';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../services/api';
import { cardShadow, ui } from '../theme/ui';
import type { DocumentCategory, FamilyDocument } from '../types/models';

const categories: DocumentCategory[]=['Salute','Scuola','Legale','Altro'];
const categoryIcons:Record<DocumentCategory,keyof typeof Ionicons.glyphMap>={Salute:'medkit-outline',Scuola:'school-outline',Legale:'briefcase-outline',Altro:'folder-outline'};
type Picked={uri:string;name:string;type:string;size:number|null;file?:Blob};
const formatSize=(n:number|null)=>!n?'':n<1048576?`${Math.max(1,Math.round(n/1024))} KB`:`${(n/1048576).toFixed(1)} MB`;
const safe=(n:string)=>n.replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-120)||'documento';

export function DocumentsScreen():React.JSX.Element{
  const [items,setItems]=useState<FamilyDocument[]>([]);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [form,setForm]=useState(false);
  const [preview,setPreview]=useState<FamilyDocument|null>(null);
  const [busy,setBusy]=useState<string|null>(null);
  const grouped=useMemo(()=>categories.map(category=>({category,items:items.filter(i=>i.category===category)})),[items]);

  async function load(){try{setItems(await api.documents.list());}catch(error){Alert.alert('Documenti',error instanceof Error?error.message:'Errore di caricamento');}finally{setLoading(false);setRefreshing(false);}}
  useEffect(()=>{void load();},[]);

  async function open(item:FamilyDocument,download=false){
    try{
      setBusy(item.id);
      const req=api.documents.fileRequest(item.fileUrl,download);
      if(Platform.OS==='web'){
        const response=await fetch(req.url,{headers:req.headers});
        if(!response.ok)throw new Error(`HTTP ${response.status}`);
        const blob=await response.blob();
        const url=URL.createObjectURL(blob);
        if(download){const anchor=document.createElement('a');anchor.href=url;anchor.download=item.filename??'documento';anchor.click();}else window.open(url,'_blank','noopener,noreferrer');
        setTimeout(()=>URL.revokeObjectURL(url),60000);
        return;
      }
      const response=await expoFetch(req.url,{headers:req.headers});
      if(!response.ok)throw new Error(`Impossibile aprire il documento (HTTP ${response.status}).`);
      const file=new File(Paths.cache,`${Date.now()}-${safe(item.filename??item.title)}`);
      file.create({overwrite:true});
      file.write(await response.bytes());
      if(!await Sharing.isAvailableAsync())throw new Error('Nessuna app disponibile per aprire il file.');
      await Sharing.shareAsync(file.uri,{mimeType:item.mimeType??undefined,dialogTitle:download?'Salva o condividi documento':'Apri documento'});
    }catch(error){Alert.alert('Documento',error instanceof Error?error.message:'Impossibile aprire il documento');}finally{setBusy(null);}
  }

  if(loading)return <View style={styles.center}><ActivityIndicator size="large" color={ui.colors.primary}/><Text style={styles.muted}>Caricamento documenti…</Text></View>;

  return <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} tintColor={ui.colors.primary} onRefresh={()=>{setRefreshing(true);void load();}}/>}>
      <View style={styles.header}><View style={styles.headerCopy}><Text style={styles.title}>Documenti</Text><Text style={styles.muted}>Archivio protetto e condiviso della famiglia.</Text></View><Pressable style={styles.add} onPress={()=>setForm(true)}><Ionicons name="add" size={20} color="#FFF"/><Text style={styles.addText}>Carica</Text></Pressable></View>
      <View style={styles.securityCard}><View style={styles.securityIcon}><Ionicons name="lock-closed-outline" size={22} color={ui.colors.primary}/></View><View style={styles.flex}><Text style={styles.bold}>Archivio privato</Text><Text style={styles.muted}>Ogni file è disponibile solo agli utenti autenticati della stessa famiglia.</Text></View></View>
      {items.length===0?<View style={[styles.emptyCard,cardShadow]}><View style={styles.emptyIcon}><Ionicons name="document-text-outline" size={27} color={ui.colors.primary}/></View><Text style={styles.bold}>Nessun documento</Text><Text style={styles.muted}>Carica un PDF o un’immagine per iniziare.</Text></View>:grouped.filter(group=>group.items.length>0).map(group=><View key={group.category} style={styles.group}><View style={styles.sectionHeader}><Ionicons name={categoryIcons[group.category]} size={21} color={ui.colors.primary}/><Text style={styles.section}>{group.category}</Text><View style={styles.countBadge}><Text style={styles.countText}>{group.items.length}</Text></View></View>{group.items.map(item=><View key={item.id} style={[styles.card,cardShadow]}>
        <View style={styles.fileRow}><View style={styles.fileIcon}><Ionicons name={item.mimeType==='application/pdf'?'document-text-outline':'image-outline'} size={24} color={ui.colors.primary}/></View><View style={styles.flex}><Text style={styles.bold}>{item.title}</Text>{item.description?<Text style={styles.muted}>{item.description}</Text>:null}<Text style={styles.meta}>{[item.filename,formatSize(item.fileSizeBytes),item.uploadedByName?`da ${item.uploadedByName}`:''].filter(Boolean).join(' · ')}</Text></View></View>
        <View style={styles.actions}><Pressable disabled={busy===item.id} style={styles.secondary} onPress={()=>item.mimeType?.startsWith('image/')&&Platform.OS!=='web'?setPreview(item):void open(item,false)}><Ionicons name="eye-outline" size={18} color={ui.colors.primary}/><Text style={styles.secondaryText}>Visualizza</Text></Pressable><Pressable disabled={busy===item.id} style={styles.primary} onPress={()=>void open(item,true)}>{busy===item.id?<ActivityIndicator color="#FFF"/>:<><Ionicons name="download-outline" size={18} color="#FFF"/><Text style={styles.primaryText}>Scarica</Text></>}</Pressable></View>
      </View>)}</View>)}
    </ScrollView>
    <UploadModal visible={form} onClose={()=>setForm(false)} onDone={document=>{setItems(current=>[document,...current]);setForm(false);}}/>
    <Modal visible={preview!==null} transparent animationType="fade" onRequestClose={()=>setPreview(null)}><View style={styles.backdrop}><View style={styles.preview}><View style={styles.modalHead}><Text style={styles.modalTitle}>{preview?.title}</Text><Pressable onPress={()=>setPreview(null)}><Ionicons name="close" size={26} color={ui.colors.text}/></Pressable></View>{preview?<Image source={api.documents.fileSource(preview.fileUrl)} style={styles.image} resizeMode="contain"/>:null}</View></View></Modal>
  </View>;
}

function UploadModal({visible,onClose,onDone}:{visible:boolean;onClose:()=>void;onDone:(document:FamilyDocument)=>void}):React.JSX.Element{
  const [title,setTitle]=useState('');
  const [description,setDescription]=useState('');
  const [category,setCategory]=useState<DocumentCategory>('Salute');
  const [picked,setPicked]=useState<Picked|null>(null);
  const [busy,setBusy]=useState(false);

  async function choose(){const result=await DocumentPicker.getDocumentAsync({type:['application/pdf','image/*'],copyToCacheDirectory:true,multiple:false});if(result.canceled)return;const asset=result.assets[0];if(!asset)return;setPicked({uri:asset.uri,name:asset.name??'documento',type:asset.mimeType??'application/octet-stream',size:asset.size??null,file:asset.file});if(!title.trim())setTitle((asset.name??'Documento').replace(/\.[^.]+$/,''));}
  async function save(){if(!title.trim()||!picked){Alert.alert('Documento','Inserisci un titolo e seleziona un file.');return;}try{setBusy(true);const document=await api.documents.create({title:title.trim(),description:description.trim()||undefined,category,file:picked});onDone(document);setTitle('');setDescription('');setPicked(null);}catch(error){Alert.alert('Upload',error instanceof Error?error.message:'Caricamento non riuscito');}finally{setBusy(false);}}

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.backdrop}><View style={styles.modal}><View style={styles.modalHead}><Text style={styles.modalTitle}>Carica documento</Text><Pressable onPress={onClose}><Ionicons name="close" size={26} color={ui.colors.text}/></Pressable></View><Text style={styles.label}>Titolo</Text><TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Titolo del documento" placeholderTextColor={ui.colors.muted}/><Text style={styles.label}>Categoria</Text><View style={styles.chips}>{categories.map(item=><Pressable key={item} onPress={()=>setCategory(item)} style={[styles.chip,category===item&&styles.chipSelected]}><Text style={[styles.chipText,category===item&&styles.chipTextSelected]}>{item}</Text></Pressable>)}</View><Text style={styles.label}>Descrizione</Text><TextInput style={[styles.input,styles.description]} multiline value={description} onChangeText={setDescription} placeholder="Descrizione facoltativa" placeholderTextColor={ui.colors.muted}/><Pressable style={styles.filePicker} onPress={()=>void choose()}><Ionicons name="attach-outline" size={20} color={ui.colors.primary}/><Text style={styles.secondaryText}>{picked?`${picked.name} ${formatSize(picked.size)}`:'Seleziona PDF o immagine'}</Text></Pressable><View style={styles.actions}><Pressable style={styles.secondary} onPress={onClose}><Text style={styles.secondaryText}>Annulla</Text></Pressable><Pressable disabled={busy} style={styles.primary} onPress={()=>void save()}>{busy?<ActivityIndicator color="#FFF"/>:<Text style={styles.primaryText}>Carica</Text>}</Pressable></View></View></View></Modal>;
}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:ui.colors.background},center:{flex:1,alignItems:'center',justifyContent:'center',gap:10,backgroundColor:ui.colors.background},content:{padding:18,gap:15,paddingBottom:34},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},headerCopy:{flex:1,gap:3},title:{fontSize:28,fontWeight:'900',color:ui.colors.primaryDark},muted:{color:ui.colors.muted,lineHeight:20},bold:{fontWeight:'900',color:ui.colors.text},
  add:{backgroundColor:ui.colors.primary,minHeight:44,paddingHorizontal:13,borderRadius:ui.radius.md,flexDirection:'row',alignItems:'center',gap:5},addText:{color:'#FFF',fontWeight:'900'},
  securityCard:{backgroundColor:ui.colors.card,borderWidth:1,borderColor:ui.colors.border,borderRadius:ui.radius.lg,padding:14,flexDirection:'row',alignItems:'center',gap:12},securityIcon:{width:44,height:44,borderRadius:13,backgroundColor:ui.colors.primarySoft,alignItems:'center',justifyContent:'center'},
  flex:{flex:1},group:{gap:9},sectionHeader:{flexDirection:'row',alignItems:'center',gap:7},section:{fontSize:20,fontWeight:'900',color:ui.colors.primaryDark},countBadge:{minWidth:24,height:24,borderRadius:12,backgroundColor:ui.colors.primarySoft,alignItems:'center',justifyContent:'center',paddingHorizontal:6},countText:{fontSize:11,fontWeight:'900',color:ui.colors.primary},
  emptyCard:{backgroundColor:ui.colors.card,borderRadius:ui.radius.lg,padding:20,borderWidth:1,borderColor:ui.colors.border,alignItems:'center',gap:7},emptyIcon:{width:54,height:54,borderRadius:16,backgroundColor:ui.colors.primarySoft,alignItems:'center',justifyContent:'center'},
  card:{backgroundColor:ui.colors.card,borderWidth:1,borderColor:ui.colors.border,borderRadius:ui.radius.lg,padding:15,gap:12},fileRow:{flexDirection:'row',gap:12},fileIcon:{width:48,height:48,borderRadius:14,backgroundColor:ui.colors.primarySoft,alignItems:'center',justifyContent:'center'},meta:{fontSize:12,color:ui.colors.muted,marginTop:3},
  actions:{flexDirection:'row',gap:9},secondary:{flex:1,minHeight:44,borderRadius:ui.radius.md,borderWidth:1,borderColor:ui.colors.border,backgroundColor:ui.colors.input,alignItems:'center',justifyContent:'center',paddingHorizontal:10,flexDirection:'row',gap:6},secondaryText:{color:ui.colors.primaryDark,fontWeight:'800'},primary:{flex:1,minHeight:44,borderRadius:ui.radius.md,backgroundColor:ui.colors.primary,alignItems:'center',justifyContent:'center',paddingHorizontal:10,flexDirection:'row',gap:6},primaryText:{color:'#FFF',fontWeight:'900'},
  backdrop:{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(10,50,103,.35)'},modal:{backgroundColor:ui.colors.card,padding:20,borderTopLeftRadius:28,borderTopRightRadius:28,gap:10},modalHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},modalTitle:{fontSize:22,fontWeight:'900',color:ui.colors.primaryDark},label:{fontWeight:'800',color:ui.colors.text},input:{borderWidth:1,borderColor:ui.colors.border,backgroundColor:ui.colors.input,borderRadius:ui.radius.md,minHeight:50,paddingHorizontal:13,color:ui.colors.text,textAlignVertical:'top'},description:{minHeight:82,paddingTop:12},chips:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{paddingHorizontal:10,paddingVertical:8,borderRadius:999,backgroundColor:ui.colors.input,borderWidth:1,borderColor:ui.colors.border},chipSelected:{backgroundColor:ui.colors.primarySoft,borderColor:ui.colors.primary},chipText:{color:ui.colors.muted,fontWeight:'700'},chipTextSelected:{color:ui.colors.primary,fontWeight:'900'},filePicker:{minHeight:50,borderRadius:ui.radius.md,backgroundColor:ui.colors.input,borderWidth:1,borderColor:ui.colors.border,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,paddingHorizontal:12},
  preview:{backgroundColor:ui.colors.card,margin:18,borderRadius:20,padding:14,gap:12,maxHeight:'85%'},image:{width:'100%',height:500,borderRadius:12,backgroundColor:ui.colors.input}
});
