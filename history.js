const statsGrid = document.getElementById("statsGrid");
const calendarGrid = document.getElementById("calendarGrid");
const reportDetail = document.getElementById("reportDetail");
const clearReportsButton = document.getElementById("clearReports");
const monthTitle = document.getElementById("monthTitle");
const prevMonthButton = document.getElementById("prevMonth");
const nextMonthButton = document.getElementById("nextMonth");

const REPORTS_KEY = "dailyReports";
const SELECTED_DAY_KEY = "selectedReportDay";

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeReports(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(report => report && (report.dateKey || report.id))
    .map(report => {
      const dateKey = report.dateKey || report.id;
      const tasks = Array.isArray(report.tasks) ? report.tasks : [];
      const fields = Array.isArray(report.fields) ? report.fields : [];
      const total = Number.isFinite(report.total) ? report.total : tasks.length;
      const completed = Number.isFinite(report.completed)
        ? report.completed
        : tasks.filter(task => task.completed).length;

      return {
        ...report,
        id: dateKey,
        dateKey,
        total,
        completed,
        tasks,
        fields
      };
    })
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function getReports() {
  try {
    return normalizeReports(JSON.parse(localStorage.getItem(REPORTS_KEY)) || []);
  } catch (error) {
    return [];
  }
}

function saveReports(reports) {
  localStorage.setItem(REPORTS_KEY, JSON.stringify(normalizeReports(reports)));
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

function renderStats(reports) {
  const totalDays = reports.length;
  const totalCompleted = reports.reduce((sum, report) => sum + (report.completed || 0), 0);
  const totalTasks = reports.reduce((sum, report) => sum + (report.total || 0), 0);
  const average = totalTasks ? Math.round((totalCompleted / totalTasks) * 100) : 0;
  const bestDay = reports.reduce((best, report) => {
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

let reports = getReports();
let selectedId = getSelectedId();

if (reports.length > 0 && !reports.some(report => report.dateKey === selectedId)) {
  selectedId = reports[reports.length - 1].dateKey;
  setSelectedId(selectedId);
}

let currentMonthDate = selectedId
  ? parseDateKey(selectedId)
  : reports.length > 0
    ? parseDateKey(reports[reports.length - 1].dateKey)
    : new Date();

function renderCalendar() {
  reports = getReports();
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
  reports = getReports();
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

  document.getElementById("deleteOne").addEventListener("click", () => {
    const confirmDelete = confirm("Удалить отчёт за этот день?");
    if (!confirmDelete) return;

    const updatedReports = getReports().filter(item => item.dateKey !== report.dateKey);
    saveReports(updatedReports);
    reports = updatedReports;
    selectedId = reports.length ? reports[reports.length - 1].dateKey : null;
    setSelectedId(selectedId);
    currentMonthDate = selectedId ? parseDateKey(selectedId) : new Date();
    renderStats(reports);
    renderCalendar();
    renderReportDetail();
  });
}

function clearReports() {
  const confirmDelete = confirm("Удалить всю историю отчётов?");

  if (confirmDelete) {
    localStorage.removeItem(REPORTS_KEY);
    localStorage.removeItem(SELECTED_DAY_KEY);
    reports = [];
    selectedId = null;
    currentMonthDate = new Date();
    setSelectedId(null);
    renderStats([]);
    renderCalendar();
    renderReportDetail();
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

renderStats(reports);
renderCalendar();
renderReportDetail();
