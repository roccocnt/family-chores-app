// Stato globale salvato in localStorage (solo su questo dispositivo)
const STORAGE_KEY = "montevecchio66_app_v1";

let state = {
  user: {
    firstName: "",
    lastName: "",
    photoData: null, // base64 della foto utente
  },
  group: {
    name: "Corso Montevecchio 66",
    bookings: {
      washing: null,
      rack1: null,
      rack2: null,
      shower: null,
    },
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

let cameraStream = null;

// ---------- Persistenza ----------
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Merge “sicuro” nel caso manchino campi
      state = {
        ...state,
        ...parsed,
        user: { ...state.user, ...(parsed.user || {}) },
        group: {
          ...state.group,
          ...(parsed.group || {}),
          bookings: {
            ...state.group.bookings,
            ...((parsed.group && parsed.group.bookings) || {}),
          },
          cleaning: {
            ...state.group.cleaning,
            ...((parsed.group && parsed.group.cleaning) || {}),
          },
        },
      };
    }
  } catch (e) {
    console.error("Errore caricando lo stato:", e);
  }
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

// ---------- Helpers ----------
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

// ---------- Render: MAIN ----------
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
      const initials = (state.user.firstName && state.user.lastName)
        ? (state.user.firstName[0] + state.user.lastName[0]).toUpperCase()
        : "🙂";
      avatarEl.textContent = initials;
    }
  }
}

function renderBookings() {
  const mappings = [
    { key: "washing", elId: "washingInfo" },
    { key: "rack1", elId: "rack1Info" },
    { key: "rack2", elId: "rack2Info" },
    { key: "shower", elId: "showerInfo" },
  ];

  mappings.forEach(({ key, elId }) => {
    const el = document.getElementById(elId);
    const booking = state.group.bookings[key];
    if (!el) return;
    if (!booking) {
      el.textContent = "Nessuno ha prenotato";
    } else {
      el.textContent = `${booking.userName} ha prenotato`;
    }
  });
}

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

function renderMain() {
  renderHeader();
  renderBookings();
  renderShopping();
  renderBoard();
  renderCleaning();
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
        // Chiudi camera dopo lo scatto
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

      // Non obbligo la foto: se non c'è, useremo le iniziali
      saveState();

      // Passa alla schermata principale
      renderMain();
      showScreen("main");
    });
  }
}

// ---------- Eventi: MAIN ----------
function setupMainEvents() {
  // Prenotazioni
  document.querySelectorAll(".book-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.type;
      state.group.bookings[type] = {
        userName: getUserFullName(),
        time: new Date().toISOString(),
      };
      saveState();
      renderBookings();
    });
  });

  document.querySelectorAll(".clear-booking-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.type;
      state.group.bookings[type] = null;
      saveState();
      renderBookings();
    });
  });

  // Lista spesa
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

  // Lavagna
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

  // Pulizie
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
  // Setup eventi
  setupLoginEvents();
  setupMainEvents();

  // Se l'utente è già registrato (nome presente), vai direttamente alla casa
  const hasUser =
    state.user &&
    typeof state.user.firstName === "string" &&
    state.user.firstName.trim().length > 0;

  if (hasUser) {
    // assicura che header e resto siano aggiornati
    renderMain();
    showScreen("main");
  } else {
    renderLoginForm();
    showScreen("login");
  }
});
