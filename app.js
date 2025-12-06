// Stato globale salvato in localStorage (solo su questo dispositivo)
const STORAGE_KEY = "montevecchio66_app_v3";
const MS_HOUR = 60 * 60 * 1000;
const MS_90_MIN = 90 * 60 * 1000;

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
    shopping: [],
    board: [],
    cleaning: {
      cucina: false,
      sala: false,
      bagno_piccolo: false,
      bagno_grande: false,
    },
  },
};
kkk=0;
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
          cleaning: {
            ...state.group.cleaning,
            ...(pg.cleaning || {}),
          },
          laundryReservations: pg.laundryReservations || [],
          showerBookings: pg.showerBookings || [],
          shopping: pg.shopping || [],
          board: pg.board || [],
        },
      };
    }
  } catch (e) {
    console.error("Errore caricando lo stato:", e);
  }

  cleanupLaundryReservations();
  cleanupShowerBookings();
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

  [homeEl, laundryEl, showerEl, cleaningEl, shoppingEl].forEach((el) => {
    if (el) el.style.display = "none";
  });

  if (section === "home" && homeEl) {
    homeEl.style.display = "flex";
  } else if (section === "laundry" && laundryEl) {
    laundryEl.style.display = "flex";
    renderLaundryScreen();
  } else if (section === "shower" && showerEl) {
    showerEl.style.display = "flex";
    renderShowerScreen();
  } else if (section === "cleaning" && cleaningEl) {
    cleaningEl.style.display = "flex";
    renderCleaning();
  } else if (section === "shopping" && shoppingEl) {
    shoppingEl.style.display = "flex";
    renderShopping();
    renderBoard();
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

// Crea un avatar piccolo per l'utente corrente
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
  // reset
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

// ---------- Render: SPESA / LAVAGNA / PULIZIE ----------
function renderShopping() {
  const listEl = document.getElementById("shoppingList");
  if (!listEl) return;
  listEl.innerHTML = "";

  state.group.shopping.forEach((item, index) => {
    const li = document.createElement("li");

    const top = document.createElement("div");
    top.style.display = "flex";
    top.style.flexDirection = "column";

    const span = document.createElement("span");
    span.textContent = item.text;

    const meta = document.createElement("small");
    meta.textContent = item.addedBy || "";
    meta.style.fontSize = "0.7rem";
    meta.style.color = "#666";

    top.appendChild(span);
    if (item.addedBy) top.appendChild(meta);

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "X";
    deleteBtn.addEventListener("click", () => {
      state.group.shopping.splice(index, 1);
      saveState();
      renderShopping();
    });

    li.appendChild(top);
    li.appendChild(deleteBtn);
    listEl.appendChild(li);
  });
}

function renderBoard() {
  const listEl = document.getElementById("boardMessages");
  if (!listEl) return;
  listEl.innerHTML = "";

  state.group.board.forEach((msg) => {
    const li = document.createElement("li");
    li.className = "board-item";

    const meta = document.createElement("div");
    meta.className = "board-meta";
    meta.textContent = `${msg.author} - ${msg.date}`;

    const text = document.createElement("div");
    text.textContent = msg.text;

    li.appendChild(meta);
    li.appendChild(text);
    listEl.appendChild(li);
  });
}

function renderCleaning() {
  const checkboxes = document.querySelectorAll(
    ".cleaning-item input[type='checkbox']"
  );
  checkboxes.forEach((cb) => {
    const zone = cb.dataset.zone;
    cb.checked = !!state.group.cleaning[zone];
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
        // Non ci sono stendini liberi
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

      // Assegna stendino
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

      // Conflitto: chiedi conferma
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

  // SPESA
  const shoppingForm = document.getElementById("shoppingForm");
  const shoppingInput = document.getElementById("shoppingInput");
  if (shoppingForm && shoppingInput) {
    shoppingForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = shoppingInput.value.trim();
      if (!text) return;
      state.group.shopping.push({
        text,
        addedBy: getUserFullName(),
      });
      shoppingInput.value = "";
      saveState();
      renderShopping();
    });
  }

  // LAVAGNA
  const boardForm = document.getElementById("boardForm");
  const boardInput = document.getElementById("boardInput");
  if (boardForm && boardInput) {
    boardForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = boardInput.value.trim();
      if (!text) return;

      const now = new Date();
      const dateStr = now.toLocaleString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

      state.group.board.unshift({
        text,
        author: getUserFullName(),
        date: dateStr,
      });
      boardInput.value = "";
      saveState();
      renderBoard();
    });
  }

  // PULIZIE
  const cleaningCheckboxes = document.querySelectorAll(
    ".cleaning-item input[type='checkbox']"
  );
  cleaningCheckboxes.forEach((cb) => {
    cb.addEventListener("change", () => {
      const zone = cb.dataset.zone;
      state.group.cleaning[zone] = cb.checked;
      saveState();
    });
  });
}

// ---------- Init ----------
loadState();

window.addEventListener("DOMContentLoaded", () => {
  setupLoginEvents();
  setupMainEvents();

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
