import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithRedirect,
  getRedirectResult,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD7WwW35Cq_aXBHnZsHfu4rW0RvPcFFQWs",
  authDomain: "glow-up-web.firebaseapp.com",
  projectId: "glow-up-web",
  storageBucket: "glow-up-web.firebasestorage.app",
  messagingSenderId: "301169460622",
  appId: "1:301169460622:web:12f61cbd2a314285b550df",
  measurementId: "G-NXKC3XYG9N"
};

export const REPORTS_KEY = "dailyReports";
export const SELECTED_DAY_KEY = "selectedReportDay";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

let currentUser = null;
let authReadyResolve;

export const authReady = new Promise(resolve => {
  authReadyResolve = resolve;
});

onAuthStateChanged(auth, user => {
  currentUser = user;
  updateAuthUI(user);
  authReadyResolve?.(user);
});

getRedirectResult(auth)
  .then(async result => {
    if (result?.user) {
      currentUser = result.user;
      await syncLocalReportsToCloud();
      window.dispatchEvent(new CustomEvent("glowup-auth-changed"));
    }
  })
  .catch(error => {
    console.error("Redirect sign-in failed", error);
  });

export function getCurrentUser() {
  return currentUser;
}

export function normalizeReports(value) {
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

export function getLocalReports() {
  try {
    return normalizeReports(JSON.parse(localStorage.getItem(REPORTS_KEY)) || []);
  } catch (error) {
    console.error("Could not read local reports", error);
    return [];
  }
}

export function saveLocalReports(reports) {
  const normalized = normalizeReports(reports);
  localStorage.setItem(REPORTS_KEY, JSON.stringify(normalized));
  return normalized;
}

function mergeReports(localReports, cloudReports) {
  const map = new Map();

  [...localReports, ...cloudReports].forEach(report => {
    const id = report.dateKey || report.id;
    if (!id) return;

    const existing = map.get(id);

    if (!existing) {
      map.set(id, report);
      return;
    }

    const existingTime = Date.parse(existing.savedTimestamp || existing.updatedAt || "") || 0;
    const nextTime = Date.parse(report.savedTimestamp || report.updatedAt || "") || 0;

    map.set(id, nextTime >= existingTime ? report : existing);
  });

  return normalizeReports([...map.values()]);
}

function reportsCollectionRef(user = currentUser) {
  if (!user) return null;
  return collection(db, "users", user.uid, "reports");
}

function reportDocRef(dateKey, user = currentUser) {
  if (!user || !dateKey) return null;
  return doc(db, "users", user.uid, "reports", dateKey);
}

export async function getCloudReports() {
  await authReady;

  if (!currentUser) return [];

  const snapshot = await getDocs(reportsCollectionRef());

  return normalizeReports(
    snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }))
  );
}

export async function syncLocalReportsToCloud(reports = getLocalReports()) {
  await authReady;

  if (!currentUser) return;

  await Promise.all(
    normalizeReports(reports).map(report => {
      const ref = reportDocRef(report.dateKey);

      return setDoc(
        ref,
        {
          ...report,
          cloudUpdatedAt: serverTimestamp()
        },
        { merge: true }
      );
    })
  );
}

export async function loadReports() {
  const localReports = getLocalReports();

  await authReady;

  if (!currentUser) {
    return localReports;
  }

  const cloudReports = await getCloudReports();
  const merged = mergeReports(localReports, cloudReports);

  saveLocalReports(merged);
  await syncLocalReportsToCloud(merged);

  return merged;
}

export async function saveReport(report) {
  const localReports = getLocalReports();
  const existingIndex = localReports.findIndex(item => item.dateKey === report.dateKey);

  if (existingIndex >= 0) {
    localReports[existingIndex] = report;
  } else {
    localReports.push(report);
  }

  const savedReports = saveLocalReports(localReports);
  localStorage.setItem(SELECTED_DAY_KEY, report.dateKey);

  await authReady;

  if (currentUser) {
    const ref = reportDocRef(report.dateKey);

    await setDoc(
      ref,
      {
        ...report,
        cloudUpdatedAt: serverTimestamp()
      },
      { merge: true }
    );
  }

  return savedReports;
}

export async function deleteReport(dateKey) {
  const updated = getLocalReports().filter(report => report.dateKey !== dateKey);
  saveLocalReports(updated);

  await authReady;

  if (currentUser) {
    await deleteDoc(reportDocRef(dateKey));
  }

  return updated;
}

export async function clearReports() {
  saveLocalReports([]);
  localStorage.removeItem(SELECTED_DAY_KEY);

  await authReady;

  if (currentUser) {
    const snapshot = await getDocs(reportsCollectionRef());
    const batch = writeBatch(db);

    snapshot.docs.forEach(item => batch.delete(item.ref));

    await batch.commit();
  }
}

export function createAuthPanel() {
  if (document.getElementById("authPanel")) return;

  const header = document.querySelector(".hero");
  const nav = document.querySelector(".top-nav");

  const panel = document.createElement("div");
  panel.id = "authPanel";
  panel.className = "auth-panel";

  panel.innerHTML = `
    <div class="auth-help">
      <button type="button" class="auth-help-button" aria-label="Подсказка">?</button>
      <div class="auth-tooltip">
        Войди через Google, чтобы синхронизировать отчёты между телефоном и ноутбуком.
      </div>
    </div>

    <span id="authStatus"></span>

    <button type="button" id="signInButton" class="small-button">
      Войти через Google
    </button>

    <button type="button" id="signOutButton" class="small-button secondary" hidden>
      Выйти
    </button>
  `;

  if (header && nav) {
    nav.insertAdjacentElement("afterend", panel);
  } else {
    document.body.prepend(panel);
  }

  document.getElementById("signInButton")?.addEventListener("click", async () => {
    try {
      await signInWithRedirect(auth, provider);
    } catch (error) {
      console.error("Google sign-in failed", error);
      alert(
        "Не получилось войти через Google. Проверь Firebase → Authentication → Settings → Authorized domains."
      );
    }
  });

  document.getElementById("signOutButton")?.addEventListener("click", async () => {
    await signOut(auth);
    window.dispatchEvent(new CustomEvent("glowup-auth-changed"));
  });
}

function updateAuthUI(user) {
  const status = document.getElementById("authStatus");
  const signInButton = document.getElementById("signInButton");
  const signOutButton = document.getElementById("signOutButton");

  if (!status || !signInButton || !signOutButton) return;

  if (user) {
    status.textContent = `Синхронизация включена: ${user.email}`;
    signInButton.hidden = true;
    signOutButton.hidden = false;
  } else {
    status.textContent = "";
    signInButton.hidden = false;
    signOutButton.hidden = true;
  }
}
