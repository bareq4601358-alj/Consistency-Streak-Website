const STORAGE_KEY = "streak-marker-days-v3";
const LEGACY_STORAGE_KEY = "streak-marker-days";
const NOTES_STORAGE_KEY = "streak-marker-notes";
const MS_DAY = 86400000;

let completedDays = loadCompleted();
let viewYear = new Date().getFullYear();
let viewMonth = new Date().getMonth();

const els = {
  calendarGrid: document.getElementById("calendarGrid"),
  monthTitle: document.getElementById("monthTitle"),
  prevMonth: document.getElementById("prevMonth"),
  nextMonth: document.getElementById("nextMonth"),
  streakCount: document.getElementById("streakCount"),
  streakUnit: document.getElementById("streakUnit"),
  streakMessage: document.getElementById("streakMessage"),
  streakHero: document.getElementById("streakHero"),
  monthCompleted: document.getElementById("monthCompleted"),
  bestStreak: document.getElementById("bestStreak"),
  totalCompleted: document.getElementById("totalCompleted"),
  monthRate: document.getElementById("monthRate"),
  notesInput: document.getElementById("notesInput"),
  notesSaved: document.getElementById("notesSaved"),
  toast: document.getElementById("toast"),
};

let notesByMonth = loadNotes();
let notesSaveTimer = null;
let notesSavedTimer = null;
let toggleLock = false;
let skippedKeys = new Set();

function parseCompletedArray(arr) {
  const valid = new Set();
  if (!Array.isArray(arr)) return valid;
  for (const key of arr) {
    if (typeof key !== "string") continue;
    const d = parseKey(key);
    if (Number.isNaN(d.getTime())) continue;
    const normalized = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
    if (key === normalized) valid.add(normalized);
  }
  return valid;
}

function loadCompleted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return parseCompletedArray(JSON.parse(raw));

    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacyRaw) return new Set();

    const legacy = parseCompletedArray(JSON.parse(legacyRaw));
    const isLocal =
      location.hostname === "localhost" || location.hostname === "127.0.0.1";

    if (isLocal && legacy.size > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...legacy]));
      return legacy;
    }

    return new Set();
  } catch {
    return new Set();
  }
}

function saveCompleted() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...completedDays]));
  } catch {
    showToast("Could not save — storage may be full");
  }
}

function monthNotesKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function loadNotes() {
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveNotes() {
  try {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notesByMonth));
  } catch {
    showToast("Could not save notes — storage may be full");
  }
}

function loadNotesForView() {
  const key = monthNotesKey(viewYear, viewMonth);
  els.notesInput.value = notesByMonth[key] || "";
}

function persistNotes() {
  const key = monthNotesKey(viewYear, viewMonth);
  const text = els.notesInput.value;
  if (text.trim()) {
    notesByMonth[key] = text;
  } else {
    delete notesByMonth[key];
  }
  saveNotes();
  showNotesSaved();
}

function showNotesSaved() {
  els.notesSaved.textContent = "Saved";
  els.notesSaved.classList.add("visible");
  clearTimeout(notesSavedTimer);
  notesSavedTimer = setTimeout(() => {
    els.notesSaved.classList.remove("visible");
  }, 1500);
}

