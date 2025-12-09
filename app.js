// Stato globale salvato in localStorage (solo su questo dispositivo)
const STORAGE_KEY = "montevecchio66_app_v7_pastel";
const MS_HOUR = 60 * 60 * 1000;
const MS_90_MIN = 90 * 60 * 1000;

// Elementi predefiniti della lista spesa
const DEFAULT_SHOPPING_ITEMS = [
  "Sale",
  "Zucchero",
  "Fazzoletti",
  "Scottex",
  "Carta igienica",
  "Acqua",
  "Sgrassatore",
  "Spugnette piatti",
  "Svelto",
  "Igienizzante bagno",
  "Detersivo pavimenti",
  "Pellicola alimenti",
  "Carta stagnola",
  "Carta forno",
  "Sacchetti organico",
  "Sapone mani",
  "Sacchi plastica",
  "Mr Muscolo",
  "Candeggina",
];

const CLEANING_ZONES = ["bagno_piccolo", "bagno_grande", "sala", "cucina"];

let state = {
  user: {
    firstName: "",
    lastName: "",
    photoData: null, // base64 della foto utente
  },
  group: {
    name: "Corso Montevecchio 66",
    laundryReservations: [], // max 2
    showerBookings: [], // lista docce
    shopping: [],
    shoppingChecklist: [],
    board: [],
    cleaningAssignments: {
      bagno_piccolo: null,
      bagno_grande: null,
      sala: null,
      cucina: null,
    },
    cleaningHistory: {
      bagno_piccolo: [],
      bagno_grande: [],
      sala: [],
      cucina: [],
    },
    cleaningWeekKey: null,
  },
};

let cameraStream = null;
let currentViewElement = null;
let pendingShowerBooking = null;

// DateTime Picker stato
let dtpContext = null; // "laundry" | "shower"
let dtpSelectedDay = null; // {date: Date}
let dtpSelectedTime = null; // {hour, minute}
let selectedLaundryDateTime = null; // Date
let selectedShowerDateTime = null; // Date

// ---------- Persistenza ----------
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
          shopping: pg.shopping || [],
          shoppingChecklist: pg.shoppingChecklist || [],
          board: pg.board || [],
          cleaningAssignments: {
            bagno_piccolo: null,
            bagno_grande: null,
            sala: null,
            cucina: null,
            ...(pg.cleaningAssignments || {}),
          },
          cleaningHistory: {
            bagno_piccolo: [],
            bagno_grande: [],
            sala: [],
            cucina: [],
            ...(pg.cleaningHistory || {}),
          },
          cleaningWeekKey: pg.cleaningWeekKey || null,
        },
      };
    }
  } catch (e) {
    console.error("Errore caricando lo stato:", e);
  }

  // Inizializza la checklist se vuota
  if (!state.group.shoppingChecklist || state.group.shoppingChecklist.length === 0) {
    state.group.shoppingChecklist = DEFAULT_SHOPPING_ITEMS.map((label, idx) => ({
      id: "pre-" + idx,
      label,
      checked: false,
    }));
  }

  cleanupLaundryReservations();
  cleanupShowerBookings();
  resetCleaningWeekIfNeeded();
  saveState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------- Utility immagini ----------
function readImageFileAsBase64Thumbnail(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject("Errore lettura file");
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        const base64 = dataUrl.split(",")[1];
        resolve(base64);
      };
      img.onerror = () => reject("Errore caricamento immagine");
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function captureFrameFromVideo(video, maxSize = 256) {
  return new Promise((resolve, reject) => {
    if (!video.videoWidth || !video.videoHeight) {
      return reject("Video non pronto");
    }
    const canvas = document.createElement("canvas");
    const scale = Math.min(maxSize / video.videoWidth, maxSize / video.videoHeight, 1);
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    const base64 = dataUrl.split(",")[1];
    resolve(base64);
  });
}

// ---------- Utility vari ----------

function getUserFullName() {
  const { firstName, lastName } = state.user;
  const full = `${firstName || ""} ${lastName || ""}`.trim();
  return full || "Utente anonimo";
}

// Colore dell'anello avatar in base al nome (deterministico)
function getAvatarRingColor(name) {
  if (!name) return "rgba(0,122,255,0.35)";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsla(${hue}, 70%, 60%, 0.55)`;
}

function showScreen(name) {
  const login = document.getElementById("loginScreen");
  const main = document.getElementById("mainScreen");
  if (!login || !main) return;

  if (name === "login") {
    login.style.display = "flex";
    main.style.display = "none";
    applyEnterAnimation(login);
  } else {
    login.style.display = "none";
    main.style.display = "flex";
    applyEnterAnimation(main);
  }
}

// Transizione tra sezioni principali (home, laundry, shower, cleaning, shopping, profile)
function showMainSection(section) {
  const homeEl = document.getElementById("homeSections");
  const laundryEl = document.getElementById("laundryScreen");
  const showerEl = document.getElementById("showerScreen");
  const cleaningEl = document.getElementById("cleaningScreen");
  const shoppingEl = document.getElementById("shoppingScreen");
  const profileEl = document.getElementById("profileScreen");

  const map = {
    home: homeEl,
    laundry: laundryEl,
    shower: showerEl,
    cleaning: cleaningEl,
    shopping: shoppingEl,
    profile: profileEl,
  };

  const newView = map[section];
  if (!newView) return;

  const allViews = [homeEl, laundryEl, showerEl, cleaningEl, shoppingEl, profileEl];
  allViews.forEach((v) => {
    if (!v) return;
    v.style.display = v === newView ? "flex" : "none";
  });

  currentViewElement = newView;
  applyEnterAnimation(newView);

  if (section === "home") {
    renderHomeBlackboard();
  } else if (section === "laundry") {
    renderLaundryScreen();
  } else if (section === "shower") {
    renderShowerScreen();
  } else if (section === "cleaning") {
    resetCleaningWeekIfNeeded();
    renderCleaning();
  } else if (section === "shopping") {
    renderShopping();
  } else if (section === "profile") {
    renderProfileScreen();
  }
}

function formatDateTimeShortFromDate(date) {
  if (!date || isNaN(date.getTime())) return "Data non valida";
  const day = date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
  });
  const time = date.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} alle ${time}`;
}

