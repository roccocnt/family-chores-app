// Chiave usata in localStorage
const STORAGE_KEY = "family_home_app_v1";

// Stato locale (per ora solo su questo dispositivo)
let state = {
  groupName: "Famiglia",
  currentUser: {
    firstName: "",
    lastName: "",
    avatar: "🙂",
  },
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

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = JSON.parse(raw);
    }
  } catch (e) {
    console.error("Errore nel parsing dello stato", e);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// Helper: nome completo utente
function getCurrentUserFullName() {
  const { firstName, lastName } = state.currentUser;
  const full = `${firstName || ""} ${lastName || ""}`.trim();
  return full || "Utente anonimo";
}

// ---- Rendering UI ----
function renderHeader() {
  document.getElementById("groupName").textContent =
    "Gruppo: " + (state.groupName || "Famiglia");
  document.getElementById("currentUserName").textContent =
    getCurrentUserFullName();
  document.getElementById("currentUserAvatar").textContent =
    state.currentUser.avatar || "🙂";
}

function renderBookings() {
  const mappings = [
    { key: "washing", elId: "washingInfo", label: "Lavatrice" },
    { key: "rack1", elId: "rack1Info", label: "Stendino 1" },
    { key: "rack2", elId: "rack2Info", label: "Stendino 2" },
    { key: "shower", elId: "showerInfo", label: "Doccia" },
  ];

  mappings.forEach(({ key, elId }) => {
    const el = document.getElementById(elId);
    const booking = state.bookings[key];
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

  state.shopping.forEach((item, index) => {
    const li = document.createElement("li");

    const span = document.createElement("span");
    span.textContent = item.text;

    const meta = document.createElement("small");
    meta.textContent = item.addedBy || "";
    meta.style.marginLeft = "8px";
    meta.style.fontSize = "0.7rem";
    meta.style.color = "#666";

    const leftBox = document.createElement("div");
    leftBox.style.display = "flex";
    leftBox.style.flexDirection = "column";
    leftBox.appendChild(span);
    if (item.addedBy) leftBox.appendChild(meta);

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "X";
    deleteBtn.addEventListener("click", () => {
      state.shopping.splice(index, 1);
      saveState();
      renderShopping();
    });

    li.appendChild(leftBox);
    li.appendChild(deleteBtn);
    listEl.appendChild(li);
  });
}

function renderBoard() {
  const listEl = document.getElementById("boardMessages");
  listEl.innerHTML = "";

  state.board.forEach((msg) => {
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
  const checkboxes = document.querySelectorAll(".cleaning-item input[type='checkbox']");
  checkboxes.forEach((cb) => {
    const zone = cb.dataset.zone;
    cb.checked = !!state.cleaning[zone];
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
  // Salva gruppo
  document.getElementById("saveGroupBtn").addEventListener("click", () => {
    const input = document.getElementById("groupInput");
    state.groupName = input.value.trim() || "Famiglia";
    saveState();
    renderHeader();
  });

  // Salva utente
  document.getElementById("saveUserBtn").addEventListener("click", () => {
    const firstName = document.getElementById("userFirstName").value.trim();
    const lastName = document.getElementById("userLastName").value.trim();
    let avatar = document.getElementById("userAvatar").value.trim();
    if (!avatar) avatar = "🙂";
    state.currentUser = { firstName, lastName, avatar };
    saveState();
    renderHeader();
  });

  // Prenotazioni
  document.querySelectorAll(".book-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.type;
      state.bookings[type] = {
        userName: getCurrentUserFullName(),
      };
      saveState();
      renderBookings();
    });
  });

  // Libera prenotazione
  document.querySelectorAll(".clear-booking-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.type;
      state.bookings[type] = null;
      saveState();
      renderBookings();
    });
  });

  // Lista spesa
  const shoppingForm = document.getElementById("shoppingForm");
  const shoppingInput = document.getElementById("shoppingInput");
  shoppingForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = shoppingInput.value.trim();
    if (!text) return;
    state.shopping.push({
      text,
      addedBy: getCurrentUserFullName(),
    });
    shoppingInput.value = "";
    saveState();
    renderShopping();
  });

  // Lavagna
  const boardForm = document.getElementById("boardForm");
  const boardInput = document.getElementById("boardInput");
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
    state.board.unshift({
      text,
      author: getCurrentUserFullName(),
      date: dateStr,
    });
    boardInput.value = "";
    saveState();
    renderBoard();
  });

  // Pulizie
  const cleaningCheckboxes = document.querySelectorAll(
    ".cleaning-item input[type='checkbox']"
  );
  cleaningCheckboxes.forEach((cb) => {
    cb.addEventListener("change", () => {
      const zone = cb.dataset.zone;
      state.cleaning[zone] = cb.checked;
      saveState();
    });
  });
}

// ---- Init ----
loadState();
window.addEventListener("DOMContentLoaded", () => {
  // Pre-carica i campi di testo con i valori salvati (opzionale)
  document.getElementById("groupInput").value = state.groupName || "";
  document.getElementById("userFirstName").value = state.currentUser.firstName || "";
  document.getElementById("userLastName").value = state.currentUser.lastName || "";
  document.getElementById("userAvatar").value = state.currentUser.avatar || "🙂";

  setupEvents();
  renderAll();
});
