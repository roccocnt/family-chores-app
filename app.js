// app.js (versione senza Firebase Storage, solo Firestore)

import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// Prendiamo db da window._firebase (inizializzato in index.html)
const { db } = window._firebase;

// ID del gruppo (per ora fisso, poi si può rendere dinamico)
const DEFAULT_GROUP_ID = "default-group";
const LOCAL_USER_KEY = "family_home_local_user_v1";

// Utente locale (chi usa questo dispositivo)
let localUser = {
  firstName: "",
  lastName: "",
  avatar: "🙂",
  photoData: null, // Base64 della foto (thumbnail)
};

// Stato condiviso del gruppo
let groupState = {
  groupName: "Famiglia",
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
};

// ---------- Helpers locali ----------
function loadLocalUser() {
  try {
    const raw = localStorage.getItem(LOCAL_USER_KEY);
    if (raw) {
      localUser = JSON.parse(raw);
    }
  } catch (e) {
    console.error("Errore caricando utente locale", e);
  }
}

function saveLocalUser() {
  localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(localUser));
}

function getCurrentUserFullName() {
  const full = `${localUser.firstName || ""} ${localUser.lastName || ""}`.trim();
  return full || "Utente anonimo";
}

// Riduci la foto e convertila in Base64 (thumbnail)
function readImageFileAsBase64Thumbnail(file, maxSize = 128) {
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
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        const base64 = dataUrl.split(",")[1];
        resolve(base64);
      };
      img.onerror = () => reject("Errore caricamento immagine");
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---------- Firestore ----------
function groupDocRef() {
  return doc(db, "groups", DEFAULT_GROUP_ID);
}

async function initGroupInFirestoreIfNeeded() {
  const gRef = groupDocRef();
  const snap = await getDoc(gRef);
  if (!snap.exists()) {
    await setDoc(gRef, {
      groupName: "Famiglia",
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
      users: [],
      createdAt: new Date().toISOString(),
    });
  }
}

function subscribeToGroupChanges() {
  const gRef = groupDocRef();
  onSnapshot(gRef, (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    groupState.groupName = data.groupName || "Famiglia";
    groupState.bookings = data.bookings || groupState.bookings;
    groupState.shopping = data.shopping || [];
    groupState.board = data.board || [];
    groupState.cleaning = data.cleaning || groupState.cleaning;
    // (eventualmente: data.users per mostrare elenco membri, più avanti)
    renderAll();
  });
}

// ---------- Render UI ----------
function renderHeader() {
  document.getElementById("groupName").textContent =
    "Gruppo: " + (groupState.groupName || "Famiglia");

  document.getElementById("currentUserName").textContent =
    getCurrentUserFullName();

  const avatarEl = document.getElementById("currentUserAvatar");
  avatarEl.style.backgroundSize = "cover";
  avatarEl.style.backgroundPosition = "center";

  if (localUser.photoData) {
    avatarEl.textContent = "";
    avatarEl.style.backgroundImage =
      `url(data:image/jpeg;base64,${localUser.photoData})`;
  } else {
    avatarEl.style.backgroundImage = "none";
    avatarEl.textContent = localUser.avatar || "🙂";
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
    const booking = groupState.bookings[key];
    if (!booking) {
      el.textContent = "Nessuno ha prenotato";
    } else {
      el.textContent = `${booking.userName} ha prenotato`;
    }
  });
}

function renderShopping() {
  const listEl = document.getElementById("shoppingList");
  listEl.innerHTML = "";

  groupState.shopping.forEach((item, index) => {
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
    deleteBtn.addEventListener("click", async () => {
      const gRef = groupDocRef();
      const gSnap = await getDoc(gRef);
      if (!gSnap.exists()) return;
      const data = gSnap.data();
      const shopping = data.shopping || [];
      shopping.splice(index, 1);
      await updateDoc(gRef, { shopping });
    });

    li.appendChild(top);
    li.appendChild(deleteBtn);
    listEl.appendChild(li);
  });
}

function renderBoard() {
  const listEl = document.getElementById("boardMessages");
  listEl.innerHTML = "";

  groupState.board.forEach((msg) => {
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
    cb.checked = !!groupState.cleaning[zone];
  });
}

function renderAll() {
  renderHeader();
  renderBookings();
  renderShopping();
  renderBoard();
  renderCleaning();
}

