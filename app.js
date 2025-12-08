// === Stato e costanti ===
const STORAGE_KEY = "montevecchio66_app_v6_ui_tweaks";
const MS_HOUR = 60 * 60 * 1000;
const MS_90_MIN = 90 * 60 * 1000;

const DEFAULT_SHOPPING_ITEMS = [
  "Sale","Zucchero","Fazzoletti","Scottex","Carta igienica","Acqua","Sgrassatore","Spugnette piatti","Svelto",
  "Igienizzante bagno","Detersivo pavimenti","Pellicola alimenti","Carta stagnola","Carta forno",
  "Sacchetti organico","Sapone mani","Sacchi plastica","Mr Muscolo","Candeggina",
];

const CLEANING_ZONES = ["bagno_piccolo","bagno_grande","sala","cucina"];

let state = {
  user: { firstName:"", lastName:"", photoData:null },
  group: {
    name: "Corso Montevecchio 66",
    laundryReservations: [],
    showerBookings: [],
    shoppingChecklist: [],
    board: [],
    cleaningAssignments: { bagno_piccolo:null, bagno_grande:null, sala:null, cucina:null },
    cleaningHistory: { bagno_piccolo:[], bagno_grande:[], sala:[], cucina:[] },
    cleaningWeekKey: null,
  },
};

let cameraStream = null;
let currentViewElement = null;
let pendingShowerBooking = null;

// DateTime Picker runtime
const DTP = {
  openFor: null, // 'laundry' | 'shower'
  baseMonth: null, // Date pointing to 1st of month
  selectedDate: null, // Date (day precision)
  selectedTime: null, // "HH:MM"
};

// === Persistenza ===
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const pg = parsed.group || {};
      state = {
        ...state,
        ...parsed,
        user: { ...state.user, ...(parsed.user || {}) },
        group: {
          ...state.group,
          ...pg,
          laundryReservations: pg.laundryReservations || [],
          showerBookings: pg.showerBookings || [],
          shoppingChecklist: pg.shoppingChecklist || [],
          board: pg.board || [],
          cleaningAssignments: { bagno_piccolo:null, bagno_grande:null, sala:null, cucina:null, ...(pg.cleaningAssignments||{}) },
          cleaningHistory: { bagno_piccolo:[], bagno_grande:[], sala:[], cucina:[], ...(pg.cleaningHistory||{}) },
          cleaningWeekKey: pg.cleaningWeekKey || null,
        },
      };
    }
  } catch(e){ console.error("Errore caricando lo stato:", e); }

  if (!state.group.shoppingChecklist || state.group.shoppingChecklist.length === 0) {
    state.group.shoppingChecklist = DEFAULT_SHOPPING_ITEMS.map((label, idx) => ({ id:"pre-"+idx, label, checked:false }));
  }

  cleanupLaundryReservations();
  cleanupShowerBookings();
  resetCleaningWeekIfNeeded();
  saveState();
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

// === Utils immagini ===
function readImageFileAsBase64Thumbnail(file, maxSize = 256){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onerror = ()=>reject("Errore lettura file");
    reader.onload = ()=>{
      const img = new Image();
      img.onload = ()=>{
        const canvas = document.createElement("canvas");
        const scale = Math.min(maxSize/img.width, maxSize/img.height, 1);
        const w = Math.round(img.width*scale), h = Math.round(img.height*scale);
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img,0,0,w,h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        resolve(dataUrl.split(",")[1]);
      };
      img.onerror = ()=>reject("Errore caricamento immagine");
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function captureFrameFromVideo(video, maxSize=256){
  return new Promise((resolve,reject)=>{
    if(!video.videoWidth||!video.videoHeight) return reject("Video non pronto");
    const canvas = document.createElement("canvas");
    const scale = Math.min(maxSize/video.videoWidth, maxSize/video.videoHeight, 1);
    const w = Math.round(video.videoWidth*scale), h = Math.round(video.videoHeight*scale);
    canvas.width=w; canvas.height=h;
    const ctx=canvas.getContext("2d");
    ctx.drawImage(video,0,0,w,h);
    const dataUrl=canvas.toDataURL("image/jpeg",0.8);
    resolve(dataUrl.split(",")[1]);
  });
}

// === Utils vari ===
function getUserFullName(){
  const {firstName,lastName}=state.user;
  const full = `${firstName||""} ${lastName||""}`.trim();
  return full || "Utente anonimo";
}
function getAvatarRingColor(name){
  if(!name) return "rgba(0,122,255,0.35)";
  let hash=0; for(let i=0;i<name.length;i++){ hash=(hash*31+name.charCodeAt(i))|0; }
  const hue=Math.abs(hash)%360;
  return `hsla(${hue}, 70%, 60%, 0.55)`;
}
function formatDateTimeShort(iso){
  const d = new Date(iso); if(isNaN(d.getTime())) return "Data non valida";
  const day = d.toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"});
  const time = d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});
  return `${day} alle ${time}`;
}

