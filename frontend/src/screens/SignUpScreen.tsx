import { SafeModal as Modal } from '../components/SafeModal';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import {
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  clearPendingParentInvite,
  getPendingParentInvite,
  parentInvitations,
  type ParentInviteLink,
} from '../services/parentInvitations';
import type { ParentRole, RegisterInput } from '../types/models';

const COLORS = {
  blue: '#056FD2', blueDark: '#0B376D', orange: '#FF7A1A', text: '#0A3267', muted: '#5D7CA7',
  input: '#E9F0F8', border: '#C5D9EF', white: '#FFFFFF', danger: '#D92D20', shadow: '#173C68',
  modalPlaceholder: '#4B5563',
};
const MIN_DATE = new Date(1900, 0, 1);
const PRIVACY_URL = 'https://www.duecaseununicasquadra.com/privacy.html';
const TERMS_URL = 'https://www.duecaseununicasquadra.com/termini.html';
type IconName = ComponentProps<typeof Ionicons>['name'];
type DateTarget = 'parent' | 'child';
type ChildDraft = { id: string; displayName: string; birthDate: Date | null };

function defaultDate(yearsAgo: number): Date {
  const value = new Date(); value.setHours(12,0,0,0); value.setFullYear(value.getFullYear()-yearsAgo); return value;
}
function formatItalianDate(value: Date | null): string {
  if (!value) return '';
  return `${String(value.getDate()).padStart(2,'0')}/${String(value.getMonth()+1).padStart(2,'0')}/${value.getFullYear()}`;
}
function toIsoDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
}
function normalizePhone(value: string): string { return value.trim().replace(/\s+/g,' '); }

