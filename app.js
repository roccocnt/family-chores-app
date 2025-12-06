// Stato globale salvato in localStorage (solo su questo dispositivo)
const STORAGE_KEY = "montevecchio66_app_v4";
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
    showerBookings: [], // lista docce (mostriamo sempre le 5 più vicine)
    shopping: [], // legacy (non usato più)
    shoppingChecklist: [], // nuova checklist
    board: [], // array di messaggi; usiamo solo il primo per la lavagna
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
let currentMainSection = "home";
let pendingShowerBooking = null; // per conflitti

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

function showScreen(name) {
  const login = document.getElementById("loginScreen");
  const main = document.getElementById("mainScreen");
  if (!login || !main) return;

  if (name === "login") {
    login.style.display = "flex";
    main.style.display = "none";
  } else {
    login.style.display = "none";
    main.style.display = "flex";
  }
}

function showMainSection(section) {
  currentMainSection = section;
  const homeEl = document.getElementById("homeSections");
  const laundryEl = document.getElementById("laundryScreen");
  const showerEl = document.getElementById("showerScreen");
  const cleaningEl = document.getElementById("cleaningScreen");
  const shoppingEl = document.getElementById("shoppingScreen");
  const profileEl = document.getElementById("profileScreen");

  [homeEl, laundryEl, showerEl, cleaningEl, shoppingEl, profileEl].forEach((el) => {
    if (el) el.style.display = "none";
  });

  if (section === "home" && homeEl) {
    homeEl.style.display = "flex";
    renderHomeBlackboard();
  } else if (section === "laundry" && laundryEl) {
    laundryEl.style.display = "flex";
    renderLaundryScreen();
  } else if (section === "shower" && showerEl) {
    showerEl.style.display = "flex";
    renderShowerScreen();
  } else if (section === "cleaning" && cleaningEl) {
    cleaningEl.style.display = "flex";
    resetCleaningWeekIfNeeded();
    renderCleaning();
  } else if (section === "shopping" && shoppingEl) {
    shoppingEl.style.display = "flex";
    renderShopping();
  } else if (section === "profile" && profileEl) {
    profileEl.style.display = "flex";
    renderProfileScreen();
  }
}

function formatDateTimeShort(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Data non valida";
  const day = d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
  });
  const time = d.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} alle ${time}`;
}

// Avatar piccolo per l'utente corrente (prenotazioni lavatrice/doccia)
function createUserSmallAvatar() {
  const div = document.createElement("div");
  div.className = "small-avatar";
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
  // Approssimazione settimana ISO (lunedì come inizio)
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
    // Salva nel nuovo storico e svuota assegnazioni
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
  if (!listEl) return;

  listEl.innerHTML = "";
  const list = state.group.laundryReservations || [];

  if (list.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Nessuna lavatrice prenotata.";
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
  if (!container) return;
  container.innerHTML = "";

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
    textEl.textContent = `"${msg.text}"`;
    textEl.classList.remove("blackboard-placeholder");
    authorEl.textContent = `— ${msg.author}`;
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
    });

    const span = document.createElement("span");
    span.textContent = item.label;

    label.appendChild(cb);
    label.appendChild(span);
    li.appendChild(label);
    listEl.appendChild(li);
  });
}

// ---------- Render: PULIZIE ----------
function renderCleaning() {
  // Assegnazioni attuali
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
      avatar.className = "small-avatar"; // ingrandiamo un po' per l'assegnato
      const nameSpan = document.createElement("span");
      nameSpan.textContent = ass.userName;
      assEl.appendChild(avatar);
      assEl.appendChild(nameSpan);
    }
  });

  // Storico
  CLEANING_ZONES.forEach((zone) => {
    const container = document.getElementById("history-" + zone);
    if (!container) return;
    container.innerHTML = "";
    const history = state.group.cleaningHistory[zone] || [];
    history.forEach((h) => {
      const avatar = createSmallAvatarFromData(h.photoData, h.userName);
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

  // Apri fotocamera
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

  // Chiudi fotocamera
  if (closeCameraBtn && cameraPanel) {
    closeCameraBtn.addEventListener("click", () => {
      cameraPanel.classList.add("hidden");
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
        cameraStream = null;
      }
    });
  }

  // Scatta foto
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

  // Carica da galleria
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

  // Registrazione / Entra
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
      showScreen("main");
      showMainSection("home");
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

  // Apri fotocamera profilo
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

  // Chiudi fotocamera profilo
  if (closeCameraBtn && cameraPanel) {
    closeCameraBtn.addEventListener("click", () => {
      cameraPanel.classList.add("hidden");
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
        cameraStream = null;
      }
    });
  }

  // Scatta foto profilo
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

  // Carica da galleria profilo
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

  // Salva nome/cognome
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

// ---------- Eventi: MAIN ----------
function setupMainEvents() {
  // Navigazione sezioni
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

  // Clic su avatar o nome → profilo
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
      const input = document.getElementById("laundryDateTime");
      const msgEl = document.getElementById("laundryStatusMessage");
      if (!input) return;

      const value = input.value;
      if (!value) {
        alert("Seleziona data e ora della lavatrice.");
        return;
      }

      const start = new Date(value);
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
    });
  }

  // DOCCIA
  const showerBtn = document.getElementById("showerBookBtn");
  const conflictDialog = document.getElementById("showerConflictDialog");
  const changeSlotBtn = document.getElementById("showerChangeSlotBtn");
  const confirmSlotBtn = document.getElementById("showerConfirmSlotBtn");

  function addShowerBooking(startIso, forceConflict) {
    cleanupShowerBookings();
    const list = state.group.showerBookings || [];
    const newBooking = {
      id: Date.now(),
      userName: getUserFullName(),
      startTime: startIso,
      hasConflict: !!forceConflict,
    };
    list.push(newBooking);
    state.group.showerBookings = list;
    recomputeShowerConflicts();
    saveState();
    renderShowerScreen();
  }

  if (showerBtn) {
    showerBtn.addEventListener("click", () => {
      const input = document.getElementById("showerDateTime");
      if (!input) return;
      const value = input.value;
      if (!value) {
        alert("Seleziona data e ora della doccia.");
        return;
      }
      const start = new Date(value);
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

      if (!hasOverlap) {
        addShowerBooking(start.toISOString(), false);
        alert(`Doccia prenotata il ${formatDateTimeShort(start.toISOString())}.`);
        return;
      }

      pendingShowerBooking = {
        startTimeIso: start.toISOString(),
      };
      if (conflictDialog) conflictDialog.classList.remove("hidden");
    });
  }

  if (changeSlotBtn && conflictDialog) {
    changeSlotBtn.addEventListener("click", () => {
      pendingShowerBooking = null;
      conflictDialog.classList.add("hidden");
    });
  }

  if (confirmSlotBtn && conflictDialog) {
    confirmSlotBtn.addEventListener("click", () => {
      if (pendingShowerBooking) {
        addShowerBooking(pendingShowerBooking.startTimeIso, true);
        alert(
          `Doccia prenotata comunque il ${formatDateTimeShort(
            pendingShowerBooking.startTimeIso
          )}. Ricorda di controllare il boiler!`
        );
      }
      pendingShowerBooking = null;
      conflictDialog.classList.add("hidden");
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

  // PULIZIE - click sulle zone
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
        alert("Hai già preso in carico questa zona per questa settimana.");
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

  const hasUser =
    state.user &&
    typeof state.user.firstName === "string" &&
    state.user.firstName.trim().length > 0;

  if (hasUser) {
    renderHeader();
    showScreen("main");
    showMainSection("home");
  } else {
    renderLoginForm();
    showScreen("login");
  }
});
