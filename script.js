(function () {
  const REPORTS_KEY = "dailyReports";
  const SELECTED_DAY_KEY = "selectedReportDay";
  const DRAFT_KEY = "todayDraft";

  const tasks = Array.from(document.querySelectorAll(".task"));
  const progress = document.getElementById("progress");
  const textFields = Array.from(document.querySelectorAll("textarea, input[type='text']"));
  const saveReportButton = document.getElementById("saveReport");
  const saveStatus = document.getElementById("saveStatus");

  function storageWorks() {
    try {
      const testKey = "__glowup_test__";
      localStorage.setItem(testKey, "ok");
      localStorage.removeItem(testKey);
      return true;
    } catch (error) {
      return false;
    }
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

  function getDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDate(date = new Date()) {
    return date.toLocaleDateString("ru-RU", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }

  function formatTime(date = new Date()) {
    return date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function normalizeReports(value) {
    if (!Array.isArray(value)) return [];

    return value
      .filter(report => report && (report.dateKey || report.id))
      .map(report => {
        const dateKey = report.dateKey || report.id;
        const reportTasks = Array.isArray(report.tasks) ? report.tasks : [];
        const fields = Array.isArray(report.fields) ? report.fields : [];
        const total = Number.isFinite(report.total) ? report.total : reportTasks.length;
        const completed = Number.isFinite(report.completed)
          ? report.completed
          : reportTasks.filter(task => task.completed).length;

        return {
          ...report,
          id: dateKey,
          dateKey,
          total,
          completed,
          tasks: reportTasks,
          fields
        };
      })
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }

  function getReports() {
    try {
      return normalizeReports(JSON.parse(localStorage.getItem(REPORTS_KEY)) || []);
    } catch (error) {
      console.error("Could not read reports", error);
      return [];
    }
  }

  function saveReports(reports) {
    const normalized = normalizeReports(reports);
    localStorage.setItem(REPORTS_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function buildCurrentReport() {
    const now = new Date();
    const dateKey = getDateKey(now);

    const taskData = tasks.map((task, index) => ({
      index,
      category: task.dataset.category || "Other",
      name: task.dataset.task || task.closest("label")?.textContent.trim() || `Task ${index + 1}`,
      completed: task.checked
    }));

    const fieldData = textFields.map((field, index) => ({
      index,
      label: field.dataset.label || field.placeholder || `Field ${index + 1}`,
      value: field.value
    }));

    return {
      id: dateKey,
      dateKey,
      date: formatDate(now),
      savedAt: formatTime(now),
      savedTimestamp: now.toISOString(),
      completed: taskData.filter(task => task.completed).length,
      total: taskData.length,
      tasks: taskData,
      fields: fieldData
    };
  }

  function updateProgress() {
    if (!progress) return;
    const completed = tasks.filter(task => task.checked).length;
    progress.textContent = `Выполнено: ${completed} из ${tasks.length}`;
  }

  function saveDraft() {
    try {
      const draft = {
        dateKey: getDateKey(),
        tasks: tasks.map(task => task.checked),
        fields: textFields.map(field => field.value)
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch (error) {
      console.error("Could not save draft", error);
    }
  }

  function restoreDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
      if (!draft || draft.dateKey !== getDateKey()) return;

      tasks.forEach((task, index) => {
        task.checked = Boolean(draft.tasks?.[index]);
      });

      textFields.forEach((field, index) => {
        field.value = draft.fields?.[index] || "";
      });
    } catch (error) {
      console.error("Could not restore draft", error);
    }
  }

  function saveDailyReport() {
    if (!storageWorks()) {
      showToast("Браузер не даёт сохранить данные. Проверь localStorage / private mode.", "error");
      if (saveStatus) saveStatus.textContent = "Ошибка: localStorage недоступен.";
      return;
    }

    try {
      const report = buildCurrentReport();
      const reports = getReports();
      const existingIndex = reports.findIndex(item => item.dateKey === report.dateKey);

      if (existingIndex >= 0) {
        reports[existingIndex] = report;
      } else {
        reports.push(report);
      }

      const savedReports = saveReports(reports);
      const savedReport = savedReports.find(item => item.dateKey === report.dateKey);

      if (!savedReport) {
        throw new Error("Report was not found after saving.");
      }

      localStorage.setItem(SELECTED_DAY_KEY, report.dateKey);
      saveDraft();

      if (saveStatus) {
        saveStatus.innerHTML = `✅ День сохранён. <a href="history.html?day=${report.dateKey}">Открыть в календаре</a>`;
      }

      showToast("✅ День сохранён в историю");
    } catch (error) {
      console.error("Could not save daily report", error);
      showToast("Не получилось сохранить отчёт. Открой Console для ошибки.", "error");
      if (saveStatus) saveStatus.textContent = "Ошибка: отчёт не сохранился.";
    }
  }

  window.resetDay = function resetDay() {
    const confirmReset = confirm("Сбросить день? Это очистит галочки и текст на главной странице. Сохранённые отчёты в History останутся.");
    if (!confirmReset) return;

    tasks.forEach(task => {
      task.checked = false;
    });

    textFields.forEach(field => {
      field.value = "";
    });

    localStorage.removeItem(DRAFT_KEY);
    updateProgress();
    showToast("Форма очищена. История не удалена.");
    if (saveStatus) saveStatus.textContent = "Сегодняшняя форма очищена. Сохранённые отчёты остались в истории.";
  };

  restoreDraft();

  tasks.forEach(task => {
    task.addEventListener("change", () => {
      updateProgress();
      saveDraft();
    });
  });

  textFields.forEach(field => {
    field.addEventListener("input", saveDraft);
  });

  if (saveReportButton) {
    saveReportButton.addEventListener("click", saveDailyReport);
  }

  updateProgress();
})();