export function SignUpScreen({ onShowLogin }: { onShowLogin: () => void }): React.JSX.Element {
  const { register, refreshUser } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const stack = width < 680;
  const compact = width < 360;
  const heroHeight = Math.max(185, Math.min(360, width * 0.44));

  const [firstName,setFirstName]=useState('');
  const [lastName,setLastName]=useState('');
  const [birthDate,setBirthDate]=useState<Date|null>(null);
  const [email,setEmail]=useState('');
  const [phone,setPhone]=useState('');
  const [password,setPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [passwordVisible,setPasswordVisible]=useState(false);
  const [role,setRole]=useState<ParentRole>('father');
  const [familyName,setFamilyName]=useState('');
  const [children,setChildren]=useState<ChildDraft[]>([]);
  const [inviteOtherParent,setInviteOtherParent]=useState(true);
  const [otherParentEmail,setOtherParentEmail]=useState('');
  const [inviteFromLink,setInviteFromLink]=useState<ParentInviteLink|null>(null);
  const [privacyAcknowledged,setPrivacyAcknowledged]=useState(false);
  const [termsAccepted,setTermsAccepted]=useState(false);
  const [childModalVisible,setChildModalVisible]=useState(false);
  const [childName,setChildName]=useState('');
  const [childBirthDate,setChildBirthDate]=useState<Date|null>(null);
  const [iosDateTarget,setIosDateTarget]=useState<DateTarget|null>(null);
  const [iosPickerValue,setIosPickerValue]=useState<Date>(defaultDate(30));
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{
    const invite=getPendingParentInvite(); if(!invite)return;
    setInviteFromLink(invite); setInviteOtherParent(false); setEmail(invite.email); setRole(invite.role);
  },[]);
  const childrenLabel=useMemo(()=>children.length===0?'Aggiungi i tuoi figli':children.length===1?'1 figlio aggiunto':`${children.length} figli aggiunti`,[children.length]);

  function applySelectedDate(target:DateTarget,date:Date){ if(target==='parent')setBirthDate(date); else setChildBirthDate(date); }
  function openDatePicker(target:DateTarget){
    const current=target==='parent'?(birthDate??new Date()):(childBirthDate??new Date());
    if(Platform.OS==='android'){
      DateTimePickerAndroid.open({value:current,mode:'date',display:'default',minimumDate:MIN_DATE,maximumDate:new Date(),onChange:(event:DateTimePickerEvent,date?:Date)=>{if(event.type==='set'&&date)applySelectedDate(target,date);}}); return;
    }
    setIosPickerValue(current); setIosDateTarget(target);
  }
  function addChild(){
    const name=childName.trim(); if(name.length<2){Alert.alert('Nome del figlio','Inserisci il nome del figlio.');return;}
    setChildren(v=>[...v,{id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,displayName:name,birthDate:childBirthDate}]);
    setChildName('');setChildBirthDate(null);setChildModalVisible(false);
  }

  async function submit(){
    const first=firstName.trim(), last=lastName.trim(), normalizedEmail=email.trim().toLowerCase(), normalizedPhone=normalizePhone(phone), other=otherParentEmail.trim().toLowerCase();
    if(first.length<2)return setError('Inserisci il tuo nome.');
    if(last.length<2)return setError('Inserisci il tuo cognome.');
    if(!birthDate)return setError('Seleziona la tua data di nascita.');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))return setError('Inserisci un indirizzo email valido.');
    if(inviteFromLink&&normalizedEmail!==inviteFromLink.email)return setError(`Questo invito è destinato a ${inviteFromLink.email}.`);
    if(normalizedPhone&&normalizedPhone.replace(/\D/g,'').length<6)return setError('Inserisci un numero di telefono valido.');
    if(password.length<8||!/[A-Z]/.test(password)||!/[^a-zA-Z0-9\s]/.test(password))return setError('Usa almeno 8 caratteri, una maiuscola e un carattere speciale.');
    if(password!==confirmPassword)return setError('Le password non coincidono.');
    if(!inviteFromLink&&familyName.trim().length<2)return setError('Inserisci il nome della famiglia.');
    if(!inviteFromLink&&children.length===0)return setError('Aggiungi almeno un figlio per completare la famiglia.');
    if(!inviteFromLink&&inviteOtherParent){
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(other))return setError('Inserisci l’email valida dell’altro genitore oppure scegli “Invita più tardi”.');
      if(other===normalizedEmail)return setError('L’email dell’altro genitore deve essere diversa dalla tua.');
    }
    if(!privacyAcknowledged)return setError('Conferma di aver letto l’Informativa privacy.');
    if(!termsAccepted)return setError('Accetta i Termini e condizioni per creare l’account.');

    const input: RegisterInput = {
      displayName:`${first} ${last}`, firstName:first,lastName:last,birthDate:toIsoDate(birthDate),
      email:normalizedEmail,phone:normalizedPhone||undefined,password,confirmPassword,role,
      familyName:inviteFromLink?undefined:familyName.trim(),
      children:(inviteFromLink?[]:children).map(c=>({displayName:c.displayName,birthDate:c.birthDate?toIsoDate(c.birthDate):null})),
      inviteOtherParent:!inviteFromLink&&inviteOtherParent,
    };
    try{
      setLoading(true);setError(null);await register(input);
      if(inviteFromLink){await api.family.join(inviteFromLink.inviteCode);await refreshUser();clearPendingParentInvite();return;}
      if(inviteOtherParent){try{await parentInvitations.send(other);}catch(e){Alert.alert('Account creato',e instanceof Error?`L’account è stato creato, ma l’invito non è partito: ${e.message}. Potrai reinviarlo da Impostazioni > Famiglia.`:'Account creato. Potrai reinviare l’invito da Impostazioni > Famiglia.');}}
    }catch(e){setError(e instanceof Error?e.message:'Registrazione non riuscita. Riprova.');}finally{setLoading(false);}
  }

  return <SafeAreaView style={styles.safeArea} edges={['top','right','bottom','left']}>
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS==='ios'?'padding':'height'} keyboardVerticalOffset={Platform.OS==='ios'?8:0}>
      <StatusBar translucent={false} backgroundColor="#D9ECFA" barStyle="dark-content" />
      <ScrollView contentContainerStyle={[styles.scrollContent,{paddingBottom:Math.max(56,insets.bottom+40)}]} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS==='ios'?'interactive':'on-drag'} showsVerticalScrollIndicator={false}>
        <ImageBackground source={require('../../assets/signup-header.jpg')} resizeMode="cover" style={[styles.hero,{height:heroHeight}]} />
        <View style={styles.card}>
          <Text style={styles.title}>Crea il tuo account</Text>
          <View style={styles.progressTrack}><View style={[styles.progressSegment,styles.progressBlue]}/><View style={[styles.progressSegment,styles.progressOrange]}/></View>
          <Text style={styles.subtitle}>{inviteFromLink?'Completa la registrazione per entrare nella famiglia condivisa.':'Crea il tuo profilo DueCase con i soli dati necessari.'}</Text>

          <View style={[styles.fieldRow,(stack||compact)&&styles.fieldRowStack]}>
            <FormField label="Nome" required icon="person-outline" value={firstName} onChangeText={setFirstName} placeholder="Inserisci il tuo nome" autoCapitalize="words" />
            <FormField label="Cognome" required icon="person-outline" value={lastName} onChangeText={setLastName} placeholder="Inserisci il tuo cognome" autoCapitalize="words" />
          </View>
          <View style={[styles.fieldRow,(stack||compact)&&styles.fieldRowStack]}>
            <DateField label="Data di nascita" required value={birthDate} onChangeDate={setBirthDate} onPress={()=>openDatePicker('parent')} />
            <FormField label="Telefono (facoltativo)" icon="call-outline" value={phone} onChangeText={setPhone} placeholder="Inserisci il tuo numero" keyboardType="phone-pad" />
          </View>
          <FormField label="Email" required icon="mail-outline" value={email} onChangeText={setEmail} placeholder="La tua email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} editable={!inviteFromLink} />
          <View style={[styles.fieldRow,(stack||compact)&&styles.fieldRowStack]}>
            <FormField label="Password" required icon="lock-closed-outline" rightIcon={passwordVisible?'eye-off-outline':'eye-outline'} onRightPress={()=>setPasswordVisible(v=>!v)} value={password} onChangeText={setPassword} placeholder="Crea una password sicura" secureTextEntry={!passwordVisible} autoCapitalize="none" />
            <FormField label="Conferma password" required icon="lock-closed-outline" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Ripeti la password" secureTextEntry={!passwordVisible} autoCapitalize="none" />
          </View>
          <Text style={styles.hint}>Almeno 8 caratteri, una maiuscola e un carattere speciale.</Text>

          <RequiredLabel label="Ruolo"/><View style={styles.roleRow}>
            <RoleButton label="Papà" selected={role==='father'} onPress={()=>{if(!inviteFromLink)setRole('father');}}/>
            <RoleButton label="Mamma" selected={role==='mother'} onPress={()=>{if(!inviteFromLink)setRole('mother');}}/>
          </View>

          {inviteFromLink?<View style={styles.notice}><Ionicons name="mail-open-outline" size={24} color={COLORS.blue}/><Text style={styles.noticeText}>Dopo la registrazione entrerai automaticamente nella famiglia condivisa e non dovrai reinserire i figli.</Text></View>:<>
            <FormField label="Famiglia" required icon="people-outline" value={familyName} onChangeText={setFamilyName} placeholder="Nome della famiglia" autoCapitalize="words" />
            <RequiredLabel label="Figli"/>
            <Pressable onPress={()=>setChildModalVisible(true)} style={styles.childrenRow}><Ionicons name="people-outline" size={24} color={COLORS.muted}/><Text style={styles.childrenText}>{childrenLabel}</Text><View style={styles.plusBadge}><Ionicons name="add" size={26} color="#fff"/></View></Pressable>
            {children.length>0?<View style={styles.chips}>{children.map(c=><View key={c.id} style={styles.chip}><Text style={styles.chipText}>{c.displayName}</Text><Pressable onPress={()=>setChildren(v=>v.filter(x=>x.id!==c.id))}><Ionicons name="close-circle" size={18} color={COLORS.muted}/></Pressable></View>)}</View>:null}
            <View style={styles.selectorRow}><SelectorButton label="Invita l’altro genitore" selected={inviteOtherParent} onPress={()=>setInviteOtherParent(true)}/><SelectorButton label="Invita più tardi" selected={!inviteOtherParent} onPress={()=>setInviteOtherParent(false)}/></View>
            {inviteOtherParent?<FormField label="Email dell’altro genitore" required icon="mail-outline" value={otherParentEmail} onChangeText={setOtherParentEmail} placeholder="email@esempio.it" keyboardType="email-address" autoCapitalize="none"/>:<Text style={styles.hint}>Potrai invitarlo in qualsiasi momento da Impostazioni → Famiglia.</Text>}
          </>}

          <View style={styles.legalBox}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{checked:privacyAcknowledged}} onPress={()=>setPrivacyAcknowledged(v=>!v)} style={styles.legalRow}><Ionicons name={privacyAcknowledged?'checkbox':'square-outline'} size={24} color={privacyAcknowledged?COLORS.blue:COLORS.muted}/><Text style={styles.legalText}>Dichiaro di aver letto l’<Text style={styles.legalLink} onPress={e=>{e.stopPropagation();void Linking.openURL(PRIVACY_URL);}}>Informativa privacy</Text>.</Text></Pressable>
            <Pressable accessibilityRole="checkbox" accessibilityState={{checked:termsAccepted}} onPress={()=>setTermsAccepted(v=>!v)} style={styles.legalRow}><Ionicons name={termsAccepted?'checkbox':'square-outline'} size={24} color={termsAccepted?COLORS.blue:COLORS.muted}/><Text style={styles.legalText}>Accetto i <Text style={styles.legalLink} onPress={e=>{e.stopPropagation();void Linking.openURL(TERMS_URL);}}>Termini e condizioni</Text>.</Text></Pressable>
            <View style={styles.legalNotice}><Ionicons name="information-circle-outline" size={20} color={COLORS.orange}/><Text style={styles.legalNoticeText}>DueCase è uno strumento organizzativo e documentale. Conferme, OTP, accordi, cronologie, dossier ed esportazioni non costituiscono automaticamente firma elettronica qualificata, provvedimento giudiziario o prova con valore legale predeterminato.</Text></View>
          </View>
          {error?<View style={styles.errorBox}><Ionicons name="alert-circle-outline" size={20} color={COLORS.danger}/><Text style={styles.errorText}>{error}</Text></View>:null}
          <Pressable disabled={loading} onPress={()=>void submit()} style={[styles.continueButton,loading&&{opacity:.6}]}><Text style={styles.continueText}>{loading?'Creazione account…':'Continua'}</Text><Ionicons name="chevron-forward" size={22} color="#fff"/></Pressable>
          <Pressable onPress={onShowLogin} style={styles.loginLink}><Text style={styles.hint}>Hai già un account? <Text style={styles.legalLink}>Accedi</Text></Text></Pressable>
        </View>
      </ScrollView>

      <Modal visible={childModalVisible} transparent animationType="fade" onRequestClose={()=>setChildModalVisible(false)}>
        <SafeAreaView style={styles.modalSafeArea}><KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS==='ios'?'padding':'height'}><View style={styles.modalCard}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>Aggiungi un figlio</Text><Pressable onPress={()=>setChildModalVisible(false)}><Ionicons name="close" size={28} color={COLORS.text}/></Pressable></View>
          <FormField label="Nome" required icon="person-outline" value={childName} onChangeText={setChildName} placeholder="Nome del figlio" autoCapitalize="words" />
          <DateField label="Data di nascita" value={childBirthDate} onChangeDate={setChildBirthDate} onPress={()=>openDatePicker('child')} />
          <Pressable onPress={addChild} style={styles.continueButton}><Text style={styles.continueText}>Aggiungi</Text></Pressable>
        </View></KeyboardAvoidingView></SafeAreaView>
      </Modal>
      {Platform.OS==='ios'?<Modal visible={iosDateTarget!==null} transparent animationType="fade" onRequestClose={()=>setIosDateTarget(null)}><View style={styles.dateOverlay}><View style={styles.modalCard}><Text style={styles.modalTitle}>Seleziona la data</Text><DateTimePicker value={iosPickerValue} mode="date" display="spinner" minimumDate={MIN_DATE} maximumDate={new Date()} onChange={(_,d)=>{if(d)setIosPickerValue(d);}} locale="it-IT"/><Pressable onPress={()=>{if(iosDateTarget)applySelectedDate(iosDateTarget,iosPickerValue);setIosDateTarget(null);}} style={styles.continueButton}><Text style={styles.continueText}>Fine</Text></Pressable></View></View></Modal>:null}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function RequiredLabel({label,required=true}:{label:string;required?:boolean}){return <Text style={styles.label}>{label}{required?<Text style={styles.required}> *</Text>:null}</Text>;}
