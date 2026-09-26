// ↓↓↓ Вставьте сюда URL веб-приложения Apps Script (заканчивается на /exec)
const API_URL = "https://script.google.com/macros/s/AKfycbwVZ6wwIDduAQclyGlz2kHezBapQ9VP7tgn2VxejJug5hNQgNiQr1Z55odD1smWodfl/exec";

const timeList = document.querySelector("#time-list");
const form = document.querySelector("#interview-form");
const nameInput = document.querySelector("#full-name");
const telegramInput = document.querySelector("#telegram");
const submitButton = document.querySelector(".submit-button");
const soldOut = document.querySelector("#sold-out");
const message = document.querySelector("#message");

// Ник Telegram: 5–32 символа, латиница, цифры и _, начинается с буквы
const TELEGRAM_RE = /^@[A-Za-z][A-Za-z0-9_]{4,31}$/;

let selectedTime = null;
let isSubmitting = false;

/* ---------- Telegram: автоматически подставляем @ ---------- */

function normalizeTelegram(value) {
  let nick = value.trim().replace(/\s+/g, "");
  nick = nick.replace(/^@+/, "");
  nick = nick.replace(/^(https?:\/\/)?(www\.)?(t\.me|telegram\.me)\//i, "");
  nick = nick.replace(/^@+/, "");
  return nick ? "@" + nick : "";
}

// Пока человек печатает — сразу ставим @ в начало
telegramInput.addEventListener("input", () => {
  const value = telegramInput.value;
  if (value && !value.startsWith("@")) {
    telegramInput.value = "@" + value.replace(/^\s+/, "");
  }
  if (telegramInput.value === "@") telegramInput.value = "";
});

// При выходе из поля — окончательно чистим (ссылки t.me, пробелы, @@)
telegramInput.addEventListener("blur", () => {
  telegramInput.value = normalizeTelegram(telegramInput.value);
});

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
    showSoldOut();
    return;
  }

  form.hidden = false;
  soldOut.hidden = true;

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

function showSoldOut() {
  form.hidden = true;
  soldOut.hidden = false;
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
  const telegram = normalizeTelegram(telegramInput.value);
  telegramInput.value = telegram;

  if (!fullName) {
    showMessage("Введите ФИО.", "error");
    nameInput.focus();
    return;
  }

  if (!TELEGRAM_RE.test(telegram)) {
    showMessage(
      "Укажите ник Telegram: от 5 символов, латиница, цифры и _. Например: @ivan_dev",
      "error"
    );
    telegramInput.focus();
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
      body: JSON.stringify({ fullName, telegram, time: selectedTime })
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
