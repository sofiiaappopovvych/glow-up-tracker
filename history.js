import {
  createAuthPanel,
  loadReports,
  deleteReport,
  clearReports as clearReportsInStorage,
  SELECTED_DAY_KEY
} from "./firebase-service.js";

createAuthPanel();

const statsGrid = document.getElementById("statsGrid");
const calendarGrid = document.getElementById("calendarGrid");
const reportDetail = document.getElementById("reportDetail");
const clearReportsButton = document.getElementById("clearReports");
const monthTitle = document.getElementById("monthTitle");
const prevMonthButton = document.getElementById("prevMonth");
const nextMonthButton = document.getElementById("nextMonth");

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message, type = "success") {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }

  toast.className = `toast show ${type}`;
  toast.textContent = message;

  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

function getSelectedId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("day") || localStorage.getItem(SELECTED_DAY_KEY);
}

function setSelectedId(id) {
  const url = new URL(window.location.href);

  if (id) {
    url.searchParams.set("day", id);
    localStorage.setItem(SELECTED_DAY_KEY, id);
  } else {
    url.searchParams.delete("day");
    localStorage.removeItem(SELECTED_DAY_KEY);
  }

  window.history.pushState({}, "", url);
}

function formatMonth(date) {
  return date.toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric"
  });
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

