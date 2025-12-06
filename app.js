// App locale: tutti i dati salvati SOLO su questo dispositivo (localStorage)
// Nessun backend, niente costi, niente billing.

const STORAGE_KEY = "family_home_app_local_v2";

let state = {
  groupName: "Famiglia",
  currentUser: {
    firstName: "",
    lastName: "",
    avatar: "🙂",
    photoData: null, // Base64 della foto (thumbnail)
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

// ------- Helpers localStorage -------
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

function getCurrentUserFullName() {
  const { firstName, lastName } = state.currentUser;
  const full = `${firstName || ""} ${lastName || ""}`.trim();
  return full || "Utente anonimo";
}

// ------- Foto: riduci e converti in Base64 -------
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

// ------- Render UI -------
function renderHeader() {
  document.getElementById("groupName").textContent =
    "Gruppo: " + (state.groupName || "Famiglia");

  document.getElementById("currentUserName").textContent =
    getCurrentUserFullName();

  const avatarEl = document.getElementById("currentUserAvatar");
  avatarEl.style.backgroundSize = "cover";
  avatarEl.style.backgroundPosition = "center";

  if (state.currentUser.photoData) {
    avatarEl.textContent = "";
    avatarEl.style.backgroundImage =
      `url(data:image/jpeg;base64,${state.currentUser.photoData})`;
  } else {
    avatarEl.style.backgroundImage = "none";
    avatarEl.textContent = state.currentUser.avatar || "🙂";
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

// ------- Eventi -------
function setupEvents() {
  // Precarica i campi dalla state
  document.getElementById("groupInput").value = state.groupName || "";
  document.getElementById("userFirstName").value =
    state.currentUser.firstName || "";
  document.getElementById("userLastName").value =
    state.currentUser.lastName || "";
  document.getElementById("userAvatar").value =
    state.currentUser.avatar || "🙂";

  // Salva gruppo
  document.getElementById("saveGroupBtn").addEventListener("click", () => {
    const input = document.getElementById("groupInput");
    state.groupName = input.value.trim() || "Famiglia";
    saveState();
    renderHeader();
  });

  // Salva utente + foto (locale)
  document.getElementById("saveUserBtn").addEventListener("click", async () => {
    const firstName = document.getElementById("userFirstName").value.trim();
    const lastName = document.getElementById("userLastName").value.trim();
    let avatar = document.getElementById("userAvatar").value.trim();
    if (!avatar) avatar = "🙂";

    const photoInput = document.getElementById("userPhoto");
    let photoData = state.currentUser.photoData || null;

    if (photoInput.files && photoInput.files[0]) {
      try {
        photoData = await readImageFileAsBase64Thumbnail(photoInput.files[0]);
      } catch (e) {
        console.error(e);
        alert("Errore nel caricare la foto, uso solo l'emoji.");
      }
    }

    state.currentUser = { firstName, lastName, avatar, photoData };
    saveState();
    renderHeader();
    alert("Utente aggiornato su questo dispositivo!");
  });

  // Prenotazioni
  document.querySelectorAll(".book-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.type;
      state.bookings[type] = {
        userName: getCurrentUserFullName(),
        avatar: state.currentUser.avatar,
        hasPhoto: !!state.currentUser.photoData,
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

// ------- Init -------
loadState();
window.addEventListener("DOMContentLoaded", () => {
  setupEvents();
  renderAll();
});