// === Cleanup prenotazioni ===
function cleanupLaundryReservations(){
  const now = Date.now();
  state.group.laundryReservations = (state.group.laundryReservations||[]).filter(res=>{
    const startMs = new Date(res.startTime).getTime(); if(!startMs) return false;
    return now < startMs + 48*MS_HOUR;
  });
}
function cleanupShowerBookings(){
  const now = Date.now();
  state.group.showerBookings = (state.group.showerBookings||[]).filter(b=>{
    const startMs = new Date(b.startTime).getTime(); if(!startMs) return false;
    return now < startMs + MS_90_MIN;
  });
}
function intervalsOverlap(s1,e1,s2,e2){ return s1<e2 && s2<e1; }
function recomputeShowerConflicts(){
  const list = state.group.showerBookings||[];
  list.forEach(b=>b.hasConflict=false);
  for(let i=0;i<list.length;i++){
    const s1 = new Date(list[i].startTime).getTime(), e1=s1+MS_90_MIN;
    for(let j=i+1;j<list.length;j++){
      const s2 = new Date(list[j].startTime).getTime(), e2=s2+MS_90_MIN;
      if(intervalsOverlap(s1,e1,s2,e2)){ list[i].hasConflict=true; list[j].hasConflict=true; }
    }
  }
}

// === Settimana pulizie ===
function getCurrentWeekKey(){
  const now=new Date(); const day=now.getDay(); const diffToMonday=(day+6)%7;
  const monday=new Date(now); monday.setHours(0,0,0,0); monday.setDate(now.getDate()-diffToMonday);
  const year=monday.getFullYear(); const oneJan=new Date(year,0,1);
  const week=Math.ceil(((monday-oneJan)/86400000 + oneJan.getDay() + 1)/7);
  return `${year}-W${week}`;
}
function resetCleaningWeekIfNeeded(){
  const currentKey=getCurrentWeekKey();
  if(state.group.cleaningWeekKey && state.group.cleaningWeekKey!==currentKey){
    CLEANING_ZONES.forEach(zone=>{
      const ass=state.group.cleaningAssignments[zone];
      if(ass){
        if(!state.group.cleaningHistory[zone]) state.group.cleaningHistory[zone]=[];
        state.group.cleaningHistory[zone].unshift({ userName:ass.userName, photoData:ass.photoData, timestamp: ass.timestamp });
      }
      state.group.cleaningAssignments[zone]=null;
    });
  }
  state.group.cleaningWeekKey=currentKey;
}

// === Render generali ===
function renderHeader(){
  const groupNameEl=document.getElementById("groupName");
  const userNameEl=document.getElementById("currentUserName");
  const avatarEl=document.getElementById("currentUserAvatar");
  if(groupNameEl) groupNameEl.textContent = state.group.name || "Corso Montevecchio 66";
  if(userNameEl) userNameEl.textContent = getUserFullName();
  if(avatarEl){
    const color=getAvatarRingColor(getUserFullName());
    avatarEl.style.setProperty("--avatar-ring", color);
    if(state.user.photoData){ avatarEl.style.backgroundImage=`url(data:image/jpeg;base64,${state.user.photoData})`; avatarEl.textContent=""; }
    else { avatarEl.style.backgroundImage="none"; const initials=(state.user.firstName&&state.user.lastName)?(state.user.firstName[0]+state.user.lastName[0]).toUpperCase():"🙂"; avatarEl.textContent=initials; }
  }
}

function renderLoginAvatar(){
  const avatarEl=document.getElementById("loginAvatarPreview");
  if(!avatarEl) return;
  avatarEl.innerHTML="";
  const color=getAvatarRingColor(getUserFullName());
  avatarEl.style.setProperty("--avatar-ring", color);
  if(state.user.photoData){ avatarEl.style.backgroundImage=`url(data:image/jpeg;base64,${state.user.photoData})`; avatarEl.style.backgroundSize="cover"; avatarEl.style.backgroundPosition="center"; }
  else { avatarEl.style.backgroundImage="none"; const span=document.createElement("span"); span.textContent="🙂"; avatarEl.appendChild(span); }
}
function renderLoginForm(){
  const firstInput=document.getElementById("loginFirstName");
  const lastInput=document.getElementById("loginLastName");
  if(firstInput) firstInput.value=state.user.firstName||"";
  if(lastInput) lastInput.value=state.user.lastName||"";
  renderLoginAvatar();
}

function showScreen(name){
  const login=document.getElementById("loginScreen");
  const main=document.getElementById("mainScreen");
  if(name==="login"){ login.style.display="flex"; main.style.display="none"; }
  else { login.style.display="none"; main.style.display="flex"; }
}

