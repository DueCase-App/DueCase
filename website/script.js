document.querySelectorAll('img[src*="raw.githubusercontent.com"][src*="duecase-logo-hd.png"]').forEach(img=>{
  img.src='/duecase-logo.svg';
});

const menuButton=document.querySelector('.menu-toggle');
const nav=document.querySelector('.nav');
if(menuButton&&nav){
  menuButton.addEventListener('click',()=>{
    const open=nav.classList.toggle('open');
    menuButton.setAttribute('aria-expanded',String(open));
  });
  nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{
    nav.classList.remove('open');
    menuButton.setAttribute('aria-expanded','false');
  }));
}

const calendarChip=document.querySelector('.floating-chip.chip-one');
if(calendarChip){
  calendarChip.style.left='-18%';
  calendarChip.style.top='11%';
}

const cookie=document.querySelector('.cookie-note');
if(cookie){
  if(sessionStorage.getItem('duecase-cookie-note')==='hidden')cookie.remove();
  else cookie.querySelector('button')?.addEventListener('click',()=>{
    sessionStorage.setItem('duecase-cookie-note','hidden');
    cookie.remove();
  });
}

const footerLinks=document.querySelector('.footer-links');
if(footerLinks){
  [
    ['/cancellazione-account.html','Cancellazione account'],
    ['/note-legali.html','Note legali'],
  ].forEach(([href,label])=>{
    if(!footerLinks.querySelector(`a[href="${href}"]`)){
      const link=document.createElement('a');
      link.href=href;
      link.textContent=label;
      footerLinks.appendChild(link);
    }
  });
}
