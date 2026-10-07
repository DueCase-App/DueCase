const form=document.getElementById('form'),result=document.getElementById('result'),button=document.getElementById('submit');
fetch('/api/service-info').then(r=>r.json()).then(info=>{if(info.supportEmail)document.getElementById('support').textContent=`Per richieste sui dati condivisi: ${info.supportEmail}`;if(info.privacyUrl){const a=document.getElementById('privacy');a.href=info.privacyUrl;a.hidden=false;}}).catch(()=>{});
form.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;result.textContent='Verifica in corso…';try{
 const login=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value,password:document.getElementById('password').value})});
 const session=await login.json();if(!login.ok)throw Error(session.error||'Accesso non riuscito.');
 document.getElementById('password').value='';
 const deletion=await fetch('/api/auth/delete-account',{method:'DELETE',headers:{Authorization:`Bearer ${session.token}`}});const data=await deletion.json();if(!deletion.ok)throw Error(data.error||'Eliminazione non riuscita.');
 form.hidden=true;result.textContent='Account eliminato. Gli accessi sono stati revocati. Lo storico condiviso resta conservato come indicato sopra.';
 }catch(error){result.textContent=error.message||'Operazione non riuscita.';}finally{button.disabled=false;}});