function showMainSection(section){
  const map = {
    home: document.getElementById("homeSections"),
    laundry: document.getElementById("laundryScreen"),
    shower: document.getElementById("showerScreen"),
    cleaning: document.getElementById("cleaningScreen"),
    shopping: document.getElementById("shoppingScreen"),
    profile: document.getElementById("profileScreen"),
  };
  const newView = map[section]; if(!newView) return;

  if(currentViewElement && currentViewElement!==newView){
    currentViewElement.classList.remove("view-active");
    const oldRef=currentViewElement;
    oldRef.addEventListener("transitionend", (e)=>{ if(e.propertyName==="opacity"){ oldRef.style.display="none"; } }, {once:true});
  }

  newView.style.display = (section==="home"?"flex":"flex");
  requestAnimationFrame(()=> newView.classList.add("view-active"));
  currentViewElement = newView;

  if(section==="home"){ renderHomeBlackboard(); }
  else if(section==="laundry"){ renderLaundryScreen(); }
  else if(section==="shower"){ renderShowerScreen(); }
  else if(section==="cleaning"){ resetCleaningWeekIfNeeded(); renderCleaning(); }
  else if(section==="shopping"){ renderShopping(); }
  else if(section==="profile"){ renderProfileScreen(); }
}

// === Laundry ===
function renderLaundryScreen(){
  cleanupLaundryReservations(); saveState();
  const listEl=document.getElementById("laundryList");
  const msgEl=document.getElementById("laundryStatusMessage");
  if(!listEl) return; listEl.innerHTML="";
  const list=state.group.laundryReservations||[];
  if(list.length===0){
    const li=document.createElement("li"); li.textContent="Nessuna lavatrice prenotata."; applyEnterAnimation(li); listEl.appendChild(li);
  } else {
    list.slice().sort((a,b)=>new Date(a.startTime)-new Date(b.startTime)).forEach(res=>{
      const li=document.createElement("li");
      const row=document.createElement("div"); row.className="booking-row";
      const avatar=createUserSmallAvatar();
      const textBox=document.createElement("div"); textBox.className="booking-text";
      const start=new Date(res.startTime); const end=new Date(start.getTime()+48*MS_HOUR);
      const l1=document.createElement("div"); l1.textContent=res.userName;
      const l2=document.createElement("div"); l2.textContent=`${formatDateTimeShort(res.startTime)} → fino al ${formatDateTimeShort(end.toISOString())}`;
      const l3=document.createElement("div"); l3.textContent=res.rackLabel;
      textBox.append(l1,l2,l3); row.append(avatar,textBox); li.append(row); applyEnterAnimation(li); listEl.append(li);
    });
  }
  if(msgEl && list.length<2) msgEl.textContent="";
}

// === Shower ===
function renderShowerScreen(){
  cleanupShowerBookings(); recomputeShowerConflicts(); saveState();
  const container=document.getElementById("showerSlots"); if(!container) return; container.innerHTML="";
  const list=(state.group.showerBookings||[]).slice().sort((a,b)=>new Date(a.startTime)-new Date(b.startTime));
  for(let i=0;i<5;i++){
    const slotDiv=document.createElement("div"); slotDiv.className="slot-item";
    const booking=list[i];
    if(!booking){
      const title=document.createElement("div"); title.className="slot-title"; title.textContent=`Slot ${i+1}: Libero`; slotDiv.appendChild(title);
    } else {
      const header=document.createElement("div"); header.className="slot-header";
      const avatar=createUserSmallAvatar();
      const title=document.createElement("div"); title.className="slot-title"; title.textContent=`Slot ${i+1}: ${booking.userName}`;
      header.append(avatar,title);
      const meta=document.createElement("div"); meta.className="slot-meta"; meta.textContent=`Doccia il ${formatDateTimeShort(booking.startTime)} (90 min)`;
      slotDiv.append(header,meta);
      if(booking.hasConflict){ const warn=document.createElement("div"); warn.className="slot-warning"; warn.textContent="⚠️ Possibile boiler scarico (slot sovrapposto)"; slotDiv.appendChild(warn); }
    }
    applyEnterAnimation(slotDiv); container.appendChild(slotDiv);
  }
}

// === Blackboard ===
function renderHomeBlackboard(){
  const textEl=document.getElementById("homeBlackboardText");
  const authorEl=document.getElementById("homeBlackboardAuthor");
  if(!textEl||!authorEl) return;
  const msg=state.group.board && state.group.board[0];
  if(!msg){ textEl.textContent="Tocca per scrivere un pensiero di casa"; textEl.classList.add("blackboard-placeholder"); authorEl.textContent=""; }
  else { textEl.textContent=msg.text; textEl.classList.remove("blackboard-placeholder"); authorEl.textContent=""; }
}

