// ↓↓↓ Вставьте сюда URL веб-приложения Apps Script (заканчивается на /exec)
const API_URL = "https://script.google.com/macros/s/AKfycbwRRNDT6yD_E2k5pPNraYAq54sbeaSsXalMJLdaG8Nnn6XXV7_fPUMq9Vl_QYHKW3KQ/exec";

const timeList = document.querySelector("#time-list");
const form = document.querySelector("#interview-form");
const nameInput = document.querySelector("#full-name");
const submitButton = document.querySelector(".submit-button");
const message = document.querySelector("#message");

let selectedTime = null;
let isSubmitting = false;

/* ---------- Загрузка свободных слотов из таблицы ---------- */

async function loadTimes() {
  selectedTime = null;
  setListStatus("Загружаем свободное время…");
  submitButton.disabled = true;

  if (!API_URL.startsWith("https://")) {
    setListStatus("Не указан адрес Apps Script в app.js (API_URL).");
    return;
  }

  try {
    const response = await fetch(API_URL, { cache: "no-store" });
    const data = await response.json();

    if (!data.ok) throw new Error(data.message);

    renderTimes(data.slots);
  } catch (error) {
    console.error(error);
    setListStatus("Не удалось загрузить время.");
    showMessage("Проверьте интернет и обновите страницу.", "error");
  }
}

function renderTimes(times) {
  timeList.innerHTML = "";

  if (!times.length) {
    setListStatus("Свободного времени больше нет.");
    return;
  }

  times.forEach((time) => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "time-button";
    button.textContent = time;
    button.setAttribute("aria-pressed", "false");

    button.addEventListener("click", () => {
      selectedTime = time;

      timeList.querySelectorAll(".time-button").forEach((item) => {
        item.classList.remove("selected");
        item.setAttribute("aria-pressed", "false");
      });

      button.classList.add("selected");
      button.setAttribute("aria-pressed", "true");
      showMessage("", "");
    });

    timeList.appendChild(button);
  });

  submitButton.disabled = false;
}

function setListStatus(text) {
  timeList.innerHTML = "";
  const p = document.createElement("p");
  p.className = "time-list-status";
  p.textContent = text;
  timeList.appendChild(p);
}

/* ---------- Отправка формы ---------- */

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isSubmitting) return;

  const fullName = nameInput.value.trim();

  if (!fullName) {
    showMessage("Введите ФИО.", "error");
    return;
  }

  if (!selectedTime) {
    showMessage("Выберите время собеседования.", "error");
    return;
  }

  setSubmitting(true);

  try {
    // text/plain — чтобы браузер не делал preflight-запрос,
    // который Apps Script не поддерживает
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ fullName, time: selectedTime })
    });
    const data = await response.json();

    if (data.ok) {
      showMessage(data.message, "success");
      form.reset();
      await loadTimes();
      return;
    }

    showMessage(data.message || "Не удалось записаться.", "error");

    // Слот заняли — обновляем список, чтобы он исчез
    if (data.error === "taken" || data.error === "not_found") {
      await loadTimes();
    }
  } catch (error) {
    console.error(error);
    showMessage("Ошибка соединения. Попробуйте ещё раз.", "error");
  } finally {
    setSubmitting(false);
  }
});

function setSubmitting(state) {
  isSubmitting = state;
  submitButton.disabled = state || !timeList.querySelector(".time-button");
  submitButton.textContent = state ? "Отправляем…" : "Записаться";
}

function showMessage(text, type) {
  message.textContent = text;
  message.className = type ? `message ${type}` : "message";
}

loadTimes();