function formatDateTimeShort(iso) {
  const d = new Date(iso);
  return formatDateTimeShortFromDate(d);
}

// Aggiunge una piccola animazione di ingresso (fade+slide) a elementi nuovi / viste
function applyEnterAnimation(el) {
  if (!el) return;
  el.classList.add("anim-enter");
  el.addEventListener(
    "animationend",
    () => {
      el.classList.remove("anim-enter");
    },
    { once: true }
  );
}

// Avatar piccolo per l'utente corrente
function createUserSmallAvatar() {
  const div = document.createElement("div");
  div.className = "small-avatar";
  const name = getUserFullName();
  const color = getAvatarRingColor(name);
  div.style.setProperty("--avatar-ring", color);

  if (state.user.photoData) {
    div.style.backgroundImage = `url(data:image/jpeg;base64,${state.user.photoData})`;
    div.textContent = "";
  } else {
    const initials =
      state.user.firstName && state.user.lastName
        ? (state.user.firstName[0] + state.user.lastName[0]).toUpperCase()
        : "🙂";
    div.textContent = initials;
  }
  return div;
}

// Avatar generico da dati + nome (storico pulizie)
function createSmallAvatarFromData(photoData, name) {
  const div = document.createElement("div");
  div.className = "history-avatar";
  const color = getAvatarRingColor(name);
  div.style.setProperty("--avatar-ring", color);

  if (photoData) {
    div.style.backgroundImage = `url(data:image/jpeg;base64,${photoData})`;
    div.textContent = "";
  } else {
    const initials =
      name && name.trim().length >= 1
        ? name
            .split(" ")
            .filter(Boolean)
            .map((p) => p[0])
            .join("")
            .toUpperCase()
        : "🙂";
    div.textContent = initials;
  }
  return div;
}

// ---------- Pulizia automatica prenotazioni ----------
function cleanupLaundryReservations() {
  const now = Date.now();
  const list = state.group.laundryReservations || [];
  state.group.laundryReservations = list.filter((res) => {
    const startMs = new Date(res.startTime).getTime();
    if (!startMs) return false;
    return now < startMs + 48 * MS_HOUR;
  });
}

function cleanupShowerBookings() {
  const now = Date.now();
  const list = state.group.showerBookings || [];
  state.group.showerBookings = list.filter((b) => {
    const startMs = new Date(b.startTime).getTime();
    if (!startMs) return false;
    return now < startMs + MS_90_MIN;
  });
}

// Intervallo [s1,e1) e [s2,e2) si sovrappongono?
function intervalsOverlap(s1, e1, s2, e2) {
  return s1 < e2 && s2 < e1;
}

function recomputeShowerConflicts() {
  const list = state.group.showerBookings || [];
  list.forEach((b) => (b.hasConflict = false));
  for (let i = 0; i < list.length; i++) {
    const bi = list[i];
    const s1 = new Date(bi.startTime).getTime();
    const e1 = s1 + MS_90_MIN;
    for (let j = i + 1; j < list.length; j++) {
      const bj = list[j];
      const s2 = new Date(bj.startTime).getTime();
      const e2 = s2 + MS_90_MIN;
      if (intervalsOverlap(s1, e1, s2, e2)) {
        bi.hasConflict = true;
        bj.hasConflict = true;
      }
    }
  }
}

