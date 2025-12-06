// app.js come modulo ES

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";

// Firebase init (già fatto in index.html, lo riprendiamo da window)
const { db, storage } = window._firebase;

// 🔑 ID fissi di base
const DEFAULT_GROUP_ID = "default-group"; // per ora usiamo sempre questo
const LOCAL_USER_KEY = "family_home_local_user_v1";

// Stato locale di interfaccia (parte deriva da Firestore)
let localUser = {
  firstName: "",
  lastName: "",
  avatar: "🙂",
  photoURL: null,
};

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

// ---- Helpers locali ----
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

// ---- Firestore: riferimenti ----
function groupDocRef() {
  return doc(db, "groups", DEFAULT_GROUP_ID);
}

// ---- Sincronizzazione Firestore ----
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
      users: [], // elenco utenti registrati
      createdAt: new Date().toISOString(),
    });
  }
}

// Listener in tempo reale sul documento gruppo
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
    // render
    renderAll();
  });
}

// ---- UI Render ----
function renderHeader() {
  document.getElementById("groupName").textContent =
    "Gruppo: " + (groupState.groupName || "Famiglia");

  document.getElementById("currentUserName").textContent =
    getCurrentUserFullName();

  const avatarEl = document.getElementById("currentUserAvatar");
  if (localUser.photoURL) {
    avatarEl.textContent = "";
    avatarEl.style.backgroundImage = `url(${localUser.photoURL})`;
    avatarEl.style.backgroundSize = "cover";
    avatarEl.style.backgroundPosition = "center";
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

// ---- Event handlers ----
function setupEvents() {
  // Precarica form utente con localUser
  document.getElementById("userFirstName").value = localUser.firstName || "";
  document.getElementById("userLastName").value = localUser.lastName || "";
  document.getElementById("userAvatar").value = localUser.avatar || "🙂";

  // Salva gruppo (solo nome, condiviso)
  document.getElementById("saveGroupBtn").addEventListener("click", async () => {
    const input = document.getElementById("groupInput");
    const newName = input.value.trim() || "Famiglia";
    const gRef = groupDocRef();
    await updateDoc(gRef, { groupName: newName });
  });

  // Salva/aggiorna utente (nome, cognome, avatar, foto)
  document.getElementById("saveUserBtn").addEventListener("click", async () => {
    const firstName = document.getElementById("userFirstName").value.trim();
    const lastName = document.getElementById("userLastName").value.trim();
    let avatar = document.getElementById("userAvatar").value.trim();
    if (!avatar) avatar = "🙂";

    const photoInput = document.getElementById("userPhoto");
    let photoURL = localUser.photoURL || null;

    // Se l'utente ha scelto una nuova foto, caricala
    if (photoInput.files && photoInput.files[0]) {
      const file = photoInput.files[0];
      const fileNameSafe =
        (firstName || "user") + "_" + (lastName || "local") + "_" + Date.now();
      const imgRef = storageRef(
        storage,
        `user_photos/${DEFAULT_GROUP_ID}/${fileNameSafe}`
      );
      await uploadBytes(imgRef, file);
      photoURL = await getDownloadURL(imgRef);
    }

    localUser = { firstName, lastName, avatar, photoURL };
    saveLocalUser();

    // Registra l'utente nella lista utenti del gruppo (arrayUnion per evitare duplicati uguali)
    const gRef = groupDocRef();
    const userObj = {
      firstName,
      lastName,
      avatar,
      photoURL: photoURL || null,
    };

    const gSnap = await getDoc(gRef);
    if (gSnap.exists()) {
      const data = gSnap.data();
      const users = data.users || [];
      // rimpiazziamo se esiste già un utente con stesso nome/cognome
      const existingIndex = users.findIndex(
        (u) =>
          (u.firstName || "") === firstName &&
          (u.lastName || "") === lastName
      );
      if (existingIndex >= 0) {
        users[existingIndex] = userObj;
        await updateDoc(gRef, { users });
      } else {
        users.push(userObj);
        await updateDoc(gRef, { users });
      }
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
        photoURL: localUser.photoURL || null,
        time: new Date().toISOString(),
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

// ---- Init ----
async function init() {
  loadLocalUser();
  await initGroupInFirestoreIfNeeded();
  setupEvents();
  subscribeToGroupChanges(); // attach listener realtime
}

window.addEventListener("DOMContentLoaded", () => {
  init().catch((e) => console.error(e));
});