// === Shopping ===
function renderShopping(){
  const listEl=document.getElementById("shoppingList"); if(!listEl) return; listEl.innerHTML="";
  const items=state.group.shoppingChecklist||[];
  items.forEach(item=>{
    const li=document.createElement("li");
    const label=document.createElement("label");
    label.style.display="flex"; label.style.alignItems="center"; label.style.gap="8px"; label.style.width="100%";
    const cb=document.createElement("input"); cb.type="checkbox"; cb.checked=!!item.checked;
    cb.addEventListener("change", ()=>{ item.checked=cb.checked; saveState(); /* anim gestita da CSS :checked */ });
    const span=document.createElement("span"); span.textContent=item.label;
    label.append(cb,span); li.append(label); applyEnterAnimation(li); listEl.append(li);
  });
}

// === Cleaning ===
function renderCleaning(){
  CLEANING_ZONES.forEach(zone=>{
    const ass=state.group.cleaningAssignments[zone];
    const assEl=document.getElementById("cleaning-assignee-"+zone); if(!assEl) return; assEl.innerHTML="";
    if(!ass){ assEl.textContent="Libero"; assEl.style.color="#777"; }
    else {
      assEl.style.color="#000";
      const avatar=createSmallAvatarFromData(ass.photoData, ass.userName); avatar.className="small-avatar";
      const nameSpan=document.createElement("span"); nameSpan.textContent=ass.userName;
      assEl.append(avatar,nameSpan);
    }
  });
  CLEANING_ZONES.forEach(zone=>{
    const container=document.getElementById("history-"+zone); if(!container) return; container.innerHTML="";
    const history=state.group.cleaningHistory[zone]||[];
    history.forEach(h=>{ const av=createSmallAvatarFromData(h.photoData, h.userName); applyEnterAnimation(av); container.appendChild(av); });
  });
}

// === Helpers avatar ===
function createUserSmallAvatar(){
  const div=document.createElement("div"); div.className="small-avatar";
  const name=getUserFullName(); const color=getAvatarRingColor(name);
  div.style.setProperty("--avatar-ring", color);
  if(state.user.photoData){ div.style.backgroundImage=`url(data:image/jpeg;base64,${state.user.photoData})`; div.textContent=""; }
  else { const initials=(state.user.firstName&&state.user.lastName)?(state.user.firstName[0]+state.user.lastName[0]).toUpperCase():"🙂"; div.textContent=initials; }
  return div;
}
function createSmallAvatarFromData(photoData,name){
  const div=document.createElement("div"); div.className="history-avatar";
  const color=getAvatarRingColor(name); div.style.setProperty("--avatar-ring", color);
  if(photoData){ div.style.backgroundImage=`url(data:image/jpeg;base64,${photoData})`; div.textContent=""; }
  else { const initials=(name&&name.trim().length>=1)?name.split(" ").filter(Boolean).map(p=>p[0]).join("").toUpperCase():"🙂"; div.textContent=initials; }
  return div;
}

// === Anim util ===
function applyEnterAnimation(el){ if(!el) return; el.classList.add("anim-enter"); el.addEventListener("animationend", ()=>el.classList.remove("anim-enter"), {once:true}); }

// === Login events ===
function setupLoginEvents(){
  const cameraPanel=document.getElementById("cameraPanel");
  const video=document.getElementById("cameraVideo");
  const openCameraBtn=document.getElementById("openCameraBtn");
  const closeCameraBtn=document.getElementById("closeCameraBtn");
  const takePhotoBtn=document.getElementById("takePhotoBtn");
  const fileInput=document.getElementById("photoFileInput");
  const registerBtn=document.getElementById("registerBtn");

  if(openCameraBtn&&cameraPanel&&video){
    openCameraBtn.addEventListener("click", async ()=>{
      if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){ alert("Fotocamera non supportata."); return; }
      try{ cameraStream=await navigator.mediaDevices.getUserMedia({video:true}); video.srcObject=cameraStream; cameraPanel.classList.remove("hidden"); }
      catch(e){ console.error(e); alert("Impossibile accedere alla fotocamera."); }
    });
  }
  if(closeCameraBtn&&cameraPanel){
    closeCameraBtn.addEventListener("click", ()=>{
      cameraPanel.classList.add("hidden");
      if(cameraStream){ cameraStream.getTracks().forEach(t=>t.stop()); cameraStream=null; }
    });
  }
  if(takePhotoBtn&&video&&cameraPanel){
    takePhotoBtn.addEventListener("click", async ()=>{
      try{ const base64=await captureFrameFromVideo(video); state.user.photoData=base64; saveState(); renderLoginAvatar(); cameraPanel.classList.add("hidden"); if(cameraStream){ cameraStream.getTracks().forEach(t=>t.stop()); cameraStream=null; } }
      catch(e){ console.error(e); alert("Errore nello scattare la foto."); }
    });
  }
  if(fileInput){
    fileInput.addEventListener("change", async ()=>{
      const file=fileInput.files&&fileInput.files[0]; if(!file) return;
      try{ const base64=await readImageFileAsBase64Thumbnail(file); state.user.photoData=base64; saveState(); renderLoginAvatar(); }
      catch(e){ console.error(e); alert("Errore nel caricare la foto."); }
    });
  }
  if(registerBtn){
    registerBtn.addEventListener("click", ()=>{
      const firstInput=document.getElementById("loginFirstName");
      const lastInput=document.getElementById("loginLastName");
      const firstName=(firstInput&&firstInput.value.trim())||"";
      const lastName=(lastInput&&lastInput.value.trim())||"";
      if(!firstName||!lastName){ alert("Inserisci sia nome che cognome."); return; }
      state.user.firstName=firstName; state.user.lastName=lastName; saveState();
      renderHeader(); runSplashThen("main");
    });
  }
}