// ---------- Settimana per le pulizie ----------
function getCurrentWeekKey() {
  const now = new Date();
  const day = now.getDay(); // 0=dom, 1=lun
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - diffToMonday);

  const year = monday.getFullYear();
  const oneJan = new Date(year, 0, 1);
  const week = Math.ceil(((monday - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);

  return `${year}-W${week}`;
}

function resetCleaningWeekIfNeeded() {
  const currentKey = getCurrentWeekKey();
  if (state.group.cleaningWeekKey && state.group.cleaningWeekKey !== currentKey) {
    CLEANING_ZONES.forEach((zone) => {
      const ass = state.group.cleaningAssignments[zone];
      if (ass) {
        if (!state.group.cleaningHistory[zone]) state.group.cleaningHistory[zone] = [];
        state.group.cleaningHistory[zone].unshift({
          userName: ass.userName,
          photoData: ass.photoData,
          timestamp: ass.timestamp,
        });
      }
      state.group.cleaningAssignments[zone] = null;
    });
  }
  state.group.cleaningWeekKey = currentKey;
}

// ---------- Render: LOGIN ----------
function renderLoginAvatar() {
  const avatarEl = document.getElementById("loginAvatarPreview");
  if (!avatarEl) return;

  avatarEl.innerHTML = "";
  const color = getAvatarRingColor(getUserFullName());
  avatarEl.style.setProperty("--avatar-ring", color);

  if (state.user.photoData) {
    avatarEl.style.backgroundImage = `url(data:image/jpeg;base64,${state.user.photoData})`;
    avatarEl.style.backgroundSize = "cover";
    avatarEl.style.backgroundPosition = "center";
  } else {
    avatarEl.style.backgroundImage = "none";
    const span = document.createElement("span");
    span.textContent = "🙂";
    avatarEl.appendChild(span);
  }
}

function renderLoginForm() {
  const firstInput = document.getElementById("loginFirstName");
  const lastInput = document.getElementById("loginLastName");

  if (firstInput) firstInput.value = state.user.firstName || "";
  if (lastInput) lastInput.value = state.user.lastName || "";
  renderLoginAvatar();
}

// ---------- Render: PROFILO ----------
function renderProfileScreen() {
  const firstInput = document.getElementById("profileFirstName");
  const lastInput = document.getElementById("profileLastName");
  const avatarEl = document.getElementById("profileAvatarPreview");

  if (firstInput) firstInput.value = state.user.firstName || "";
  if (lastInput) lastInput.value = state.user.lastName || "";

  if (avatarEl) {
    avatarEl.innerHTML = "";
    const color = getAvatarRingColor(getUserFullName());
    avatarEl.style.setProperty("--avatar-ring", color);
    if (state.user.photoData) {
      avatarEl.style.backgroundImage = `url(data:image/jpeg;base64,${state.user.photoData})`;
      avatarEl.style.backgroundSize = "cover";
      avatarEl.style.backgroundPosition = "center";
    } else {
      avatarEl.style.backgroundImage = "none";
      const span = document.createElement("span");
      span.textContent = "🙂";
      avatarEl.appendChild(span);
    }
  }
}

// ---------- Render: TESTATA MAIN ----------
function renderHeader() {
  const groupNameEl = document.getElementById("groupName");
  const userNameEl = document.getElementById("currentUserName");
  const avatarEl = document.getElementById("currentUserAvatar");

  if (groupNameEl) groupNameEl.textContent = state.group.name || "Corso Montevecchio 66";
  if (userNameEl) userNameEl.textContent = getUserFullName();

  if (avatarEl) {
    const color = getAvatarRingColor(getUserFullName());
    avatarEl.style.setProperty("--avatar-ring", color);

    if (state.user.photoData) {
      avatarEl.style.backgroundImage = `url(data:image/jpeg;base64,${state.user.photoData})`;
      avatarEl.textContent = "";
    } else {
      avatarEl.style.backgroundImage = "none";
      const initials =
        state.user.firstName && state.user.lastName
          ? (state.user.firstName[0] + state.user.lastName[0]).toUpperCase()
          : "🙂";
      avatarEl.textContent = initials;
    }
  }
}

// ---------- Render: LAVATRICE ----------
function renderLaundryScreen() {
  cleanupLaundryReservations();
  saveState();

  const listEl = document.getElementById("laundryList");
  const msgEl = document.getElementById("laundryStatusMessage");
  const displayText = document.getElementById("laundryDateTimeText");
  if (!listEl) return;

  if (displayText) {
    if (selectedLaundryDateTime) {
      displayText.textContent = formatDateTimeShortFromDate(selectedLaundryDateTime);
    } else {
      displayText.textContent = "Scegli giorno e ora";
    }
  }

  listEl.innerHTML = "";
  const list = state.group.laundryReservations || [];

  if (list.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Nessuna lavatrice prenotata.";
    applyEnterAnimation(li);
    listEl.appendChild(li);
  } else {
    list
      .slice()
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
      .forEach((res) => {
        const li = document.createElement("li");

        const row = document.createElement("div");
        row.className = "booking-row";

        const avatar = createUserSmallAvatar();
        const textBox = document.createElement("div");
        textBox.className = "booking-text";

        const start = new Date(res.startTime);
        const end = new Date(start.getTime() + 48 * MS_HOUR);

        const line1 = document.createElement("div");
        line1.textContent = res.userName;

        const line2 = document.createElement("div");
        line2.textContent = `${formatDateTimeShort(
          res.startTime
        )} → fino al ${formatDateTimeShort(end.toISOString())}`;

        const line3 = document.createElement("div");
        line3.textContent = res.rackLabel;

        textBox.appendChild(line1);
        textBox.appendChild(line2);
        textBox.appendChild(line3);

        row.appendChild(avatar);
        row.appendChild(textBox);
        li.appendChild(row);
        applyEnterAnimation(li);
        listEl.appendChild(li);
      });
  }

  if (msgEl && list.length < 2) {
    msgEl.textContent = "";
  }
}

// ---------- Render: DOCCIA ----------
function renderShowerScreen() {
  cleanupShowerBookings();
  recomputeShowerConflicts();
  saveState();

  const container = document.getElementById("showerSlots");
  const displayText = document.getElementById("showerDateTimeText");
  if (!container) return;
  container.innerHTML = "";

  if (displayText) {
    if (selectedShowerDateTime) {
      displayText.textContent = formatDateTimeShortFromDate(selectedShowerDateTime);
    } else {
      displayText.textContent = "Scegli giorno e ora";
    }
  }

  const list = (state.group.showerBookings || [])
    .slice()
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  for (let i = 0; i < 5; i++) {
    const slotDiv = document.createElement("div");
    slotDiv.className = "slot-item";

    const booking = list[i];
    if (!booking) {
      const title = document.createElement("div");
      title.className = "slot-title";
      title.textContent = `Slot ${i + 1}: Libero`;
      slotDiv.appendChild(title);
    } else {
      const header = document.createElement("div");
      header.className = "slot-header";

      const avatar = createUserSmallAvatar();
      const title = document.createElement("div");
      title.className = "slot-title";
      title.textContent = `Slot ${i + 1}: ${booking.userName}`;

      header.appendChild(avatar);
      header.appendChild(title);

      const meta = document.createElement("div");
      meta.className = "slot-meta";
      meta.textContent = `Doccia il ${formatDateTimeShort(booking.startTime)} (90 min)`;

      slotDiv.appendChild(header);
      slotDiv.appendChild(meta);

      if (booking.hasConflict) {
        const warn = document.createElement("div");
        warn.className = "slot-warning";
        warn.innerHTML = "⚠️ Possibile boiler scarico (slot sovrapposto ad altre docce)";
        slotDiv.appendChild(warn);
      }
    }

    applyEnterAnimation(slotDiv);
    container.appendChild(slotDiv);
  }
}

// ---------- Render: LAVAGNA HOME ----------
function renderHomeBlackboard() {
  const textEl = document.getElementById("homeBlackboardText");
  const authorEl = document.getElementById("homeBlackboardAuthor");
  if (!textEl || !authorEl) return;

  const msg = state.group.board && state.group.board[0];

  if (!msg) {
    textEl.textContent = "Tocca per scrivere un pensiero di casa";
    textEl.classList.add("blackboard-placeholder");
    authorEl.textContent = "";
  } else {
    textEl.textContent = msg.text;
    textEl.classList.remove("blackboard-placeholder");
    authorEl.textContent = "";
  }
}

// ---------- Render: LISTA SPESA ----------
function renderShopping() {
  const listEl = document.getElementById("shoppingList");
  if (!listEl) return;
  listEl.innerHTML = "";

  const items = state.group.shoppingChecklist || [];
  items.forEach((item) => {
    const li = document.createElement("li");

    const label = document.createElement("label");
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.gap = "8px";
    label.style.width = "100%";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!item.checked;
    cb.addEventListener("change", () => {
      item.checked = cb.checked;
      saveState();
      cb.classList.add("check-anim");
      setTimeout(() => cb.classList.remove("check-anim"), 140);
    });

    const span = document.createElement("span");
    span.textContent = item.label;

    label.appendChild(cb);
    label.appendChild(span);
    li.appendChild(label);
    applyEnterAnimation(li);
    listEl.appendChild(li);
  });
}

// ---------- Render: PULIZIE ----------
function renderCleaning() {
  CLEANING_ZONES.forEach((zone) => {
    const ass = state.group.cleaningAssignments[zone];
    const assEl = document.getElementById("cleaning-assignee-" + zone);
    if (!assEl) return;

    assEl.innerHTML = "";

    if (!ass) {
      assEl.textContent = "Libero";
      assEl.style.color = "#777";
    } else {
      assEl.style.color = "#000";
      const avatar = createSmallAvatarFromData(ass.photoData, ass.userName);
      avatar.className = "small-avatar";
      const nameSpan = document.createElement("span");
      nameSpan.textContent = ass.userName;
      assEl.appendChild(avatar);
      assEl.appendChild(nameSpan);
    }
  });

  CLEANING_ZONES.forEach((zone) => {
    const container = document.getElementById("history-" + zone);
    if (!container) return;
    container.innerHTML = "";
    const history = state.group.cleaningHistory[zone] || [];
    history.forEach((h) => {
      const avatar = createSmallAvatarFromData(h.photoData, h.userName);
      applyEnterAnimation(avatar);
      container.appendChild(avatar);
    });
  });
}

// ---------- Eventi: LOGIN ----------
function setupLoginEvents() {
  const cameraPanel = document.getElementById("cameraPanel");
  const video = document.getElementById("cameraVideo");
  const openCameraBtn = document.getElementById("openCameraBtn");
  const closeCameraBtn = document.getElementById("closeCameraBtn");
  const takePhotoBtn = document.getElementById("takePhotoBtn");
  const fileInput = document.getElementById("photoFileInput");
  const registerBtn = document.getElementById("registerBtn");

  if (openCameraBtn && cameraPanel && video) {
    openCameraBtn.addEventListener("click", async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("La fotocamera non è supportata da questo browser. Usa la galleria.");
        return;
      }
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = cameraStream;
        cameraPanel.classList.remove("hidden");
      } catch (e) {
        console.error(e);
        alert("Impossibile accedere alla fotocamera. Controlla i permessi.");
      }
    });
  }

  if (closeCameraBtn && cameraPanel) {
    closeCameraBtn.addEventListener("click", () => {
      cameraPanel.classList.add("hidden");
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
        cameraStream = null;
      }
    });
  }

  if (takePhotoBtn && video && cameraPanel) {
    takePhotoBtn.addEventListener("click", async () => {
      try {
        const base64 = await captureFrameFromVideo(video);
        state.user.photoData = base64;
        saveState();
        renderLoginAvatar();
        cameraPanel.classList.add("hidden");
        if (cameraStream) {
          cameraStream.getTracks().forEach((t) => t.stop());
          cameraStream = null;
        }
      } catch (e) {
        console.error(e);
        alert("Errore nello scattare la foto. Riprova.");
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        const base64 = await readImageFileAsBase64Thumbnail(file);
        state.user.photoData = base64;
        saveState();
        renderLoginAvatar();
      } catch (e) {
        console.error(e);
        alert("Errore nel caricare la foto dalla galleria.");
      }
    });
  }

  if (registerBtn) {
    registerBtn.addEventListener("click", () => {
      const firstInput = document.getElementById("loginFirstName");
      const lastInput = document.getElementById("loginLastName");
      const firstName = (firstInput && firstInput.value.trim()) || "";
      const lastName = (lastInput && lastInput.value.trim()) || "";

      if (!firstName || !lastName) {
        alert("Inserisci sia nome che cognome.");
        return;
      }

      state.user.firstName = firstName;
      state.user.lastName = lastName;
      saveState();

      renderHeader();
      // Splash post-login con messaggio "Benvenuto a casa, Nome"
      runSplashThen("main", { variant: "postLogin" });
    });
  }
}