function makeDateKey(year, monthIndex, day) {
  const month = String(monthIndex + 1).padStart(2, "0");
  const date = String(day).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

function groupTasksByCategory(tasks) {
  return tasks.reduce((groups, task) => {
    const category = task.category || "Other";
    if (!groups[category]) groups[category] = [];
    groups[category].push(task);
    return groups;
  }, {});
}

let reports = [];
let selectedId = getSelectedId();
let currentMonthDate = new Date();

function renderStats(list) {
  const totalDays = list.length;
  const totalCompleted = list.reduce((sum, report) => sum + (report.completed || 0), 0);
  const totalTasks = list.reduce((sum, report) => sum + (report.total || 0), 0);
  const average = totalTasks ? Math.round((totalCompleted / totalTasks) * 100) : 0;
  const bestDay = list.reduce((best, report) => {
    const score = report.total ? report.completed / report.total : 0;
    const bestScore = best && best.total ? best.completed / best.total : -1;
    return score > bestScore ? report : best;
  }, null);

  statsGrid.innerHTML = `
    <article class="stat-card"><span>${totalDays}</span><p>Saved days</p></article>
    <article class="stat-card"><span>${average}%</span><p>Average checklist completion</p></article>
    <article class="stat-card"><span>${totalCompleted}/${totalTasks}</span><p>Total completed tasks</p></article>
    <article class="stat-card"><span>${bestDay ? bestDay.completed + "/" + bestDay.total : "-"}</span><p>Best saved day</p></article>
  `;
}

function chooseInitialDay() {
  selectedId = getSelectedId();

  if (reports.length > 0 && !reports.some(report => report.dateKey === selectedId)) {
    selectedId = reports[reports.length - 1].dateKey;
    setSelectedId(selectedId);
  }

  currentMonthDate = selectedId
    ? parseDateKey(selectedId)
    : reports.length > 0
      ? parseDateKey(reports[reports.length - 1].dateKey)
      : new Date();
}

function renderCalendar() {
  const reportMap = new Map(reports.map(report => [report.dateKey, report]));

  const year = currentMonthDate.getFullYear();
  const monthIndex = currentMonthDate.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const daysInMonth = lastDay.getDate();
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const totalCells = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;

  monthTitle.textContent = formatMonth(currentMonthDate);

  let html = "";

  for (let cell = 0; cell < totalCells; cell++) {
    const dayNumber = cell - mondayOffset + 1;

    if (dayNumber < 1 || dayNumber > daysInMonth) {
      html += `<div class="calendar-day empty-day"></div>`;
      continue;
    }

    const dateKey = makeDateKey(year, monthIndex, dayNumber);
    const report = reportMap.get(dateKey);
    const hasReport = Boolean(report);
    const isSelected = selectedId === dateKey;
    const percentage = report && report.total ? Math.round((report.completed / report.total) * 100) : 0;

    html += `
      <button type="button" class="calendar-day ${hasReport ? "has-report" : ""} ${isSelected ? "selected-day" : ""}" data-date="${dateKey}" aria-label="${hasReport ? `Открыть отчёт за ${dateKey}` : `Нет отчёта за ${dateKey}`}">
        <span class="day-number">${dayNumber}</span>
        ${hasReport ? `<span class="day-progress">${report.completed}/${report.total} • ${percentage}%</span>` : `<span class="no-report-dot"></span>`}
      </button>
    `;
  }

  calendarGrid.innerHTML = html;

  document.querySelectorAll(".calendar-day.has-report").forEach(dayButton => {
    dayButton.addEventListener("click", () => {
      selectedId = dayButton.dataset.date;
      setSelectedId(selectedId);
      renderCalendar();
      renderReportDetail();
    });
  });
}

function renderReportDetail() {
  const report = reports.find(item => item.dateKey === selectedId || item.id === selectedId);

  if (!report) {
    reportDetail.innerHTML = `<p class="empty">Выбери подсвеченный день в календаре, чтобы открыть полный отчёт.</p>`;
    return;
  }

  const groups = groupTasksByCategory(report.tasks || []);

  const taskHtml = Object.entries(groups).map(([category, tasks]) => {
    const items = tasks.map(task => `
      <li class="${task.completed ? "done" : "not-done"}">
        <span>${task.completed ? "✓" : "○"}</span>${escapeHTML(task.name)}
      </li>
    `).join("");

    return `
      <div class="detail-block">
        <h3>${escapeHTML(category)}</h3>
        <ul class="task-list">${items}</ul>
      </div>
    `;
  }).join("") || `<p class="empty">Checklist не найден.</p>`;

  const fieldHtml = (report.fields || []).map(field => `
    <div class="detail-block">
      <h3>${escapeHTML(field.label)}</h3>
      <p>${escapeHTML(field.value || "-")}</p>
    </div>
  `).join("") || `<p class="empty">Текстовый отчёт не найден.</p>`;

  reportDetail.innerHTML = `
    <div class="report-detail-header">
      <div>
        <p class="eyebrow">Full Saved Report</p>
        <h2>${escapeHTML(report.date || report.dateKey)}</h2>
        <p class="report-score">Saved at ${escapeHTML(report.savedAt || "-")} • Checklist: ${report.completed}/${report.total}</p>
      </div>
      <button type="button" class="danger" id="deleteOne">Удалить этот день</button>
    </div>

    <div class="detail-grid">
      <section>
        <h2>Checklist</h2>
        ${taskHtml}
      </section>
      <section>
        <h2>Text Report</h2>
        ${fieldHtml}
      </section>
    </div>
  `;

  document.getElementById("deleteOne").addEventListener("click", async () => {
    const confirmDelete = confirm("Удалить отчёт за этот день?");
    if (!confirmDelete) return;

    try {
      reports = await deleteReport(report.dateKey);
      selectedId = reports.length ? reports[reports.length - 1].dateKey : null;
      setSelectedId(selectedId);
      currentMonthDate = selectedId ? parseDateKey(selectedId) : new Date();
      renderStats(reports);
      renderCalendar();
      renderReportDetail();
      showToast("День удалён");
    } catch (error) {
      console.error("Could not delete report", error);
      showToast("Не получилось удалить день", "error");
    }
  });
}

async function clearReports() {
  const confirmDelete = confirm("Удалить всю историю отчётов? Это удалит историю и из Firebase, если ты вошла через Google.");

  if (!confirmDelete) return;

  try {
    await clearReportsInStorage();
    reports = [];
    selectedId = null;
    currentMonthDate = new Date();
    setSelectedId(null);
    renderStats([]);
    renderCalendar();
    renderReportDetail();
    showToast("История очищена");
  } catch (error) {
    console.error("Could not clear reports", error);
    showToast("Не получилось очистить историю", "error");
  }
}

async function refreshReports(showSyncedToast = false) {
  try {
    reportDetail.innerHTML = `<p class="empty">Загружаю отчёты...</p>`;
    reports = await loadReports();
    chooseInitialDay();
    renderStats(reports);
    renderCalendar();
    renderReportDetail();
    if (showSyncedToast) showToast("✅ История синхронизирована");
  } catch (error) {
    console.error("Could not load reports", error);
    reportDetail.innerHTML = `<p class="empty">Не получилось загрузить отчёты. Проверь вход в Google и Firestore Rules.</p>`;
    showToast("Не получилось загрузить Firebase-отчёты", "error");
  }
}

prevMonthButton.addEventListener("click", () => {
  currentMonthDate = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() - 1, 1);
  renderCalendar();
});

nextMonthButton.addEventListener("click", () => {
  currentMonthDate = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1);
  renderCalendar();
});

clearReportsButton.addEventListener("click", clearReports);
window.addEventListener("glowup-auth-changed", () => refreshReports(true));

refreshReports(false);
