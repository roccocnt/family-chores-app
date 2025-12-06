// Versione locale: tutto salvato SOLO su questo dispositivo, via localStorage
const STORAGE_KEY = "family_home_app_v1";

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

// ----- localStorage -----
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = JSON.parse(raw);
    }
  } catch (e) {
    console.error("Errore caricando lo stato:", e);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getCurrentUserFullName() {
  const { firstName, lastName } = state.currentUser;
  const full = `${firstName || ""} ${lastName || ""}`.trim();
  return full || "Utente anonimo";
}

// ----- Render UI -----
function renderHeader() {
  const groupNameEl = document.getElementById("groupName");
  const userNameEl = document.getElementById("currentUserName");
  const avatarEl = document.getElementById("currentUserAvatar");

  if (groupNameEl) {
    groupNameEl.textContent = "Gruppo: " + (state.groupName || "Famiglia");
  }

  if (userNameEl) {
    userNameEl.textContent = getCurrentUserFullName();
  }

  if (avatarEl) {
    avatarEl.textContent = state.currentUser.avatar || "🙂";
    avatarEl.style.backgroundImage = "none";
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
    const booking = state.bookings[key];
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

  state.shopping.forEach((item, index) => {
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
      state.shopping.splice(index, 1);
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
  const checkboxes = document.querySelectorAll(
    ".cleaning-item input[type='checkbox']"
  );
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

// ----- Eventi -----
function setupEvents() {
  // Precarica i campi con lo stato salvato
  const groupInput = document.getElementById("groupInput");
  const userFirstNameInput = document.getElementById("userFirstName");
  const userLastNameInput = document.getElementById("userLastName");
  const userAvatarInput = document.getElementById("userAvatar");

  if (groupInput) groupInput.value = state.groupName || "";
  if (userFirstNameInput)
    userFirstNameInput.value = state.currentUser.firstName || "";
  if (userLastNameInput)
    userLastNameInput.value = state.currentUser.lastName || "";
  if (userAvatarInput)
    userAvatarInput.value = state.currentUser.avatar || "🙂";

  // Salvataggio gruppo
  const saveGroupBtn = document.getElementById("saveGroupBtn");
  if (saveGroupBtn && groupInput) {
    saveGroupBtn.addEventListener("click", () => {
      state.groupName = groupInput.value.trim() || "Famiglia";
      saveState();
      renderHeader();
    });
  }

  // Salvataggio utente
  const saveUserBtn = document.getElementById("saveUserBtn");
  if (saveUserBtn && userFirstNameInput && userLastNameInput && userAvatarInput) {
    saveUserBtn.addEventListener("click", () => {
      const firstName = userFirstNameInput.value.trim();
      const lastName = userLastNameInput.value.trim();
      let avatar = userAvatarInput.value.trim();
      if (!avatar) avatar = "🙂";

      state.currentUser = { firstName, lastName, avatar };
      saveState();
      renderHeader();
      alert("Utente impostato su questo dispositivo!");
    });
  }

  // Prenotazioni
  document.querySelectorAll(".book-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.type;
      state.bookings[type] = {
        userName: getCurrentUserFullName(),
        avatar: state.currentUser.avatar,
        time: new Date().toISOString(),
      };
      saveState();
      renderBookings();
    });
  });

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
  if (shoppingForm && shoppingInput) {
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

      state.board.unshift({
        text,
        author: getCurrentUserFullName(),
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
      state.cleaning[zone] = cb.checked;
      saveState();
    });
  });
}

// ----- Init -----
loadState();
window.addEventListener("DOMContentLoaded", () => {
  setupEvents();
  renderAll();
});