function FormField({label,required=false,icon,rightIcon,onRightPress,...props}:TextInputProps&{label:string;required?:boolean;icon:IconName;rightIcon?:IconName;onRightPress?:()=>void}){return <View style={styles.formField}><RequiredLabel label={label} required={required}/><View style={styles.inputShell}><Ionicons name={icon} size={22} color={COLORS.muted}/><TextInput {...props} style={styles.input} placeholderTextColor="#7892B5" selectionColor={COLORS.blue}/>{rightIcon?<Pressable onPress={onRightPress}><Ionicons name={rightIcon} size={23} color={COLORS.muted}/></Pressable>:null}</View></View>;}
function DateField({label,required=false,value,onPress,onChangeDate}:{label:string;required?:boolean;value:Date|null;onPress:()=>void;onChangeDate:(date:Date|null)=>void}){
  const [draft,setDraft]=useState(formatItalianDate(value)); useEffect(()=>{setDraft(formatItalianDate(value));},[value]);
  function change(text:string){const digits=text.replace(/\D/g,'').slice(0,8);const formatted=digits.slice(0,2)+(digits.length>2?'/'+digits.slice(2,4):'')+(digits.length>4?'/'+digits.slice(4):'');setDraft(formatted);const d=new Date(Number(digits.slice(4)),Number(digits.slice(2,4))-1,Number(digits.slice(0,2)),12);onChangeDate(digits.length===8&&d.getFullYear()===Number(digits.slice(4))&&d.getMonth()===Number(digits.slice(2,4))-1&&d.getDate()===Number(digits.slice(0,2))&&d<=new Date()?d:null);}
  if(Platform.OS==='web')return <View style={styles.formField}><RequiredLabel label={label} required={required}/><input aria-label={label} type="date" min="1900-01-01" max={toIsoDate(new Date())} value={value?toIsoDate(value):''} onChange={e=>onChangeDate(e.target.value?new Date(e.target.value+'T00:00:00'):null)} style={{padding:14,fontSize:16,borderRadius:14,border:'1px solid #C5D9EF',background:'#E9F0F8',color:'#15345F'}}/></View>;
  return <View style={styles.formField}><RequiredLabel label={label} required={required}/><View style={styles.inputShell}><TextInput value={draft} onChangeText={change} keyboardType="number-pad" placeholder="gg/mm/aaaa" placeholderTextColor={COLORS.muted} style={styles.input} maxLength={10}/><Pressable onPress={onPress}><Ionicons name="calendar-outline" size={24} color={COLORS.blue}/></Pressable></View></View>;
}
function RoleButton({label,selected,onPress}:{label:string;selected:boolean;onPress:()=>void}){return <Pressable onPress={onPress} style={[styles.roleButton,selected&&styles.selected]}><Ionicons name="person-outline" size={24} color={selected?COLORS.blue:COLORS.muted}/><Text style={[styles.roleText,selected&&{color:COLORS.blue}]}>{label}</Text></Pressable>;}
function SelectorButton({label,selected,onPress}:{label:string;selected:boolean;onPress:()=>void}){return <Pressable onPress={onPress} style={[styles.selectorButton,selected&&styles.selected]}><Text style={[styles.selectorText,selected&&{color:COLORS.blue}]}>{label}</Text></Pressable>;}