// ---------- Eventi: PROFILO ----------
function setupProfileEvents() {
  const cameraPanel = document.getElementById("profileCameraPanel");
  const video = document.getElementById("profileCameraVideo");
  const openCameraBtn = document.getElementById("profileOpenCameraBtn");
  const closeCameraBtn = document.getElementById("profileCloseCameraBtn");
  const takePhotoBtn = document.getElementById("profileTakePhotoBtn");
  const fileInput = document.getElementById("profilePhotoFileInput");
  const saveBtn = document.getElementById("profileSaveBtn");

  if (openCameraBtn && cameraPanel && video) {
    openCameraBtn.addEventListener("click", async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("La fotocamera non è supportata da questo browser. Usa la galleria.");
        return;
      }
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = cameraStream;
        cameraPanel.classList.remove("hidden");
      } catch (e) {
        console.error(e);
        alert("Impossibile accedere alla fotocamera. Controlla i permessi.");
      }
    });
  }

  if (closeCameraBtn && cameraPanel) {
    closeCameraBtn.addEventListener("click", () => {
      cameraPanel.classList.add("hidden");
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
        cameraStream = null;
      }
    });
  }

  if (takePhotoBtn && video && cameraPanel) {
    takePhotoBtn.addEventListener("click", async () => {
      try {
        const base64 = await captureFrameFromVideo(video);
        state.user.photoData = base64;
        saveState();
        renderProfileScreen();
        renderHeader();
        renderLaundryScreen();
        renderShowerScreen();
        renderCleaning();
        cameraPanel.classList.add("hidden");
        if (cameraStream) {
          cameraStream.getTracks().forEach((t) => t.stop());
          cameraStream = null;
        }
      } catch (e) {
        console.error(e);
        alert("Errore nello scattare la foto. Riprova.");
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        const base64 = await readImageFileAsBase64Thumbnail(file);
        state.user.photoData = base64;
        saveState();
        renderProfileScreen();
        renderHeader();
        renderLaundryScreen();
        renderShowerScreen();
        renderCleaning();
      } catch (e) {
        console.error(e);
        alert("Errore nel caricare la foto dalla galleria.");
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const firstInput = document.getElementById("profileFirstName");
      const lastInput = document.getElementById("profileLastName");
      const firstName = (firstInput && firstInput.value.trim()) || "";
      const lastName = (lastInput && lastInput.value.trim()) || "";

      if (!firstName || !lastName) {
        alert("Inserisci sia nome che cognome.");
        return;
      }

      state.user.firstName = firstName;
      state.user.lastName = lastName;
      saveState();
      renderHeader();
      alert("Profilo aggiornato!");
    });
  }
}

