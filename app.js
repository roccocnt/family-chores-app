// TEST MINIMO: solo per verificare che lo script venga eseguito

window.addEventListener("DOMContentLoaded", () => {
  alert("JavaScript è stato caricato correttamente!");
  const nameEl = document.getElementById("currentUserName");
  if (nameEl) {
    nameEl.textContent = "Test utente (JS ok)";
  }
});