function dateKey(year, month, day) {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function getSortedCompleted() {
  return [...completedDays].map(parseKey).sort((a, b) => a - b);
}

function getCalendarToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function isPast(year, month, day) {
  const cell = new Date(year, month, day);
  cell.setHours(0, 0, 0, 0);
  return cell < getCalendarToday();
}

function isFuture(year, month, day) {
  const cell = new Date(year, month, day);
  cell.setHours(0, 0, 0, 0);
  return cell > getCalendarToday();
}

function isToday(year, month, day) {
  const today = getCalendarToday();
  return (
    today.getFullYear() === year &&
    today.getMonth() === month &&
    today.getDate() === day
  );
}

function getDayAriaLabel(monthName, day, { completed, skipped, past, future }) {
  if (completed) return `${monthName} ${day}, completed${past ? ", past" : ""}`;
  if (skipped) return `${monthName} ${day}, missed day${past ? ", past" : ""}`;
  if (past) return `${monthName} ${day}, past`;
  if (future) return `${monthName} ${day}, future`;
  return `${monthName} ${day}, not completed`;
}

/** Red = empty day sandwiched between two green days */
function computeSkippedKeys() {
  const skipped = new Set();
  const sorted = getSortedCompleted();
  if (sorted.length < 2) {
    skippedKeys = skipped;
    return skipped;
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const daysBetween = Math.round((sorted[i + 1] - sorted[i]) / MS_DAY);
    if (daysBetween <= 1) continue;

    const cursor = new Date(sorted[i]);
    cursor.setDate(cursor.getDate() + 1);
    while (cursor < sorted[i + 1]) {
      skipped.add(
        dateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())
      );
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  skippedKeys = skipped;
  return skipped;
}

function isSkipped(year, month, day) {
  return skippedKeys.has(dateKey(year, month, day));
}

/** Count consecutive greens backward from your most recent mark */
function calcCurrentStreak() {
  const sorted = getSortedCompleted();
  if (sorted.length === 0) return 0;

  let streak = 1;
  for (let i = sorted.length - 1; i > 0; i--) {
    const daysBetween = Math.round((sorted[i] - sorted[i - 1]) / MS_DAY);
    if (daysBetween === 1) streak++;
    else break;
  }
  return streak;
}

function calcBestStreak() {
  const sorted = getSortedCompleted();
  if (sorted.length === 0) return 0;

  let best = 1;
  let run = 1;

  for (let i = 1; i < sorted.length; i++) {
    const daysBetween = Math.round((sorted[i] - sorted[i - 1]) / MS_DAY);
    if (daysBetween === 1) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }

  return best;
}

function getMonthStats(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let eligible = 0;
  let done = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    if (isFuture(year, month, d)) continue;
    eligible++;
    if (completedDays.has(dateKey(year, month, d))) done++;
  }

  const rate = eligible > 0 ? Math.round((done / eligible) * 100) : 0;
  return { done, eligible, rate, daysInMonth };
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => els.toast.classList.remove("show"), 2800);
}

function renderCalendar() {
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  els.monthTitle.textContent = `${monthNames[viewMonth]} ${viewYear}`;
  computeSkippedKeys();
  els.calendarGrid.innerHTML = "";

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "day-cell empty";
    els.calendarGrid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKey(viewYear, viewMonth, day);
    const completed = completedDays.has(key);
    const past = isPast(viewYear, viewMonth, day);
    const future = isFuture(viewYear, viewMonth, day);
    const today = isToday(viewYear, viewMonth, day);
    const skipped = isSkipped(viewYear, viewMonth, day);

    const cell = document.createElement("div");
    cell.className = "day-cell";
    cell.setAttribute("role", "gridcell");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day-btn";
    if (completed) btn.classList.add("completed");
    else if (skipped) btn.classList.add("skipped");
    if (today && !past) btn.classList.add("today");
    if (future) btn.classList.add("future");
    if (past) btn.classList.add("past");

    btn.setAttribute(
      "aria-label",
      getDayAriaLabel(monthNames[viewMonth], day, {
        completed,
        skipped,
        past,
        future,
      })
    );
    btn.setAttribute("aria-pressed", completed ? "true" : "false");

    btn.innerHTML = `
      <div class="day-inner">
        <span class="day-face front">${day}</span>
        <span class="day-face back" aria-hidden="true"></span>
      </div>
    `;

    btn.addEventListener("click", () => toggleDay(key));

    cell.appendChild(btn);
    els.calendarGrid.appendChild(cell);
  }
}