// ---------- Eventi ----------
function setupEvents() {
  // Pre-carica form con utente locale
  document.getElementById("userFirstName").value = localUser.firstName || "";
  document.getElementById("userLastName").value = localUser.lastName || "";
  document.getElementById("userAvatar").value = localUser.avatar || "🙂";

  // Salva nome gruppo
  document.getElementById("saveGroupBtn").addEventListener("click", async () => {
    const input = document.getElementById("groupInput");
    const newName = input.value.trim() || "Famiglia";
    const gRef = groupDocRef();
    await updateDoc(gRef, { groupName: newName });
  });

  // Salva/aggiorna utente + foto
  document.getElementById("saveUserBtn").addEventListener("click", async () => {
    const firstName = document.getElementById("userFirstName").value.trim();
    const lastName = document.getElementById("userLastName").value.trim();
    let avatar = document.getElementById("userAvatar").value.trim();
    if (!avatar) avatar = "🙂";

    const photoInput = document.getElementById("userPhoto");
    let photoData = localUser.photoData || null;

    // Se l'utente ha selezionato una nuova foto, la convertiamo
    if (photoInput.files && photoInput.files[0]) {
      photoData = await readImageFileAsBase64Thumbnail(photoInput.files[0]);
    }

    localUser = { firstName, lastName, avatar, photoData };
    saveLocalUser();

    const gRef = groupDocRef();
    const gSnap = await getDoc(gRef);
    if (gSnap.exists()) {
      const data = gSnap.data();
      const users = data.users || [];
      const idx = users.findIndex(
        (u) =>
          (u.firstName || "") === firstName &&
          (u.lastName || "") === lastName
      );
      const userObj = { firstName, lastName, avatar, photoData };

      if (idx >= 0) {
        users[idx] = userObj;
      } else {
        users.push(userObj);
      }
      await updateDoc(gRef, { users });
    }

    renderHeader();
    alert("Utente registrato/aggiornato nel gruppo!");
  });

  // Prenotazioni
  document.querySelectorAll(".book-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const type = btn.dataset.type;
      const gRef = groupDocRef();
      const gSnap = await getDoc(gRef);
      if (!gSnap.exists()) return;
      const data = gSnap.data();
      const bookings = data.bookings || {};
      bookings[type] = {
        userName: getCurrentUserFullName(),
        avatar: localUser.avatar,
        hasPhoto: !!localUser.photoData,
      };
      await updateDoc(gRef, { bookings });
    });
  });

  document.querySelectorAll(".clear-booking-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const type = btn.dataset.type;
      const gRef = groupDocRef();
      const gSnap = await getDoc(gRef);
      if (!gSnap.exists()) return;
      const data = gSnap.data();
      const bookings = data.bookings || {};
      bookings[type] = null;
      await updateDoc(gRef, { bookings });
    });
  });

  // Lista spesa
  const shoppingForm = document.getElementById("shoppingForm");
  const shoppingInput = document.getElementById("shoppingInput");
  shoppingForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = shoppingInput.value.trim();
    if (!text) return;

    const gRef = groupDocRef();
    const gSnap = await getDoc(gRef);
    if (!gSnap.exists()) return;
    const data = gSnap.data();
    const shopping = data.shopping || [];
    shopping.push({
      text,
      addedBy: getCurrentUserFullName(),
    });
    await updateDoc(gRef, { shopping });

    shoppingInput.value = "";
  });

  // Lavagna
  const boardForm = document.getElementById("boardForm");
  const boardInput = document.getElementById("boardInput");
  boardForm.addEventListener("submit", async (e) => {
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

    const gRef = groupDocRef();
    const gSnap = await getDoc(gRef);
    if (!gSnap.exists()) return;
    const data = gSnap.data();
    const board = data.board || [];
    board.unshift({
      text,
      author: getCurrentUserFullName(),
      date: dateStr,
    });
    await updateDoc(gRef, { board });

    boardInput.value = "";
  });

  // Pulizie
  const cleaningCheckboxes = document.querySelectorAll(
    ".cleaning-item input[type='checkbox']"
  );
  cleaningCheckboxes.forEach((cb) => {
    cb.addEventListener("change", async () => {
      const zone = cb.dataset.zone;
      const gRef = groupDocRef();
      const gSnap = await getDoc(gRef);
      if (!gSnap.exists()) return;
      const data = gSnap.data();
      const cleaning = data.cleaning || {};
      cleaning[zone] = cb.checked;
      await updateDoc(gRef, { cleaning });
    });
  });
}

// ---------- Init ----------
async function init() {
  loadLocalUser();
  await initGroupInFirestoreIfNeeded();
  setupEvents();
  subscribeToGroupChanges();
}

window.addEventListener("DOMContentLoaded", () => {
  init().catch((e) => console.error(e));
});
