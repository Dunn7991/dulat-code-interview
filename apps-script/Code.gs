/**
 * DULAT CODE — запись на собеседование (27.09.2026)
 * Google Apps Script (backend для формы)
 *
 * Структура листа «Слоты»:
 *   A: Время        — например 11:30 (заполняете вы)
 *   B: ФИО          — заполняет скрипт
 *   C: Telegram     — заполняет скрипт
 *   D: Дата записи  — заполняет скрипт
 *
 * Слот считается свободным, если в колонке B пусто.
 */

const SHEET_NAME = 'Слоты';
const HEADER_ROWS = 1;
const COL_TIME = 1;      // A
const COL_NAME = 2;      // B
const COL_TELEGRAM = 3;  // C
const COL_CREATED = 4;   // D

// Один человек (ФИО или Telegram) может занять только один слот
const ONE_BOOKING_PER_PERSON = true;

const TELEGRAM_RE = /^@[A-Za-z][A-Za-z0-9_]{4,31}$/;


/* ---------- GET: список свободных слотов ---------- */

function doGet() {
  try {
    const rows = readRows_(getSheet_());
    const slots = rows.filter((row) => !row.name).map((row) => row.time);

    return json_({ ok: true, slots: slots, total: rows.length });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server', message: 'Ошибка сервера. Попробуйте позже.' });
  }
}


/* ---------- POST: запись на слот ---------- */

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fullName = cleanName_(data.fullName);
    const telegram = cleanTelegram_(data.telegram);
    const time = String(data.time || '').trim();

    if (fullName.length < 2) {
      return json_({ ok: false, error: 'invalid_name', message: 'Введите ФИО.' });
    }
    if (!TELEGRAM_RE.test(telegram)) {
      return json_({
        ok: false,
        error: 'invalid_telegram',
        message: 'Укажите корректный ник Telegram, например @ivan_dev.'
      });
    }
    if (!time) {
      return json_({ ok: false, error: 'invalid_time', message: 'Выберите время собеседования.' });
    }

    // Только один запрос одновременно проверяет и записывает слот.
    if (!lock.tryLock(10000)) {
      return json_({ ok: false, error: 'busy', message: 'Сервер занят, попробуйте ещё раз.' });
    }

    const sheet = getSheet_();
    const rows = readRows_(sheet);

    if (ONE_BOOKING_PER_PERSON) {
      const already = rows.find((r) => r.name && (
        normalize_(r.name) === normalize_(fullName) ||
        normalize_(r.telegram) === normalize_(telegram)
      ));
      if (already) {
        return json_({
          ok: false,
          error: 'already_booked',
          message: 'Вы уже записаны на ' + already.time + '.'
        });
      }
    }

    const slot = rows.find((r) => r.time === time);

    if (!slot) {
      return json_({ ok: false, error: 'not_found', message: 'Такого времени нет в расписании.' });
    }
    if (slot.name) {
      return json_({ ok: false, error: 'taken', message: 'Это время уже заняли. Выберите другое.' });
    }

    sheet.getRange(slot.rowNumber, COL_NAME, 1, 3)
      .setValues([[fullName, telegram, new Date()]]);
    SpreadsheetApp.flush(); // записать до снятия блокировки

    return json_({
      ok: true,
      time: time,
      message: 'Готово! Вы записаны на 27.09.2026 в ' + time + '.'
    });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server', message: 'Ошибка сервера. Попробуйте позже.' });
  } finally {
    lock.releaseLock();
  }
}


/* ---------- Первичная настройка листа (запустить вручную) ---------- */

function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

  sheet.getRange(1, 1, 1, 4)
    .setValues([['Время', 'ФИО', 'Telegram', 'Дата записи']])
    .setFontWeight('bold');
  sheet.setFrozenRows(1);

  // «Время» и «Telegram» — обычный текст (иначе 11:30 превратится в дату)
  sheet.getRange('A:A').setNumberFormat('@');
  sheet.getRange('C:C').setNumberFormat('@');

  if (sheet.getLastRow() < 2) {
    const demo = ['11:30', '11:40', '12:00', '12:10', '12:25', '12:45'].map((t) => [t]);
    sheet.getRange(2, 1, demo.length, 1).setValues(demo);
  }
}


/* ---------- Вспомогательные функции ---------- */

function getSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Лист «' + SHEET_NAME + '» не найден. Запустите setupSheet().');
  return sheet;
}

function readRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= HEADER_ROWS) return [];

  const values = sheet
    .getRange(HEADER_ROWS + 1, COL_TIME, lastRow - HEADER_ROWS, 3)
    .getDisplayValues();

  return values
    .map((v, i) => ({
      rowNumber: HEADER_ROWS + 1 + i,
      time: String(v[0]).trim(),
      name: String(v[1]).trim(),
      telegram: String(v[2]).trim()
    }))
    .filter((row) => row.time);
}

function cleanName_(value) {
  let name = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  // Защита от формул в таблице (=, +, -, @ в начале строки)
  if (/^[=+\-@]/.test(name)) name = "'" + name;
  return name;
}

function cleanTelegram_(value) {
  let nick = String(value || '').replace(/\s+/g, '');
  nick = nick.replace(/^@+/, '');
  nick = nick.replace(/^(https?:\/\/)?(www\.)?(t\.me|telegram\.me)\//i, '');
  nick = nick.replace(/^@+/, '');
  return nick ? '@' + nick : '';
}

function normalize_(s) {
  return String(s || '').replace(/^'/, '').toLowerCase().replace(/ё/g, 'е').trim();
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