// === Profile events ===
function renderProfileScreen(){
  const firstInput=document.getElementById("profileFirstName");
  const lastInput=document.getElementById("profileLastName");
  const avatarEl=document.getElementById("profileAvatarPreview");
  if(firstInput) firstInput.value=state.user.firstName||"";
  if(lastInput) lastInput.value=state.user.lastName||"";
  if(avatarEl){
    avatarEl.innerHTML="";
    const color=getAvatarRingColor(getUserFullName()); avatarEl.style.setProperty("--avatar-ring", color);
    if(state.user.photoData){ avatarEl.style.backgroundImage=`url(data:image/jpeg;base64,${state.user.photoData})`; avatarEl.style.backgroundSize="cover"; avatarEl.style.backgroundPosition="center"; }
    else { avatarEl.style.backgroundImage="none"; const span=document.createElement("span"); span.textContent="🙂"; avatarEl.appendChild(span); }
  }
}
function setupProfileEvents(){
  const cameraPanel=document.getElementById("profileCameraPanel");
  const video=document.getElementById("profileCameraVideo");
  const openCameraBtn=document.getElementById("profileOpenCameraBtn");
  const closeCameraBtn=document.getElementById("profileCloseCameraBtn");
  const takePhotoBtn=document.getElementById("profileTakePhotoBtn");
  const fileInput=document.getElementById("profilePhotoFileInput");
  const saveBtn=document.getElementById("profileSaveBtn");

  if(openCameraBtn&&cameraPanel&&video){
    openCameraBtn.addEventListener("click", async ()=>{
      if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){ alert("Fotocamera non supportata."); return; }
      try{ cameraStream=await navigator.mediaDevices.getUserMedia({video:true}); video.srcObject=cameraStream; cameraPanel.classList.remove("hidden"); }
      catch(e){ console.error(e); alert("Impossibile accedere alla fotocamera."); }
    });
  }
  if(closeCameraBtn&&cameraPanel){
    closeCameraBtn.addEventListener("click", ()=>{
      cameraPanel.classList.add("hidden");
      if(cameraStream){ cameraStream.getTracks().forEach(t=>t.stop()); cameraStream=null; }
    });
  }
  if(takePhotoBtn&&video&&cameraPanel){
    takePhotoBtn.addEventListener("click", async ()=>{
      try{
        const base64=await captureFrameFromVideo(video);
        state.user.photoData=base64; saveState();
        renderProfileScreen(); renderHeader(); renderLaundryScreen(); renderShowerScreen(); renderCleaning();
        cameraPanel.classList.add("hidden");
        if(cameraStream){ cameraStream.getTracks().forEach(t=>t.stop()); cameraStream=null; }
      } catch(e){ console.error(e); alert("Errore nello scattare la foto."); }
    });
  }
  if(fileInput){
    fileInput.addEventListener("change", async ()=>{
      const file=fileInput.files&&fileInput.files[0]; if(!file) return;
      try{
        const base64=await readImageFileAsBase64Thumbnail(file);
        state.user.photoData=base64; saveState();
        renderProfileScreen(); renderHeader(); renderLaundryScreen(); renderShowerScreen(); renderCleaning();
      } catch(e){ console.error(e); alert("Errore nel caricare la foto."); }
    });
  }
  if(saveBtn){
    saveBtn.addEventListener("click", ()=>{
      const firstInput=document.getElementById("profileFirstName");
      const lastInput=document.getElementById("profileLastName");
      const firstName=(firstInput && firstInput.value.trim())||"";
      const lastName=(lastInput && lastInput.value.trim())||"";
      if(!firstName||!lastName){ alert("Inserisci sia nome che cognome."); return; }
      state.user.firstName=firstName; state.user.lastName=lastName; saveState(); renderHeader(); alert("Profilo aggiornato!");
    });
  }
}

