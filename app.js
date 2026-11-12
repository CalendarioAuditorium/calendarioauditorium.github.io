(async () => {
  const $ = selector => document.querySelector(selector);
  const profiles = {ced:'CED', school:'Scuola Mazzolari', town:'Comune di Verolanuova'};
  const ownerNames = {school:'Scuola Mazzolari', town:'Comune di Verolanuova'};
  const phoneNumbers = {school: '+39 030 931 101', town: '+39 030 936 5010'};
  const romeToday = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Rome', year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const dateFromKey = key => { const [y,m,d] = key.split('-').map(Number); return new Date(y,m-1,d,12); };
  const keyFromDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const addDays = (d,n) => { const result = new Date(d); result.setDate(result.getDate()+n); return result; };
  const monday = d => addDays(d,-((d.getDay()+6)%7));
  const format = (date,options) => new Intl.DateTimeFormat('it-IT',options).format(date);
  let current = dateFromKey(romeToday()), view = 'month', profile = 'ced', selectedId = null, editingId = null;
  let events = [];
  const visibleCalendars = new Set(['school', 'town']);
  async function api(path,options={}){const response=await fetch(`/api/${path}`,options);if(response.status===401){location.href='index.html';throw new Error('Sessione scaduta.');}let body;try{body=await response.json()}catch{throw new Error('Risposta del server non valida.')}if(!response.ok)throw new Error(body.error || 'Operazione non riuscita.');return body;}
  const request=(method,data)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const time=m=>m===1440?'00:00':`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
  const fromServer=e=>({...e,start:time(e.startMinute),end:time(e.endMinute)});
  const toServer=e=>({title:e.title,owner:e.owner,date:e.date,startMinute:minutes(e.start),endMinute:minutes(e.end,true),notes:e.notes});
  async function loadEvents(){events=(await api('events')).events.map(fromServer);render();}
  function minutes(time, end = false) { if (end && time === '00:00') return 1440; const [h,m] = time.split(':').map(Number); return h*60+m; }
  function eventButton(event, className) {
    const button = document.createElement('button'); button.type = 'button'; button.className = `${className} ${event.owner === 'town' ? 'town' : ''}`;
    const overlapping = events.some(other => other.id !== event.id && other.date === event.date && minutes(event.start) < minutes(other.end,true) && minutes(event.end,true) > minutes(other.start));
    if (overlapping) { button.classList.add('has-overlap'); button.title = 'Attenzione: evento sovrapposto a un altro appuntamento'; button.setAttribute('aria-label', `${event.title}, ${event.start}–${event.end}. Attenzione: evento sovrapposto a un altro appuntamento`); }
    const title = document.createElement('b'); title.textContent = event.title;
    if (className === 'event') { const time = document.createElement('small'); time.textContent = `${event.start} – ${event.end}`; button.append(title,time); button.style.top = `${minutes(event.start)*0.8}px`; button.style.height = `${Math.max((minutes(event.end,true)-minutes(event.start))*0.8,22)}px`; }
    else { const time = document.createElement('small'); time.textContent = `${event.start} – ${event.end}`; button.append(title,time); }
    button.addEventListener('click', e => {e.stopPropagation(); showDetails(event);}); return button;
  }
  function render() {
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('selected', b.dataset.view === view));
    const calendar = $('#calendar'); calendar.replaceChildren();
    const title = $('#periodTitle');
    if (view === 'month') {
      title.textContent = format(current,{month:'long',year:'numeric'});
      const grid = document.createElement('div'); grid.className='month-grid';
      ['LUN','MAR','MER','GIO','VEN','SAB','DOM'].forEach(day => {const h=document.createElement('div');h.className='month-weekday';h.textContent=day;grid.append(h);});
      const first = new Date(current.getFullYear(),current.getMonth(),1,12), start=monday(first);
      for (let i=0;i<42;i++) {const d=addDays(start,i), key=keyFromDate(d), cell=document.createElement('div');cell.className='month-day'+(d.getMonth()!==current.getMonth()?' outside':'');const number=document.createElement('strong');number.textContent=d.getDate();cell.append(number);events.filter(e=>e.date===key && visibleCalendars.has(e.owner)).sort((a,b)=>a.start.localeCompare(b.start)).forEach(e=>cell.append(eventButton(e,'month-event')));cell.addEventListener('click',()=>openEvent(key));grid.append(cell);}
      calendar.append(grid); return;
    }
    const start = view === 'week' ? monday(current) : current, count = view === 'week' ? 7 : 1;
    const end = addDays(start,count-1);
    title.textContent = view === 'day' ? format(start,{day:'numeric',month:'long',year:'numeric'}) : (start.getMonth()===end.getMonth() ? `${start.getDate()} – ${end.getDate()} ${format(end,{month:'long',year:'numeric'})}` : `${format(start,{day:'numeric',month:'short'})} – ${format(end,{day:'numeric',month:'short',year:'numeric'})}`);
    const grid=document.createElement('div');grid.className='week-grid';grid.style.setProperty('--days',count);
    const empty=document.createElement('div');empty.className='day-head';grid.append(empty);
    for(let i=0;i<count;i++){const d=addDays(start,i),head=document.createElement('div');head.className='day-head'+(keyFromDate(d)===romeToday()?' today':'');head.append(document.createTextNode(format(d,{weekday:'short'}).replace('.','').toUpperCase()));const n=document.createElement('b');n.textContent=d.getDate();head.append(n);grid.append(head);}
    const times=document.createElement('div');times.className='time-col';for(let h=0;h<24;h++){const label=document.createElement('span');label.className='time-label';label.style.top=`${h*48+1}px`;label.textContent=`${String(h).padStart(2,'0')}:00`;times.append(label);}grid.append(times);
    for(let i=0;i<count;i++){const d=addDays(start,i),key=keyFromDate(d),col=document.createElement('div');col.className='day-column';const dayEvents=events.filter(e=>e.date===key && visibleCalendars.has(e.owner)).sort((a,b)=>minutes(a.start)-minutes(b.start)); let group=[]; const drawGroup=()=>{const lanes=[];group.forEach(item=>{let lane=lanes.findIndex(end=>end<=minutes(item.start));if(lane<0)lane=lanes.length;lanes[lane]=minutes(item.end,true);item.lane=lane;});group.forEach(item=>{const button=eventButton(item,'event');button.style.left=`calc(${item.lane*100/lanes.length}% + 3px)`;button.style.width=`calc(${100/lanes.length}% - 6px)`;button.style.right='auto';col.append(button);});if(group.length>1){const marker=document.createElement('div');marker.className='overlap-strip';marker.setAttribute('aria-hidden','true');marker.style.top=`${Math.max(...group.map(item=>minutes(item.start)*0.8+Math.max((minutes(item.end,true)-minutes(item.start))*0.8,22)))-4}px`;col.append(marker);}};dayEvents.forEach(item=>{if(group.length && minutes(item.start)>=Math.max(...group.map(e=>minutes(e.end,true)))){drawGroup();group=[];}group.push({...item});});if(group.length)drawGroup();col.addEventListener('click',e=>{const hour=Math.min(23,Math.floor((e.clientY-col.getBoundingClientRect().top)/48));openEvent(key,hour);});grid.append(col);}
    calendar.append(grid);
  }
  function updateOverlapWarning() {
    const form=$('#eventForm'), warning=$('#overlapWarning');
    if (!form.elements.date.value || !form.elements.start.value || !form.elements.end.value) { warning.hidden=true; return; }
    const start=minutes(form.elements.start.value), end=minutes(form.elements.end.value,true);
    const overlaps=end>start ? events.filter(item=>item.id!==editingId && item.date===form.elements.date.value && start<minutes(item.end,true) && end>minutes(item.start)) : [];
    warning.hidden=overlaps.length===0;
    warning.textContent=overlaps.length ? `Attenzione: questo orario si sovrappone a ${overlaps.length===1?'un altro evento':`${overlaps.length} altri eventi`}: ${overlaps.map(item=>`${item.title} (${item.start}–${item.end})`).join(', ')}. Puoi comunque salvare.` : '';
  }
  ['date','start','end'].forEach(name=>$('#eventForm').elements[name].addEventListener('input',updateOverlapWarning));
  function openEvent(date=keyFromDate(current), hour) {
    const form=$('#eventForm');form.reset();editingId=null;$('#eventEyebrow').textContent='NUOVO APPUNTAMENTO';$('#eventHeading').textContent='Organizza un evento.';form.elements.date.value=date;
    const owner=profile==='ced' ? (hour!==undefined&&hour>=14?'town':'school') : profile;
    form.elements.owner.value=owner;form.elements.owner.disabled=profile!=='ced';
    const startHour=hour!==undefined?hour:(owner==='town'?14:9);form.elements.start.value=`${String(startHour).padStart(2,'0')}:00`;form.elements.end.value=startHour===23?'00:00':`${String(startHour+1).padStart(2,'0')}:00`;
    $('#formError').textContent='';updateOverlapWarning();$('#eventDialog').showModal();
  }
  function showDetails(event){selectedId=event.id;$('#detailsOwner').textContent=ownerNames[event.owner];$('#detailsTitle').textContent=event.title;$('#detailsTime').textContent=`${format(dateFromKey(event.date),{weekday:'long',day:'numeric',month:'long',year:'numeric'})} · ${event.start} – ${event.end}`;$('#detailsNotes').textContent=event.notes || 'Nessuna nota.';$('#deleteEvent').hidden=event.owner!==profile;$('#editEvent').hidden=event.owner!==profile;
    const conflicts=events.filter(other=>other.id!==event.id && other.owner!==event.owner && other.date===event.date && minutes(event.start)<minutes(other.end,true) && minutes(event.end,true)>minutes(other.start));
    const contactArea=$('#conflictContact'), buttons=$('#contactButtons');buttons.replaceChildren();contactArea.hidden=conflicts.length===0;
    if(conflicts.length){const targets=profile==='ced'?['school','town']:[profile==='school'?'town':'school'];targets.forEach(owner=>{const button=document.createElement('button');button.type='button';button.className='secondary-button';button.textContent=`Chiama ${ownerNames[owner]}`;button.addEventListener('click',()=>showContact(owner));buttons.append(button);});}
    $('#detailsDialog').showModal();}
  function showContact(owner){const phone=phoneNumbers[owner],link=$('#contactCall');$('#contactTitle').textContent=ownerNames[owner];$('#contactNumber').textContent=phone ? `Numero: ${phone}` : 'Numero di telefono non ancora configurato.';link.hidden=!phone;if(phone)link.href=`tel:${phone.replace(/[^+\d]/g,'')}`;else link.removeAttribute('href');$('#contactDialog').showModal();}
  $('#editEvent').addEventListener('click',()=>{const event=events.find(item=>item.id===selectedId);if(!event)return;$('#detailsDialog').close();openEvent(event.date);editingId=event.id;const form=$('#eventForm');form.elements.title.value=event.title;form.elements.owner.value=event.owner;form.elements.date.value=event.date;form.elements.start.value=event.start;form.elements.end.value=event.end;form.elements.notes.value=event.notes;$('#eventEyebrow').textContent='MODIFICA APPUNTAMENTO';$('#eventHeading').textContent='Modifica evento.';updateOverlapWarning();});
  async function saveEvent(){const f=$('#eventForm');if(!f.reportValidity())return;const owner=f.elements.owner.value,start=minutes(f.elements.start.value),end=minutes(f.elements.end.value,true),error=$('#formError');if(!f.elements.title.value.trim()){error.textContent='Inserisci un titolo.';return;}if(end<=start){error.textContent='La fine deve essere successiva all’inizio, entro mezzanotte.';return;}const item={title:f.elements.title.value.trim(),owner,date:f.elements.date.value,start:f.elements.start.value,end:f.elements.end.value,notes:f.elements.notes.value.trim()};const button=$('#saveEvent');button.disabled=true;try{await api(editingId?`events?id=${encodeURIComponent(editingId)}`:'events',request(editingId?'PUT':'POST',toServer(item)));current=dateFromKey(item.date);$('#eventDialog').close();await loadEvents();}catch(e){error.textContent=e.message;}finally{button.disabled=false;}}
  $('#saveEvent').addEventListener('click',saveEvent);$('#eventForm').addEventListener('submit',e=>{e.preventDefault();saveEvent()});
  $('#deleteEvent').addEventListener('click',async()=>{const button=$('#deleteEvent');button.disabled=true;try{await api(`events?id=${encodeURIComponent(selectedId)}`,{method:'DELETE'});$('#detailsDialog').close();await loadEvents();}catch(e){alert(e.message)}finally{button.disabled=false}});
  document.querySelectorAll('[data-calendar]').forEach(button=>button.addEventListener('click',()=>{const owner=button.dataset.calendar;if(visibleCalendars.has(owner)) visibleCalendars.delete(owner);else visibleCalendars.add(owner);button.setAttribute('aria-pressed',String(visibleCalendars.has(owner)));render();}));
  $('#newEvent').addEventListener('click',()=>openEvent());$('#profileButton').addEventListener('click',()=>$('#profileDialog').showModal());
  document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>document.getElementById(button.dataset.close).close()));
  function setProfile(value){profile=value;document.body.dataset.profile=profile;$('#profileName').textContent=profiles[profile];$('#accountName').textContent=profiles[profile];$('#avatar').textContent=profile==='school'?'S':'C';$('#avatar').className='avatar '+(profile==='school'?'school-avatar':profile==='town'?'town-avatar':'');}
  let user;try{user=(await api('session')).user;if(user.mustChangePassword){location.href='index.html';return;}setProfile(user.role);$('#adminButton').hidden=user.role!=='ced';await loadEvents();}catch(e){if(e.message!=='Sessione scaduta.')alert(e.message || 'Impossibile caricare il calendario.');return;}
  $('#logoutButton').addEventListener('click',async()=>{try{await api('logout',request('POST',{}));location.replace('index.html');}catch(e){alert(e.message)}});
  async function loadAccounts(){const list=$('#accountList');list.textContent='Caricamento…';const data=await api('users');list.replaceChildren();data.users.forEach(account=>{const row=document.createElement('p');row.textContent=`${account.displayName} · ${account.username} · ${profiles[account.role]}${account.disabled?' (disabilitato)':''}`;list.append(row);});}
  $('#adminButton').addEventListener('click',async()=>{$('#profileDialog').close();$('#adminDialog').showModal();try{await loadAccounts()}catch(e){$('#accountError').textContent=e.message}});
  $('#accountForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button');if(!form.reportValidity())return;button.disabled=true;$('#accountError').textContent='';try{await api('users',request('POST',Object.fromEntries(new FormData(form))));form.reset();await loadAccounts();$('#accountError').textContent='Account creato.';}catch(error){$('#accountError').textContent=error.message}finally{button.disabled=false}});
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{view=button.dataset.view;render();}));
  $('#today').addEventListener('click',()=>{current=dateFromKey(romeToday());render();});
  function move(direction){if(view==='month'){current=new Date(current.getFullYear(),current.getMonth()+direction,1,12);}else current=addDays(current,direction*(view==='week'?7:1));render();}
  function positionDayHeaders(){const scroll=$('.calendar-scroll'), header=$('.calendar-header');scroll.style.setProperty('--header-offset', `${Math.max(0, header.getBoundingClientRect().bottom-scroll.getBoundingClientRect().top)}px`);}
  window.addEventListener('scroll',positionDayHeaders,{passive:true});window.addEventListener('resize',positionDayHeaders);
  $('#prev').addEventListener('click',()=>move(-1));$('#next').addEventListener('click',()=>move(1));render();positionDayHeaders();
  if(view==='week') $('#calendar').parentElement.scrollTop=8*48;
})();