function toggleDay(key) {
  if (toggleLock) return;
  toggleLock = true;
  setTimeout(() => {
    toggleLock = false;
  }, 450);

  const streakBefore = calcCurrentStreak();

  if (completedDays.has(key)) {
    completedDays.delete(key);
    saveCompleted();
    renderCalendar();
    updateStats();
    showToast(calcCurrentStreak() === 0 ? "Streak is now zero" : "Day unchecked");
    return;
  }

  completedDays.add(key);
  saveCompleted();
  renderCalendar();
  updateStats();

  const streakAfter = calcCurrentStreak();
  if (streakAfter === 1 && streakBefore === 0) {
    showToast("New streak — 1 day! 🔥");
  } else if (streakAfter > streakBefore) {
    if (streakAfter % 7 === 0) showToast(`${streakAfter} days — one week strong! 🎉`);
    else if (streakAfter % 30 === 0) showToast(`${streakAfter} days — incredible! 🏆`);
    else showToast(`${streakAfter} day streak! 🔥`);
  } else {
    showToast(`${streakAfter} day streak! 🔥`);
  }
}

function updateStats() {
  computeSkippedKeys();
  const streak = calcCurrentStreak();
  const best = calcBestStreak();
  const { done, rate } = getMonthStats(viewYear, viewMonth);

  els.streakCount.textContent = streak;
  els.streakUnit.textContent = streak === 1 ? "day" : "days";
  els.monthCompleted.textContent = done;
  els.bestStreak.textContent = best;
  els.totalCompleted.textContent = completedDays.size;
  els.monthRate.textContent = `${rate}%`;

  els.streakHero.classList.toggle("on-fire", streak >= 3);

  if (streak === 0) {
    els.streakMessage.textContent = "Mark a day to start your streak";
  } else if (streak === 1) {
    els.streakMessage.textContent = "New streak — add the next day in a row";
  } else if (streak < 7) {
    els.streakMessage.textContent = "You're building momentum";
  } else if (streak < 30) {
    els.streakMessage.textContent = "Consistency is your superpower";
  } else {
    els.streakMessage.textContent = "Legendary discipline";
  }

  els.streakCount.classList.remove("bump");
  void els.streakCount.offsetWidth;
  els.streakCount.classList.add("bump");
}

els.notesInput.addEventListener("input", () => {
  clearTimeout(notesSaveTimer);
  notesSaveTimer = setTimeout(persistNotes, 400);
});

function scrollToCalendarOnMobile() {
  if (!window.matchMedia("(max-width: 860px)").matches) return;
  const panel = document.querySelector(".calendar-panel");
  if (panel) {
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

els.prevMonth.addEventListener("click", () => {
  persistNotes();
  viewMonth--;
  if (viewMonth < 0) {
    viewMonth = 11;
    viewYear--;
  }
  renderCalendar();
  updateStats();
  loadNotesForView();
  scrollToCalendarOnMobile();
});

els.nextMonth.addEventListener("click", () => {
  persistNotes();
  viewMonth++;
  if (viewMonth > 11) {
    viewMonth = 0;
    viewYear++;
  }
  renderCalendar();
  updateStats();
  loadNotesForView();
  scrollToCalendarOnMobile();
});

function refreshForNewDay({ goToCurrentMonth = false } = {}) {
  if (goToCurrentMonth) {
    const today = getCalendarToday();
    viewYear = today.getFullYear();
    viewMonth = today.getMonth();
    loadNotesForView();
  }
  renderCalendar();
  updateStats();
}

function scheduleMidnightRefresh() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  setTimeout(() => {
    refreshForNewDay({ goToCurrentMonth: true });
    scheduleMidnightRefresh();
  }, midnight - now);
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshForNewDay();
});

window.addEventListener("pageshow", () => refreshForNewDay());

function cleanupLegacyStorage() {
  localStorage.removeItem("streak-marker-gap-dismissed");
  localStorage.removeItem("streak-marker-data-version");
}

function init() {
  const missing = Object.entries(els).filter(([, el]) => !el);
  if (missing.length) {
    console.error("Streak: missing elements", missing.map(([k]) => k));
    return;
  }

  cleanupLegacyStorage();
  renderCalendar();
  updateStats();
  loadNotesForView();
  scheduleMidnightRefresh();
}

init();