// ---------- Splash logic ----------

// timeout per chiudere lo splash (startup / post-login)
let splashTimeoutId = null;

// Configura la splash in base alla variante: "startup" (apertura app) o "postLogin"
function setupSplashVisualVariant(variant) {
  const splash = document.getElementById("splashScreen");
  if (!splash) return;

  // Loader a 3 pallini per la splash di avvio
  let loader = document.getElementById("splashLoader");
  if (!loader) {
    loader = document.createElement("div");
    loader.id = "splashLoader";
    loader.className = "splash-loader";
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("span");
      dot.className = "splash-loader-dot";
      loader.appendChild(dot);
    }
    splash.appendChild(loader);
  }

  // Messaggio in basso per la splash post-login
  let bottomMsg = document.getElementById("splashBottomMessage");
  if (!bottomMsg) {
    bottomMsg = document.createElement("div");
    bottomMsg.id = "splashBottomMessage";
    bottomMsg.className = "splash-bottom-message";
    splash.appendChild(bottomMsg);
  }

  if (variant === "startup") {
    // Apertura app: loader visibile, nessun messaggio
    loader.style.display = "flex";
    bottomMsg.style.display = "none";
    bottomMsg.classList.remove("splash-bottom-visible");
  } else {
    // Post-login: nessun loader, solo messaggio "Benvenuto a casa, Nome"
    loader.style.display = "none";

    const rawFirstName =
      state.user && typeof state.user.firstName === "string"
        ? state.user.firstName.trim()
        : "";
    const firstNameOnly = rawFirstName.split(" ")[0] || "ospite";

    bottomMsg.textContent = `Benvenuto a casa, ${firstNameOnly}`;
    bottomMsg.style.display = "block";

    // reset/riavvio animazione messaggio
    bottomMsg.classList.remove("splash-bottom-visible");
    void bottomMsg.offsetWidth;
    bottomMsg.classList.add("splash-bottom-visible");
  }
}