// === Main events ===
function setupMainEvents(){
  document.querySelectorAll(".section-tile").forEach(btn=>{
    btn.addEventListener("click", ()=>{ const section=btn.dataset.section; renderHeader(); showMainSection(section); });
  });
  document.querySelectorAll(".back-btn").forEach(btn=>{
    btn.addEventListener("click", ()=>{ renderHeader(); showMainSection("home"); });
  });

  // Avatar/nome → profilo
  [document.getElementById("currentUserName"), document.getElementById("currentUserAvatar")].forEach(el=>{
    if(el){ el.addEventListener("click", ()=>{ renderProfileScreen(); showMainSection("profile"); }); }
  });

  // LAVATRICE: dt picker trigger
  const laundryDateBtn=document.getElementById("laundryDateBtn");
  if(laundryDateBtn){ laundryDateBtn.addEventListener("click", ()=> openDateTimePicker("laundry")); }
  // DOCCIA: dt picker trigger
  const showerDateBtn=document.getElementById("showerDateBtn");
  if(showerDateBtn){ showerDateBtn.addEventListener("click", ()=> openDateTimePicker("shower")); }

  // LAVATRICE: prenota
  const laundryBtn=document.getElementById("laundryBookBtn");
  if(laundryBtn){
    laundryBtn.addEventListener("click", ()=>{
      const hidden=document.getElementById("laundryDateTimeValue");
      const msgEl=document.getElementById("laundryStatusMessage");
      const iso=hidden && hidden.value;
      if(!iso){ alert("Seleziona data e ora della lavatrice."); return; }
      const start=new Date(iso); if(isNaN(start.getTime())){ alert("Data/ora non valida."); return; }

      cleanupLaundryReservations();
      const list=state.group.laundryReservations||[];
      if(list.length>=2){
        const sorted=list.slice().sort((a,b)=>new Date(a.startTime)-new Date(b.startTime));
        const first=sorted[0]; const firstEndMs=new Date(first.startTime).getTime()+48*MS_HOUR;
        const diffMs=Math.max(0, firstEndMs - Date.now()); const hoursLeft=Math.ceil(diffMs/MS_HOUR);
        const text=`Al momento non ci sono stendini liberi. Il primo si libera tra circa ${hoursLeft} ore (prenotato da ${first.userName}).`;
        if(msgEl) msgEl.textContent=text; alert(text); return;
      }
      let rackLabel="Stendino 1"; if(list.length===1) rackLabel = list[0].rackLabel==="Stendino 1" ? "Stendino 2" : "Stendino 2";

      list.push({ id:Date.now(), userName:getUserFullName(), startTime:start.toISOString(), rackLabel });
      state.group.laundryReservations=list; saveState();
      if(msgEl) msgEl.textContent="";
      renderLaundryScreen();
      alert(`Lavatrice prenotata con ${rackLabel} il ${formatDateTimeShort(start.toISOString())}.`);
    });
  }

  // DOCCIA: prenota
  const showerBtn=document.getElementById("showerBookBtn");
  const conflictDialog=document.getElementById("showerConflictDialog");
  const changeSlotBtn=document.getElementById("showerChangeSlotBtn");
  const confirmSlotBtn=document.getElementById("showerConfirmSlotBtn");

  function addShowerBooking(startIso, forceConflict){
    cleanupShowerBookings();
    const list=state.group.showerBookings||[];
    list.push({ id:Date.now(), userName:getUserFullName(), startTime:startIso, hasConflict:!!forceConflict });
    state.group.showerBookings=list; recomputeShowerConflicts(); saveState(); renderShowerScreen();
  }

  if(showerBtn){
    showerBtn.addEventListener("click", ()=>{
      const hidden=document.getElementById("showerDateTimeValue");
      const iso=hidden && hidden.value;
      if(!iso){ alert("Seleziona data e ora della doccia."); return; }
      const start=new Date(iso); if(isNaN(start.getTime())){ alert("Data/ora non valida."); return; }

      cleanupShowerBookings();
      const list=state.group.showerBookings||[];
      let hasOverlap=false; const s=start.getTime(); const e=s+MS_90_MIN;
      for(const b of list){ const s2=new Date(b.startTime).getTime(), e2=s2+MS_90_MIN; if(intervalsOverlap(s,e,s2,e2)){ hasOverlap=true; break; } }

      if(!hasOverlap){ addShowerBooking(start.toISOString(), false); alert(`Doccia prenotata il ${formatDateTimeShort(start.toISOString())}.`); return; }
      pendingShowerBooking={ startTimeIso: start.toISOString() };
      if(conflictDialog) conflictDialog.classList.remove("hidden");
    });
  }
  if(changeSlotBtn&&conflictDialog){ changeSlotBtn.addEventListener("click", ()=>{ pendingShowerBooking=null; conflictDialog.classList.add("hidden"); }); }
  if(confirmSlotBtn&&conflictDialog){ confirmSlotBtn.addEventListener("click", ()=>{ if(pendingShowerBooking){ addShowerBooking(pendingShowerBooking.startTimeIso, true); alert(`Doccia prenotata comunque il ${formatDateTimeShort(pendingShowerBooking.startTimeIso)}. Ricorda il boiler!`);} pendingShowerBooking=null; conflictDialog.classList.add("hidden"); }); }

  // LISTA SPESA - aggiunta
  const shoppingAddForm=document.getElementById("shoppingAddForm");
  const shoppingAddInput=document.getElementById("shoppingAddInput");
  if(shoppingAddForm&&shoppingAddInput){
    shoppingAddForm.addEventListener("submit", (e)=>{
      e.preventDefault();
      const text=shoppingAddInput.value.trim(); if(!text) return;
      state.group.shoppingChecklist.push({ id:Date.now().toString(), label:text, checked:false });
      shoppingAddInput.value=""; saveState(); renderShopping();
    });
  }

  // PULIZIE toggle
  document.querySelectorAll(".cleaning-zone-row").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const zone=btn.dataset.zone; if(!zone) return; resetCleaningWeekIfNeeded();
      const ass=state.group.cleaningAssignments[zone]; const myName=getUserFullName(); const myPhoto=state.user.photoData;

      if(!ass){
        state.group.cleaningAssignments[zone]={ userName:myName, photoData:myPhoto, timestamp:new Date().toISOString() };
        saveState(); renderCleaning(); return;
      }
      if(ass.userName===myName){
        const okRemove=confirm("Vuoi rimuovere la tua prenotazione per questa zona?"); if(!okRemove) return;
        state.group.cleaningAssignments[zone]=null; saveState(); renderCleaning(); return;
      }
      const ok=confirm(`Questa zona è già assegnata a ${ass.userName}. Vuoi assegnarla a te?`);
      if(!ok) return;
      state.group.cleaningAssignments[zone]={ userName:myName, photoData:myPhoto, timestamp:new Date().toISOString() };
      saveState(); renderCleaning();
    });
  });

  // LAVAGNA
  const blackboardEl=document.getElementById("homeBlackboard");
  const blackboardDialog=document.getElementById("blackboardDialog");
  const blackboardInput=document.getElementById("blackboardInput");
  const blackboardCancelBtn=document.getElementById("blackboardCancelBtn");
  const blackboardSaveBtn=document.getElementById("blackboardSaveBtn");

  if(blackboardEl&&blackboardDialog&&blackboardInput){
    blackboardEl.addEventListener("click", ()=>{
      const msg=state.group.board && state.group.board[0]; blackboardInput.value= msg? msg.text : "";
      blackboardDialog.classList.remove("hidden");
    });
  }
  if(blackboardCancelBtn&&blackboardDialog){ blackboardCancelBtn.addEventListener("click", ()=> blackboardDialog.classList.add("hidden")); }
  if(blackboardSaveBtn&&blackboardDialog&&blackboardInput){
    blackboardSaveBtn.addEventListener("click", ()=>{
      const text=blackboardInput.value.trim(); if(!text){ alert("Scrivi qualcosa prima di salvare."); return; }
      const now=new Date();
      const msg={ text, author:getUserFullName(), date: now.toLocaleString("it-IT",{ day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit" }) };
      if(!state.group.board) state.group.board=[];
      state.group.board.unshift(msg); saveState(); blackboardDialog.classList.add("hidden"); renderHomeBlackboard();
    });
  }

  // DateTimePicker wiring
  wireDateTimePicker();
}

// === Splash ===
function runSplashThen(target){
  const splash=document.getElementById("splashScreen");
  const login=document.getElementById("loginScreen");
  const main=document.getElementById("mainScreen");
  if(!splash||!login||!main){ if(target==="login"){ showScreen("login"); } else { showScreen("main"); showMainSection("home"); } return; }

  login.style.display="none"; main.style.display="none";
  splash.style.display="flex"; void splash.offsetWidth; splash.classList.add("splash-visible");
  const VISIBLE_MS=2600;
  setTimeout(()=>{ splash.classList.add("splash-fade-out"); }, VISIBLE_MS);
  splash.addEventListener("transitionend", (e)=>{
    if(e.propertyName!=="opacity") return;
    splash.style.display="none"; splash.classList.remove("splash-visible","splash-fade-out");
    if(target==="login"){ showScreen("login"); }
    else { showScreen("main"); showMainSection("home"); }
  }, {once:true});
}

// === DateTime Picker ===
function openDateTimePicker(forTarget){
  const overlay=document.getElementById("dtpOverlay"); if(!overlay) return;
  const now=new Date();
  DTP.openFor=forTarget;
  DTP.baseMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  // default selezione: oggi + prossimo slot mezz'ora
  DTP.selectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const roundMinutes = m => (Math.ceil(m/30)*30)%60;
  const hh = now.getMinutes()>30 ? (now.getHours()+1) : now.getHours();
  const mm = roundMinutes(now.getMinutes());
  DTP.selectedTime = `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;

  renderDateTimePicker();
  overlay.classList.remove("hidden");
}
function closeDateTimePicker(){
  const overlay=document.getElementById("dtpOverlay"); if(overlay) overlay.classList.add("hidden");
  DTP.openFor=null;
}
function renderDateTimePicker(){
  const monthLabel=document.getElementById("dtpMonthLabel");
  const daysEl=document.getElementById("dtpDays");
  const timeList=document.getElementById("dtpTimeList");
  const prev=document.getElementById("dtpPrevMonth");
  const next=document.getElementById("dtpNextMonth");
  const confirm=document.getElementById("dtpConfirm");
  const cancel=document.getElementById("dtpCancel");
  if(!monthLabel||!daysEl||!timeList||!prev||!next||!confirm||!cancel) return;

  // Header month label
  const m=DTP.baseMonth.getMonth(); const y=DTP.baseMonth.getFullYear();
  const monthNames=["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
  monthLabel.textContent = `${monthNames[m]} ${y}`;

  // Days grid
  daysEl.innerHTML="";
  const firstDay = new Date(y,m,1);
  const startOffset = (firstDay.getDay()+6)%7; // 0=Lu
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const daysInPrev = new Date(y, m, 0).getDate();

  const totalCells = Math.ceil((startOffset + daysInMonth)/7)*7;
  for(let i=0;i<totalCells;i++){
    const cell = document.createElement("div"); cell.className="dtp-day";
    let dayNum, dateObj, muted=false;
    if(i<startOffset){ dayNum = daysInPrev - (startOffset - 1 - i); dateObj = new Date(y, m-1, dayNum); muted=true; }
    else if(i>=startOffset+daysInMonth){ dayNum = i - (startOffset+daysInMonth) + 1; dateObj = new Date(y, m+1, dayNum); muted=true; }
    else { dayNum = i - startOffset + 1; dateObj = new Date(y, m, dayNum); }

    cell.textContent = dayNum;
    if(muted) cell.classList.add("muted");
    if(DTP.selectedDate && sameDay(dateObj, DTP.selectedDate)) cell.classList.add("selected");

    cell.addEventListener("click", ()=>{ DTP.selectedDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()); renderDateTimePicker(); });
    daysEl.appendChild(cell);
  }

  // Times list (ogni 30 min 06:00 → 23:30)
  timeList.innerHTML="";
  const times=[]; for(let h=6; h<=23; h++){ times.push(`${String(h).padStart(2,"0")}:00`); times.push(`${String(h).padStart(2,"0")}:30`); }
  times.forEach(t=>{
    const btn=document.createElement("div"); btn.className="dtp-time"; btn.textContent=t;
    if(DTP.selectedTime===t) btn.classList.add("selected");
    btn.addEventListener("click", ()=>{ DTP.selectedTime=t; renderDateTimePicker(); });
    timeList.appendChild(btn);
  });

  prev.onclick=()=>{ DTP.baseMonth = new Date(y, m-1, 1); renderDateTimePicker(); };
  next.onclick=()=>{ DTP.baseMonth = new Date(y, m+1, 1); renderDateTimePicker(); };
  cancel.onclick=()=> closeDateTimePicker();
  confirm.onclick=()=> confirmDateTimePicker();
}
function sameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function confirmDateTimePicker(){
  if(!DTP.openFor || !DTP.selectedDate || !DTP.selectedTime) { closeDateTimePicker(); return; }
  const [hh,mm] = DTP.selectedTime.split(":").map(n=>parseInt(n,10));
  const d = new Date(DTP.selectedDate.getFullYear(), DTP.selectedDate.getMonth(), DTP.selectedDate.getDate(), hh, mm, 0, 0);
  const iso = d.toISOString();

  if(DTP.openFor==="laundry"){
    const hidden=document.getElementById("laundryDateTimeValue");
    const display=document.getElementById("laundryDateTimeDisplay");
    if(hidden) hidden.value=iso;
    if(display) display.textContent = formatDateTimeShort(iso);
  } else if(DTP.openFor==="shower"){
    const hidden=document.getElementById("showerDateTimeValue");
    const display=document.getElementById("showerDateTimeDisplay");
    if(hidden) hidden.value=iso;
    if(display) display.textContent = formatDateTimeShort(iso);
  }
  closeDateTimePicker();
}
function wireDateTimePicker(){
  const overlay=document.getElementById("dtpOverlay");
  if(!overlay) return;
  overlay.addEventListener("click", (e)=>{ if(e.target===overlay) closeDateTimePicker(); });
}

// === Init ===
loadState();
window.addEventListener("DOMContentLoaded", ()=>{
  setupLoginEvents();
  setupMainEvents();
  setupProfileEvents();

  const hasUser = state.user && typeof state.user.firstName==="string" && state.user.firstName.trim().length>0;
  runSplashThen(hasUser ? "main" : "login");
});