const styles=StyleSheet.create({
  safeArea:{flex:1,backgroundColor:'#D9ECFA'},screen:{flex:1,backgroundColor:'#D9ECFA'},scrollContent:{flexGrow:1,backgroundColor:'#D9ECFA',paddingTop:6},hero:{width:'100%',backgroundColor:'#D9ECFA'},
  card:{width:'100%',maxWidth:900,alignSelf:'center',marginTop:-22,paddingTop:28,paddingHorizontal:20,paddingBottom:36,borderTopLeftRadius:30,borderTopRightRadius:30,backgroundColor:'#fff',shadowColor:COLORS.shadow,shadowOpacity:.16,shadowRadius:18,shadowOffset:{width:0,height:-4},elevation:8,gap:15},
  title:{color:COLORS.text,fontSize:31,lineHeight:36,fontWeight:'900'},subtitle:{marginTop:-7,color:COLORS.muted,fontSize:16,lineHeight:22},progressTrack:{width:146,height:7,borderRadius:99,overflow:'hidden',flexDirection:'row',alignSelf:'center'},progressSegment:{flex:1},progressBlue:{backgroundColor:COLORS.blue},progressOrange:{backgroundColor:COLORS.orange},
  fieldRow:{flexDirection:'row',gap:12},fieldRowStack:{flexDirection:'column'},formField:{flex:1,gap:7,minWidth:0},label:{color:COLORS.text,fontSize:14,fontWeight:'800'},required:{color:'#EF2B2D'},inputShell:{minHeight:58,borderRadius:15,borderWidth:1,borderColor:COLORS.border,backgroundColor:COLORS.input,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:10},input:{flex:1,minWidth:0,color:COLORS.text,fontSize:15,fontWeight:'500',paddingVertical:Platform.OS==='ios'?16:12},
  hint:{color:COLORS.muted,fontSize:13,lineHeight:18},roleRow:{flexDirection:'row',gap:12},roleButton:{flex:1,minHeight:58,borderRadius:15,borderWidth:1,borderColor:COLORS.border,backgroundColor:'#FAFCFE',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9},roleText:{color:COLORS.muted,fontSize:16,fontWeight:'800'},selected:{borderColor:COLORS.blue,borderWidth:2,backgroundColor:'#F1F7FD'},
  notice:{flexDirection:'row',alignItems:'center',gap:10,padding:14,borderRadius:15,backgroundColor:'#F1F7FD',borderWidth:1,borderColor:COLORS.border},noticeText:{flex:1,color:COLORS.text,fontSize:13,lineHeight:19},childrenRow:{minHeight:64,borderRadius:15,backgroundColor:COLORS.input,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:10},childrenText:{flex:1,color:COLORS.muted,fontSize:15},plusBadge:{width:44,height:44,borderRadius:22,backgroundColor:COLORS.blue,alignItems:'center',justifyContent:'center'},chips:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{borderRadius:99,paddingLeft:12,paddingRight:8,paddingVertical:7,backgroundColor:'#EAF3FC',flexDirection:'row',alignItems:'center',gap:7},chipText:{color:COLORS.text,fontSize:13,fontWeight:'700'},
  selectorRow:{flexDirection:'row',gap:8},selectorButton:{flex:1,minHeight:54,borderRadius:14,borderWidth:1,borderColor:COLORS.border,alignItems:'center',justifyContent:'center',paddingHorizontal:8},selectorText:{color:COLORS.muted,fontSize:13,fontWeight:'800',textAlign:'center'},
  legalBox:{gap:10,padding:14,borderWidth:1,borderColor:COLORS.border,borderRadius:15,backgroundColor:'#F8FBFE'},legalRow:{flexDirection:'row',alignItems:'flex-start',gap:10},legalText:{flex:1,color:COLORS.text,fontSize:13,lineHeight:19},legalLink:{color:COLORS.blue,fontWeight:'900',textDecorationLine:'underline'},legalNotice:{marginTop:2,paddingTop:12,borderTopWidth:1,borderTopColor:COLORS.border,flexDirection:'row',alignItems:'flex-start',gap:8},legalNoticeText:{flex:1,color:COLORS.muted,fontSize:12,lineHeight:17},
  errorBox:{borderRadius:13,padding:12,backgroundColor:'#FEF2F2',flexDirection:'row',gap:8},errorText:{flex:1,color:COLORS.danger,fontSize:13,fontWeight:'600'},continueButton:{minHeight:58,borderRadius:15,backgroundColor:COLORS.blue,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8},continueText:{color:'#fff',fontSize:18,fontWeight:'900'},loginLink:{alignSelf:'center',paddingVertical:8},
  modalSafeArea:{flex:1,backgroundColor:'rgba(9,35,67,.42)'},modalOverlay:{flex:1,justifyContent:'center',padding:20,backgroundColor:'rgba(9,35,67,.42)'},modalCard:{width:'100%',maxWidth:520,alignSelf:'center',borderRadius:24,backgroundColor:'#fff',padding:20,gap:18},modalHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},modalTitle:{color:COLORS.text,fontSize:24,fontWeight:'900'},dateOverlay:{flex:1,justifyContent:'center',padding:20,backgroundColor:'rgba(9,35,67,.42)'},
});