// Mostra la splash, poi passa a login o main in base a target
// variant: "startup" (apertura app) | "postLogin" (dopo registrazione)
function runSplashThen(target, options) {
  const opts = options || {};
  const variant = opts.variant === "postLogin" ? "postLogin" : "startup";

  const splash = document.getElementById("splashScreen");
  const login = document.getElementById("loginScreen");
  const main = document.getElementById("mainScreen");

  if (!splash || !login || !main) {
    // fallback se qualcosa manca
    if (target === "login") {
      showScreen("login");
      renderLoginForm();
    } else {
      showScreen("main");
      renderHeader();
      showMainSection("home");
    }
    return;
  }

  // Configura loader o messaggio
  setupSplashVisualVariant(variant);

  // Nascondi login/main
  login.style.display = "none";
  main.style.display = "none";

  // Reset timeout precedente se esiste
  if (splashTimeoutId) {
    clearTimeout(splashTimeoutId);
    splashTimeoutId = null;
  }

  // Mostra splash
  splash.style.display = "flex";
  splash.classList.remove("splash-fade-out");
  void splash.offsetWidth; // reflow per resettare animazioni/transizioni
  splash.classList.add("splash-visible");

  // Durate:
  // startup: ~3s anim + ~6s pausa hero ≈ 9s totali
  // postLogin: ~1s anim messaggio + ~3s visibile ≈ 4s totali
  const FADE_OUT_DELAY = variant === "startup" ? 9000 : 4200;

  function navigateAfterSplash() {
    splash.style.display = "none";
    splash.classList.remove("splash-visible", "splash-fade-out");
    splash.onclick = null;

    if (target === "login") {
      showScreen("login");
      renderLoginForm();
    } else {
      showScreen("main");
      renderHeader();
      showMainSection("home");
    }
  }

  function startFadeOut() {
    if (splashTimeoutId) {
      clearTimeout(splashTimeoutId);
      splashTimeoutId = null;
    }
    if (!splash.classList.contains("splash-fade-out")) {
      splash.classList.add("splash-fade-out");
    }
  }

  // Timeout naturale (senza tap)
  splashTimeoutId = setTimeout(() => {
    startFadeOut();
  }, FADE_OUT_DELAY);

  // Tap per skippare lo splash e andare subito oltre
  splash.onclick = () => {
    startFadeOut();
  };

  // Quando finisce il fade-out (transizione su opacity), navighiamo
  splash.addEventListener(
    "transitionend",
    (e) => {
      if (e.propertyName !== "opacity") return;
      navigateAfterSplash();
    },
    { once: true }
  );
}

// ---------- DateTime Picker custom (POPUP) ----------

function getNext7Days() {
  const days = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    d.setHours(0, 0, 0, 0);
    days.push(d);
  }
  return days;
}

function getDefaultTimes() {
  const times = [];
  for (let h = 7; h <= 22; h++) {
    for (let m of [0, 30]) {
      times.push({ hour: h, minute: m });
    }
  }
  return times;
}

function sameDay(d1, d2) {
  return (
    d1 &&
    d2 &&
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function openDateTimePicker(context) {
  dtpContext = context;

  const dialog = document.getElementById("dateTimePickerDialog");
  const titleEl = document.getElementById("dtpTitle");
  const daysEl = document.getElementById("dtpDays");
  const timesEl = document.getElementById("dtpTimes");
  if (!dialog || !daysEl || !timesEl || !titleEl) return;

  titleEl.textContent =
    context === "laundry"
      ? "Scegli data e ora per la lavatrice"
      : "Scegli data e ora per la doccia";

  daysEl.innerHTML = "";
  timesEl.innerHTML = "";

  const days = getNext7Days();
  const times = getDefaultTimes();

  let currentSelected =
    context === "laundry" ? selectedLaundryDateTime : selectedShowerDateTime;
  if (!currentSelected) {
    currentSelected = new Date();
  }

  dtpSelectedDay = days.find((d) => sameDay(d, currentSelected)) || days[0];
  dtpSelectedTime = {
    hour: currentSelected.getHours(),
    minute: currentSelected.getMinutes() < 30 ? 0 : 30,
  };

  days.forEach((day) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dtp-day-btn tap-animate";

    const nameSpan = document.createElement("span");
    nameSpan.className = "dtp-day-name";
    nameSpan.textContent = day.toLocaleDateString("it-IT", {
      weekday: "short",
    });

    const dateSpan = document.createElement("span");
    dateSpan.className = "dtp-day-date";
    dateSpan.textContent = day.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
    });

    btn.appendChild(nameSpan);
    btn.appendChild(dateSpan);

    if (sameDay(day, dtpSelectedDay)) {
      btn.classList.add("dtp-selected");
    }

    btn.addEventListener("click", () => {
      dtpSelectedDay = day;
      document.querySelectorAll(".dtp-day-btn").forEach((b) =>
        b.classList.remove("dtp-selected")
      );
      btn.classList.add("dtp-selected");
    });

    daysEl.appendChild(btn);
  });

  times.forEach((t) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dtp-time-btn tap-animate";
    const hh = String(t.hour).padStart(2, "0");
    const mm = String(t.minute).padStart(2, "0");
    btn.textContent = `${hh}:${mm}`;

    if (
      t.hour === dtpSelectedTime.hour &&
      t.minute === dtpSelectedTime.minute
    ) {
      btn.classList.add("dtp-selected");
    }

    btn.addEventListener("click", () => {
      dtpSelectedTime = { hour: t.hour, minute: t.minute };
      document.querySelectorAll(".dtp-time-btn").forEach((b) =>
        b.classList.remove("dtp-selected")
      );
      btn.classList.add("dtp-selected");
    });

    timesEl.appendChild(btn);
  });

  dialog.classList.remove("hidden");
}

// Funzioni condivise: prenotazione lavatrice / doccia in base all'orario selezionato
function bookLaundryFromSelectedDateTime() {
  const msgEl = document.getElementById("laundryStatusMessage");

  if (!selectedLaundryDateTime) {
    alert("Seleziona prima data e ora della lavatrice.");
    return;
  }

  const start = new Date(selectedLaundryDateTime);
  if (isNaN(start.getTime())) {
    alert("Data/ora non valida.");
    return;
  }

  const now = new Date();
  if (start.getTime() < now.getTime() - 5 * 60 * 1000) {
    if (!confirm("Hai selezionato un orario nel passato. Confermi comunque?")) {
      return;
    }
  }

  cleanupLaundryReservations();
  const list = state.group.laundryReservations || [];

  if (list.length >= 2) {
    const sorted = list
      .slice()
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    const first = sorted[0];
    const firstEndMs = new Date(first.startTime).getTime() + 48 * MS_HOUR;
    const diffMs = Math.max(0, firstEndMs - Date.now());
    const hoursLeft = Math.ceil(diffMs / MS_HOUR);
    const text = `Al momento non ci sono stendini liberi. Il primo si libera tra circa ${hoursLeft} ore (prenotato da ${first.userName}).`;
    if (msgEl) msgEl.textContent = text;
    alert(text);
    return;
  }

  let rackLabel = "Stendino 1";
  if (list.length === 1) {
    rackLabel = list[0].rackLabel === "Stendino 1" ? "Stendino 2" : "Stendino 2";
  }

  list.push({
    id: Date.now(),
    userName: getUserFullName(),
    startTime: start.toISOString(),
    rackLabel,
  });

  state.group.laundryReservations = list;
  saveState();
  if (msgEl) msgEl.textContent = "";
  renderLaundryScreen();
  alert(`Lavatrice prenotata con ${rackLabel} il ${formatDateTimeShort(start.toISOString())}.`);
}

function bookShowerFromSelectedDateTime() {
  const conflictDialog = document.getElementById("showerConflictDialog");

  if (!selectedShowerDateTime) {
    alert("Seleziona prima data e ora della doccia.");
    return;
  }
  const start = new Date(selectedShowerDateTime);
  if (isNaN(start.getTime())) {
    alert("Data/ora non valida.");
    return;
  }

  const now = new Date();
  if (start.getTime() < now.getTime() - 5 * 60 * 1000) {
    if (!confirm("Hai selezionato un orario nel passato. Confermi comunque?")) {
      return;
    }
  }

  cleanupShowerBookings();
  const list = state.group.showerBookings || [];
  let hasOverlap = false;
  const startMs = start.getTime();
  const endMs = startMs + MS_90_MIN;

  for (const b of list) {
    const s2 = new Date(b.startTime).getTime();
    const e2 = s2 + MS_90_MIN;
    if (intervalsOverlap(startMs, endMs, s2, e2)) {
      hasOverlap = true;
      break;
    }
  }

  function addShowerBooking(startDate, forceConflict) {
    cleanupShowerBookings();
    const listInner = state.group.showerBookings || [];
    const newBooking = {
      id: Date.now(),
      userName: getUserFullName(),
      startTime: startDate.toISOString(),
      hasConflict: !!forceConflict,
    };
    listInner.push(newBooking);
    state.group.showerBookings = listInner;
    recomputeShowerConflicts();
    saveState();
    renderShowerScreen();
  }

  if (!hasOverlap) {
    addShowerBooking(start, false);
    alert(`Doccia prenotata il ${formatDateTimeShort(start.toISOString())}.`);
    return;
  }

  // Slot in conflitto: apri dialogo di conferma
  pendingShowerBooking = {
    startTime: start,
  };
  if (conflictDialog) conflictDialog.classList.remove("hidden");

  // Configuro i bottoni del dialogo (solo una volta)
  const changeSlotBtn = document.getElementById("showerChangeSlotBtn");
  const confirmSlotBtn = document.getElementById("showerConfirmSlotBtn");

  if (changeSlotBtn && !changeSlotBtn._showerHandled) {
    changeSlotBtn._showerHandled = true;
    changeSlotBtn.addEventListener("click", () => {
      pendingShowerBooking = null;
      conflictDialog.classList.add("hidden");
    });
  }

  if (confirmSlotBtn && !confirmSlotBtn._showerHandled) {
    confirmSlotBtn._showerHandled = true;
    confirmSlotBtn.addEventListener("click", () => {
      if (pendingShowerBooking) {
        addShowerBooking(pendingShowerBooking.startTime, true);
        alert(
          `Doccia prenotata comunque il ${formatDateTimeShort(
            pendingShowerBooking.startTime.toISOString()
          )}. Ricorda di controllare il boiler!`
        );
      }
      pendingShowerBooking = null;
      conflictDialog.classList.add("hidden");
    });
  }
}

function setupDateTimePickerEvents() {
  const dtpCancelBtn = document.getElementById("dtpCancelBtn");
  const dtpOkBtn = document.getElementById("dtpOkBtn");
  const dialog = document.getElementById("dateTimePickerDialog");

  if (dtpCancelBtn && dialog) {
    dtpCancelBtn.addEventListener("click", () => {
      dialog.classList.add("hidden");
      dtpContext = null;
    });
  }

  if (dtpOkBtn && dialog) {
    dtpOkBtn.addEventListener("click", () => {
      if (!dtpSelectedDay || !dtpSelectedTime) {
        alert("Seleziona sia un giorno che un orario.");
        return;
      }
      const d = new Date(dtpSelectedDay);
      d.setHours(dtpSelectedTime.hour, dtpSelectedTime.minute, 0, 0);

      if (dtpContext === "laundry") {
        selectedLaundryDateTime = d;
        dialog.classList.add("hidden");
        dtpContext = null;
        // Prenotazione immediata
        bookLaundryFromSelectedDateTime();
      } else if (dtpContext === "shower") {
        selectedShowerDateTime = d;
        dialog.classList.add("hidden");
        dtpContext = null;
        // Prenotazione immediata
        bookShowerFromSelectedDateTime();
      } else {
        dialog.classList.add("hidden");
        dtpContext = null;
      }
    });
  }

  const laundryDisplay = document.getElementById("laundryDateTimeDisplay");
  if (laundryDisplay) {
    laundryDisplay.addEventListener("click", () => openDateTimePicker("laundry"));
  }
  const showerDisplay = document.getElementById("showerDateTimeDisplay");
  if (showerDisplay) {
    showerDisplay.addEventListener("click", () => openDateTimePicker("shower"));
  }
}

// ---------- Eventi: MAIN ----------
function setupMainEvents() {
  document.querySelectorAll(".section-tile").forEach((btn) => {
    btn.addEventListener("click", () => {
      const section = btn.dataset.section;
      renderHeader();
      showMainSection(section);
    });
  });

  document.querySelectorAll(".back-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      renderHeader();
      showMainSection("home");
    });
  });

  const userNameEl = document.getElementById("currentUserName");
  const userAvatarEl = document.getElementById("currentUserAvatar");
  [userNameEl, userAvatarEl].forEach((el) => {
    if (el) {
      el.addEventListener("click", () => {
        renderProfileScreen();
        showMainSection("profile");
      });
    }
  });

  // LAVATRICE
  const laundryBtn = document.getElementById("laundryBookBtn");
  if (laundryBtn) {
    laundryBtn.addEventListener("click", () => {
      // Usa lo stesso flusso del DateTime Picker: prenotazione immediata
      bookLaundryFromSelectedDateTime();
    });
  }

  // DOCCIA
  const showerBtn = document.getElementById("showerBookBtn");
  if (showerBtn) {
    showerBtn.addEventListener("click", () => {
      // Usa lo stesso flusso del DateTime Picker: prenotazione immediata
      bookShowerFromSelectedDateTime();
    });
  }

  // LISTA SPESA - aggiunta elementi
  const shoppingAddForm = document.getElementById("shoppingAddForm");
  const shoppingAddInput = document.getElementById("shoppingAddInput");
  if (shoppingAddForm && shoppingAddInput) {
    shoppingAddForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = shoppingAddInput.value.trim();
      if (!text) return;
      if (!state.group.shoppingChecklist) state.group.shoppingChecklist = [];
      state.group.shoppingChecklist.push({
        id: Date.now().toString(),
        label: text,
        checked: false,
      });
      shoppingAddInput.value = "";
      saveState();
      renderShopping();
    });
  }

  // PULIZIE - click sulle zone (toggle + override)
  document.querySelectorAll(".cleaning-zone-row").forEach((btn) => {
    btn.addEventListener("click", () => {
      const zone = btn.dataset.zone;
      if (!zone) return;
      resetCleaningWeekIfNeeded();

      const ass = state.group.cleaningAssignments[zone];
      const myName = getUserFullName();
      const myPhoto = state.user.photoData;

      if (!ass) {
        state.group.cleaningAssignments[zone] = {
          userName: myName,
          photoData: myPhoto,
          timestamp: new Date().toISOString(),
        };
        saveState();
        renderCleaning();
        return;
      }

      if (ass.userName === myName) {
        const okRemove = confirm("Vuoi rimuovere la tua prenotazione per questa zona?");
        if (!okRemove) return;
        state.group.cleaningAssignments[zone] = null;
        saveState();
        renderCleaning();
        return;
      }

      const ok = confirm(
        `Questa zona è già presa in carico da ${ass.userName}.\nVuoi assegnarla a te?`
      );
      if (!ok) return;

      state.group.cleaningAssignments[zone] = {
        userName: myName,
        photoData: myPhoto,
        timestamp: new Date().toISOString(),
      };
      saveState();
      renderCleaning();
    });
  });

  // LAVAGNA di casa - click e dialogo
  const blackboardEl = document.getElementById("homeBlackboard");
  const blackboardDialog = document.getElementById("blackboardDialog");
  const blackboardInput = document.getElementById("blackboardInput");
  const blackboardCancelBtn = document.getElementById("blackboardCancelBtn");
  const blackboardSaveBtn = document.getElementById("blackboardSaveBtn");

  if (blackboardEl && blackboardDialog && blackboardInput) {
    blackboardEl.addEventListener("click", () => {
      const msg = state.group.board && state.group.board[0];
      blackboardInput.value = msg ? msg.text : "";
      blackboardDialog.classList.remove("hidden");
    });
  }

  if (blackboardCancelBtn && blackboardDialog) {
    blackboardCancelBtn.addEventListener("click", () => {
      blackboardDialog.classList.add("hidden");
    });
  }

  if (blackboardSaveBtn && blackboardDialog && blackboardInput) {
    blackboardSaveBtn.addEventListener("click", () => {
      const text = blackboardInput.value.trim();
      if (!text) {
        alert("Scrivi qualcosa prima di salvare.");
        return;
      }
      const now = new Date();
      const dateStr = now.toLocaleString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      const msg = {
        text,
        author: getUserFullName(),
        date: dateStr,
      };
      if (!state.group.board) state.group.board = [];
      state.group.board.unshift(msg);
      saveState();
      blackboardDialog.classList.add("hidden");
      renderHomeBlackboard();
    });
  }
}

// ---------- Init ----------
loadState();

window.addEventListener("DOMContentLoaded", () => {
  setupLoginEvents();
  setupMainEvents();
  setupProfileEvents();
  setupDateTimePickerEvents();

  const hasUser =
    state.user &&
    typeof state.user.firstName === "string" &&
    state.user.firstName.trim().length > 0;

  // Splash all'avvio, poi login o home (variante "startup" con intro lunga)
  runSplashThen(hasUser ? "main" : "login", { variant: "startup" });
});
