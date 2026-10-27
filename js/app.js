import { SAMPLE_DRAFT, buildPrompt, loadDefaultPrompt } from "./prompt.js";
import { PROVIDERS, PROVIDER_LIST } from "./providers.js";
import { renderMarkdown } from "./markdown.js";

const MAX_DRAFT_LENGTH = 20000;
const MAX_PROMPT_LENGTH = 20000;
const HISTORY_LIMIT = 100;
const HISTORY_SIZE_LIMIT = 1000000;
const STORAGE_KEYS = {
  draft: "draftwise:draft",
  settings: "draftwise:settings",
  defaultPrompt: "draftwise:defaultPrompt",
  history: "draftwise:history",
  storageMode: "draftwise:storageMode",
};
const DATA_FILE_FORMAT = "draftwise-data";

const elements = {
  form: document.getElementById("feedbackForm"),
  draft: document.getElementById("draft"),
  wordCount: document.getElementById("wordCount"),
  formError: document.getElementById("formError"),
  submitButton: document.getElementById("submitButton"),
  submitLabel: document.querySelector("#submitButton .button-label"),
  sampleButton: document.getElementById("sampleButton"),
  providerButton: document.getElementById("providerButton"),
  historyButton: document.getElementById("historyButton"),
  historyCount: document.getElementById("historyCount"),
  resultCard: document.getElementById("resultCard"),
  resultBody: document.getElementById("resultBody"),
  resultMeta: document.getElementById("resultMeta"),
  thinking: document.getElementById("thinking"),
  newSessionButton: document.getElementById("newSessionButton"),
  copyButton: document.getElementById("copyButton"),
  retryButton: document.getElementById("retryButton"),
  settingsButton: document.getElementById("settingsButton"),
  settingsDialog: document.getElementById("settingsDialog"),
  settingsForm: document.getElementById("settingsForm"),
  settingsError: document.getElementById("settingsError"),
  storageMode: document.getElementById("storageMode"),
  storageStatus: document.getElementById("storageStatus"),
  chooseDataFile: document.getElementById("chooseDataFile"),
  exportDataFile: document.getElementById("exportDataFile"),
  importDataFile: document.getElementById("importDataFile"),
  fontSizeInput: document.getElementById("fontSizeInput"),
  fontSizeValue: document.getElementById("fontSizeValue"),
  providerSelect: document.getElementById("providerSelect"),
  providerHelp: document.getElementById("providerHelp"),
  keyField: document.getElementById("keyField"),
  apiKey: document.getElementById("apiKey"),
  keyHelp: document.getElementById("keyHelp"),
  toggleKey: document.getElementById("toggleKey"),
  modelInput: document.getElementById("modelInput"),
  promptStatus: document.getElementById("promptStatus"),
  promptButton: document.getElementById("promptButton"),
  promptDialog: document.getElementById("promptDialog"),
  promptForm: document.getElementById("promptForm"),
  promptInput: document.getElementById("promptInput"),
  promptError: document.getElementById("promptError"),
  resetPrompt: document.getElementById("resetPrompt"),
  closePrompt: document.getElementById("closePrompt"),
  cancelPrompt: document.getElementById("cancelPrompt"),
  closeSettings: document.getElementById("closeSettings"),
  cancelSettings: document.getElementById("cancelSettings"),
  historyDialog: document.getElementById("historyDialog"),
  closeHistory: document.getElementById("closeHistory"),
  historyListView: document.getElementById("historyListView"),
  historyDetailView: document.getElementById("historyDetailView"),
  historyTitle: document.getElementById("historyTitle"),
  historySummary: document.getElementById("historySummary"),
  historyList: document.getElementById("historyList"),
  historyEmpty: document.getElementById("historyEmpty"),
  clearHistory: document.getElementById("clearHistory"),
  historyBack: document.getElementById("historyBack"),
  historyDetailMeta: document.getElementById("historyDetailMeta"),
  historyDraft: document.getElementById("historyDraft"),
  historyFeedback: document.getElementById("historyFeedback"),
  historyCopy: document.getElementById("historyCopy"),
  historyDelete: document.getElementById("historyDelete"),
  historyRestore: document.getElementById("historyRestore"),
  toast: document.getElementById("toast"),
  srStatus: document.getElementById("srStatus"),
};

const state = {
  settings: loadSettings(),
  storageMode: readStorage(STORAGE_KEYS.storageMode) === "file" ? "file" : "localStorage",
  dataFileHandle: null,
  fileWriteQueue: Promise.resolve(),
  controller: null,
  requestId: 0,
  output: "",
  renderQueued: false,
  loading: false,
  toastTimer: null,
  settingsDraft: null,
  defaultPrompt: "",
  promptLoadState: "loading",
  history: loadHistory(),
  historyEntry: null,
  themeMeta: document.querySelector('meta[name="theme-color"]'),
};

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    if (state.storageMode !== "file") {
      return;
    }
  }

  if (key !== STORAGE_KEYS.storageMode) {
    scheduleFileSave();
  }
}

function normalizeSettings(stored) {
  const fallback = { provider: "pollinations", keys: {}, models: {}, prompt: "", fontSize: 17 };

  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return fallback;
  }

  return {
    provider: PROVIDERS[stored.provider] ? stored.provider : "pollinations",
    keys: Object.fromEntries(
      Object.entries(stored.keys && typeof stored.keys === "object" && !Array.isArray(stored.keys) ? stored.keys : {})
        .filter(([, value]) => typeof value === "string"),
    ),
    models: Object.fromEntries(
      Object.entries(stored.models && typeof stored.models === "object" && !Array.isArray(stored.models) ? stored.models : {})
        .filter(([, value]) => typeof value === "string"),
    ),
    prompt: typeof stored.prompt === "string" ? stored.prompt : "",
    fontSize: Number.isFinite(stored.fontSize) ? Math.min(Math.max(stored.fontSize, 14), 24) : 17,
  };
}

function loadSettings() {
  try {
    return normalizeSettings(JSON.parse(readStorage(STORAGE_KEYS.settings) || "null"));
  } catch {
    return normalizeSettings(null);
  }
}

function saveSettings() {
  writeStorage(STORAGE_KEYS.settings, JSON.stringify(state.settings));
}

function applyReadingFontSize(fontSize = state.settings.fontSize) {
  document.documentElement.style.setProperty("--reading-font-scale", String(fontSize / 17));
  elements.fontSizeInput.value = String(fontSize);
  elements.fontSizeValue.value = `${fontSize} px`;
  elements.fontSizeValue.textContent = `${fontSize} px`;
}

function createHistoryId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const draft = typeof entry.draft === "string" ? entry.draft : "";
  const output = typeof entry.output === "string" ? entry.output : "";

  if (!draft.trim() || !output.trim()) {
    return null;
  }

  const createdAt = Number(entry.createdAt);
  const duration = Number(entry.duration);

  return {
    id: typeof entry.id === "string" && entry.id ? entry.id : createHistoryId(),
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    draft,
    output,
    provider: typeof entry.provider === "string" ? entry.provider : "pollinations",
    model: typeof entry.model === "string" ? entry.model : "",
    duration: Number.isFinite(duration) && duration > 0 ? duration : null,
  };
}

function loadHistory() {
  try {
    const stored = JSON.parse(readStorage(STORAGE_KEYS.history) || "[]");
    if (!Array.isArray(stored)) {
      return [];
    }

    return stored
      .map(normalizeHistoryEntry)
      .filter(Boolean)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function writeHistory(entries) {
  let list = entries.slice(0, HISTORY_LIMIT);

  while (list.length) {
    const payload = JSON.stringify(list);

    if (payload.length <= HISTORY_SIZE_LIMIT || state.storageMode === "file") {
      try {
        localStorage.setItem(STORAGE_KEYS.history, payload);
      } catch {
        if (state.storageMode !== "file") {
          list = list.slice(0, -1);
          continue;
        }
      }
      scheduleFileSave();
      return list;
    }

    list = list.slice(0, -1);
  }

  return null;
}

function getDataSnapshot() {
  return {
    format: DATA_FILE_FORMAT,
    version: 1,
    savedAt: new Date().toISOString(),
    draft: elements.draft.value,
    settings: state.settings,
    defaultPrompt: state.defaultPrompt || readStorage(STORAGE_KEYS.defaultPrompt) || "",
    history: state.history,
  };
}

function parseDataSnapshot(text) {
  const data = JSON.parse(text);
  if (
    !data ||
    data.format !== DATA_FILE_FORMAT ||
    data.version !== 1 ||
    typeof data.draft !== "string" ||
    !Array.isArray(data.history)
  ) {
    throw new Error("This is not a valid Draftwise data file.");
  }

  if (data.draft.length > MAX_DRAFT_LENGTH) {
    throw new Error(`The data file contains a draft longer than ${MAX_DRAFT_LENGTH.toLocaleString()} characters.`);
  }

  return {
    draft: data.draft,
    settings: normalizeSettings(data.settings),
    defaultPrompt: typeof data.defaultPrompt === "string" ? data.defaultPrompt : "",
    history: data.history
      .map(normalizeHistoryEntry)
      .filter(Boolean)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, HISTORY_LIMIT),
  };
}

function applyDataSnapshot(data) {
  state.settings = data.settings;
  state.history = data.history;
  state.defaultPrompt = data.defaultPrompt;
  elements.draft.value = data.draft;

  try {
    localStorage.setItem(STORAGE_KEYS.draft, data.draft);
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
    localStorage.setItem(STORAGE_KEYS.defaultPrompt, state.defaultPrompt);
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(state.history));
  } catch {
    // The selected file remains the durable copy when browser storage is unavailable.
  }

  updateWordCount();
  autosizeDraft();
  updateProviderLine();
  updatePromptStatus();
  updateHistoryBadge();
  applyReadingFontSize();
}

function setStorageStatus(message) {
  elements.storageStatus.textContent = message;
}

function openHandleDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("draftwise-storage", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("handles");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open browser file settings."));
  });
}

async function storeDataFileHandle(handle) {
  const database = await openHandleDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction("handles", "readwrite");
    transaction.objectStore("handles").put(handle, "dataFile");
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("Could not remember the selected data file."));
    transaction.onabort = () => reject(transaction.error || new Error("Could not remember the selected data file."));
  });
  database.close();
}

async function getStoredDataFileHandle() {
  const database = await openHandleDatabase();
  const handle = await new Promise((resolve, reject) => {
    const request = database.transaction("handles", "readonly").objectStore("handles").get("dataFile");
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("Could not read the selected data file setting."));
  });
  database.close();
  return handle;
}

function scheduleFileSave() {
  if (state.storageMode !== "file" || !state.dataFileHandle) {
    return;
  }

  state.fileWriteQueue = state.fileWriteQueue.then(async () => {
    if (state.storageMode !== "file" || !state.dataFileHandle) {
      return;
    }

    setStorageStatus("Saving changes to your data file…");
    const writable = await state.dataFileHandle.createWritable();
    try {
      await writable.write(`${JSON.stringify(getDataSnapshot(), null, 2)}\n`);
      await writable.close();
      setStorageStatus(`File mode · changes saved to ${state.dataFileHandle.name}.`);
    } catch (error) {
      await writable.abort().catch(() => {});
      throw error;
    }
  }).catch((error) => {
    setStorageStatus(`Could not save the data file: ${error.message}`);
    showToast("Could not save to the data file. Check file access in Settings.");
  });
}

function downloadDataFile() {
  const file = new Blob([`${JSON.stringify(getDataSnapshot(), null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = "draftwise-data.json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Data file downloaded");
}

function activateFileMode() {
  state.storageMode = "file";
  try {
    localStorage.setItem(STORAGE_KEYS.storageMode, "file");
  } catch {
    // The current selection still applies for this page session.
  }
  elements.storageMode.value = "file";
}

async function chooseDataFile() {
  if (!window.showSaveFilePicker) {
    elements.importDataFile.click();
    elements.storageMode.value = state.storageMode;
    setStorageStatus("Choose a saved file to import, or download a new backup. Saving overwrites from this browser is not available here.");
    return;
  }

  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: "draftwise-data.json",
      types: [{ description: "Draftwise data", accept: { "application/json": [".json"] } }],
    });
    const contents = await (await handle.getFile()).text();
    let imported = null;
    if (contents.trim()) {
      imported = parseDataSnapshot(contents);
      if (!window.confirm("Load the contents of this file? It will replace the data currently shown in Draftwise.")) {
        elements.storageMode.value = state.storageMode;
        return;
      }
    }

    if (imported) {
      applyDataSnapshot(imported);
    }
    state.dataFileHandle = handle;
    activateFileMode();
    try {
      await storeDataFileHandle(handle);
    } catch (error) {
      setStorageStatus(`${error.message} The file is connected for this tab, but may need to be selected again next time.`);
    }
    setStorageStatus(`File mode · saving changes to ${handle.name}.`);
    scheduleFileSave();
  } catch (error) {
    if (error.name !== "AbortError") {
      setStorageStatus(`Could not open the data file: ${error.message}`);
      showToast("Could not open the data file.");
    }
    elements.storageMode.value = state.storageMode;
  }
}

async function restoreFileMode() {
  if (state.storageMode !== "file") {
    elements.storageMode.value = "localStorage";
    setStorageStatus("Your drafts, settings, prompt, and history are saved in this browser.");
    return;
  }

  elements.storageMode.value = "file";
  try {
    const handle = await getStoredDataFileHandle();
    if (!handle || (await handle.queryPermission({ mode: "readwrite" })) !== "granted") {
      setStorageStatus("Reconnect your data file to load it and continue saving.");
      return;
    }

    const data = parseDataSnapshot(await (await handle.getFile()).text());
    state.dataFileHandle = handle;
    applyDataSnapshot(data);
    setStorageStatus(`File mode · changes will be saved to ${handle.name}.`);
  } catch (error) {
    setStorageStatus(`Could not reconnect to your data file: ${error.message}`);
  }
}

async function importDataFile(file) {
  try {
    const imported = parseDataSnapshot(await file.text());
    if (!window.confirm("Load this data file? It will replace the data currently shown in Draftwise.")) {
      return;
    }
    applyDataSnapshot(imported);
    state.dataFileHandle = null;
    activateFileMode();
    setStorageStatus("File mode · imported data is loaded. Download a new data file after making changes to keep a backup.");
    showToast("Data file imported");
  } catch (error) {
    setStorageStatus(`Could not import the data file: ${error.message}`);
    showToast("Could not import the data file.");
  }
}

function countWords(text) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function providerLabel(providerId) {
  return PROVIDERS[providerId]?.label || "Unknown provider";
}

function formatSessionDate(timestamp) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function sessionTitle(draft) {
  const line = draft.split("\n").map((value) => value.trim()).find(Boolean) || "Untitled session";
  return line.length > 72 ? `${line.slice(0, 72).trimEnd()}…` : line;
}

function sessionPreview(output) {
  const text = output
    .slice(0, 4000)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/gm, " ")
    .replace(/[#>*_`~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text.length > 140 ? `${text.slice(0, 140).trimEnd()}…` : text;
}

function currentProvider() {
  return PROVIDERS[state.settings.provider] || PROVIDERS.pollinations;
}

function providerKey(providerId) {
  return (state.settings.keys[providerId] || "").trim();
}

function providerModel(providerId) {
  const provider = PROVIDERS[providerId] || PROVIDERS.pollinations;
  return (state.settings.models[providerId] || "").trim() || provider.defaultModel;
}

function updateWordCount() {
  const words = countWords(elements.draft.value);
  elements.wordCount.textContent = `${words.toLocaleString()} ${words === 1 ? "word" : "words"}`;
}

function autosizeDraft() {
  if (window.matchMedia("(max-width: 559px)").matches) {
    elements.draft.style.height = "";
    return;
  }

  elements.draft.style.height = "auto";
  const height = Math.min(Math.max(elements.draft.scrollHeight, 200), 460);
  elements.draft.style.height = `${height}px`;
}

function saveDraftSoon() {
  window.clearTimeout(saveDraftSoon.timer);
  saveDraftSoon.timer = window.setTimeout(() => {
    writeStorage(STORAGE_KEYS.draft, elements.draft.value);
  }, 250);
}

function setFormError(message) {
  elements.formError.textContent = message || "";
  elements.formError.hidden = !message;
}

function showToast(message) {
  const host = document.querySelector("dialog[open]") || document.body;
  if (elements.toast.parentElement !== host) {
    host.append(elements.toast);
  }

  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2200);
}

function announce(message) {
  elements.srStatus.textContent = "";
  window.requestAnimationFrame(() => {
    elements.srStatus.textContent = message;
  });
}

function updatePromptStatus() {
  const custom = Boolean(state.settings.prompt);
  let label = "Coach prompt · custom";

  if (!custom) {
    if (state.defaultPrompt) {
      label = "Coach prompt · default";
    } else if (state.promptLoadState === "loading") {
      label = "Coach prompt · loading…";
    } else {
      label = "Coach prompt · not loaded";
    }
  }

  elements.promptStatus.textContent = label;
  elements.promptStatus.classList.toggle("is-custom", custom);
  elements.resetPrompt.disabled = !state.defaultPrompt;
}

function setPromptError(message) {
  elements.promptError.textContent = message || "";
  elements.promptError.hidden = !message;
}

function openPrompt() {
  elements.promptInput.value = state.settings.prompt || state.defaultPrompt;
  setPromptError("");
  if (!elements.promptDialog.open) {
    elements.promptDialog.showModal();
  }
  window.setTimeout(() => elements.promptInput.focus(), 80);
}

function savePrompt(event) {
  event.preventDefault();

  const value = elements.promptInput.value.trim();
  if (!value) {
    setPromptError("The coach prompt cannot be empty.");
    elements.promptInput.focus();
    return;
  }

  if (value.length > MAX_PROMPT_LENGTH) {
    setPromptError(`That prompt is too long. Keep it under ${MAX_PROMPT_LENGTH.toLocaleString()} characters.`);
    elements.promptInput.focus();
    return;
  }

  state.settings.prompt = value === state.defaultPrompt.trim() ? "" : value;
  saveSettings();
  updatePromptStatus();
  elements.promptDialog.close();
  showToast(state.settings.prompt ? "Custom prompt applied" : "Default prompt applied");
}

function useDefaultPrompt() {
  if (!state.defaultPrompt) {
    return;
  }

  state.settings.prompt = "";
  saveSettings();
  updatePromptStatus();
  elements.promptDialog.close();
  showToast("Default prompt restored");
}

async function loadCoachPrompt() {
  try {
    state.defaultPrompt = await loadDefaultPrompt();
    writeStorage(STORAGE_KEYS.defaultPrompt, state.defaultPrompt);
    state.promptLoadState = "ready";
  } catch {
    state.defaultPrompt = (readStorage(STORAGE_KEYS.defaultPrompt) || "").trim();
    state.promptLoadState = state.defaultPrompt ? "ready" : "error";
  }

  updatePromptStatus();

  if (
    elements.promptDialog.open &&
    !elements.promptInput.value.trim() &&
    !state.settings.prompt
  ) {
    elements.promptInput.value = state.defaultPrompt;
  }
}

function updateHistoryBadge() {
  const count = state.history.length;
  elements.historyCount.textContent = String(count);
  elements.historyCount.hidden = count === 0;
  elements.historyButton.setAttribute(
    "aria-label",
    count === 0
      ? "Open writing history"
      : `Open writing history, ${count} saved ${count === 1 ? "session" : "sessions"}`,
  );
}

function renderHistory() {
  elements.historyList.replaceChildren();

  const count = state.history.length;
  elements.historyEmpty.hidden = count > 0;
  elements.clearHistory.hidden = count === 0;
  elements.historySummary.textContent = count
    ? `${count} saved ${count === 1 ? "session" : "sessions"} on this device.`
    : "Saved sessions stay in this browser.";

  state.history.forEach((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-item";
    button.dataset.id = entry.id;

    const top = document.createElement("span");
    top.className = "history-item-top";

    const date = document.createElement("span");
    date.className = "history-date";
    date.textContent = formatSessionDate(entry.createdAt);

    const title = document.createElement("span");
    title.className = "history-title";
    title.textContent = sessionTitle(entry.draft);

    const preview = document.createElement("span");
    preview.className = "history-preview";
    preview.textContent = sessionPreview(entry.output);

    const stats = document.createElement("span");
    stats.className = "history-stats";
    const words = countWords(entry.draft).toLocaleString();
    const duration = entry.duration ? ` · ${entry.duration.toFixed(1)}s` : "";
    stats.textContent = `${words} words · ${providerLabel(entry.provider)}${duration}`;

    top.append(date);
    button.append(top, title, preview, stats);
    button.addEventListener("click", () => showHistoryEntry(entry.id));
    elements.historyList.append(button);
  });
}

function scrollHistoryToTop() {
  elements.historyDialog.querySelector(".sheet")?.scrollTo({ top: 0, behavior: "auto" });
}

function focusHistoryList() {
  window.requestAnimationFrame(() => {
    const firstItem = elements.historyList.querySelector(".history-item");
    (firstItem || elements.closeHistory).focus();
  });
}

function showHistoryList() {
  state.historyEntry = null;
  elements.historyListView.hidden = false;
  elements.historyDetailView.hidden = true;
  elements.historyTitle.textContent = "History";
  elements.historyDraft.textContent = "";
  elements.historyFeedback.replaceChildren();
  scrollHistoryToTop();
}

function showHistoryEntry(entryId) {
  const entry = state.history.find((item) => item.id === entryId);

  if (!entry) {
    showHistoryList();
    return;
  }

  state.historyEntry = entry;
  elements.historyListView.hidden = true;
  elements.historyDetailView.hidden = false;
  elements.historyTitle.textContent = "Session";

  const duration = entry.duration ? ` · ${entry.duration.toFixed(1)}s` : "";
  const words = countWords(entry.draft).toLocaleString();
  elements.historyDetailMeta.textContent =
    `${formatSessionDate(entry.createdAt)} · ${words} words · ${providerLabel(entry.provider)}${duration}`;
  elements.historyDetailMeta.title = entry.model || "";
  elements.historyDraft.textContent = entry.draft;
  elements.historyFeedback.innerHTML = renderMarkdown(entry.output);
  elements.historyBack.focus({ preventScroll: true });
  scrollHistoryToTop();
}

function openHistory() {
  showHistoryList();
  renderHistory();
  updateHistoryBadge();

  if (!elements.historyDialog.open) {
    elements.historyDialog.showModal();
  }
}

function saveHistoryEntry({ draft, providerId, model, duration }) {
  const output = state.output.trim();
  if (!draft.trim() || !output) {
    return;
  }

  const entry = normalizeHistoryEntry({
    id: createHistoryId(),
    createdAt: Date.now(),
    draft,
    output,
    provider: providerId,
    model,
    duration,
  });

  if (!entry) {
    return;
  }

  const saved = writeHistory([entry, ...state.history]);
  if (!saved) {
    showToast("Feedback ready, but history could not be saved.");
    return;
  }

  state.history = saved;
  updateHistoryBadge();

  if (elements.historyDialog.open && elements.historyDetailView.hidden) {
    renderHistory();
  }
}

function restoreHistoryDraft() {
  const entry = state.historyEntry;
  if (!entry) {
    return;
  }

  const currentDraft = elements.draft.value.trim();
  if (
    currentDraft &&
    currentDraft !== entry.draft.trim() &&
    !window.confirm("Replace the current draft with this saved session?")
  ) {
    return;
  }

  elements.draft.value = entry.draft;
  elements.draft.dispatchEvent(new Event("input", { bubbles: true }));
  writeStorage(STORAGE_KEYS.draft, entry.draft);
  elements.historyDialog.close();

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  elements.draft.focus({ preventScroll: true });
  elements.draft.scrollIntoView({
    behavior: reduced ? "auto" : "smooth",
    block: "center",
  });
  showToast("Draft restored from history");
}

function deleteHistoryEntry() {
  const entry = state.historyEntry;
  if (!entry) {
    return;
  }

  if (!window.confirm("Delete this saved session? This cannot be undone.")) {
    return;
  }

  const next = state.history.filter((item) => item.id !== entry.id);

  if (next.length) {
    const saved = writeHistory(next);
    if (!saved) {
      showToast("Could not update history.");
      return;
    }
    state.history = saved;
  } else {
    try {
      localStorage.removeItem(STORAGE_KEYS.history);
    } catch {
      if (state.storageMode !== "file") {
        showToast("Could not update history.");
        return;
      }
    }
    state.history = [];
    scheduleFileSave();
  }

  updateHistoryBadge();
  showHistoryList();
  renderHistory();
  focusHistoryList();
  showToast("Session deleted");
}

function clearAllHistory() {
  if (!state.history.length) {
    return;
  }

  const count = state.history.length;
  if (!window.confirm(`Clear all ${count} saved ${count === 1 ? "session" : "sessions"}? This cannot be undone.`)) {
    return;
  }

  try {
    localStorage.removeItem(STORAGE_KEYS.history);
  } catch {
    if (state.storageMode !== "file") {
      showToast("Could not clear history.");
      return;
    }
  }

  state.history = [];
  scheduleFileSave();
  updateHistoryBadge();
  showHistoryList();
  renderHistory();
  focusHistoryList();
  showToast("History cleared");
}

function updateProviderLine() {
  const provider = currentProvider();
  const needsKey = !provider.keyless && !providerKey(provider.id);
  elements.providerButton.textContent = needsKey
    ? `Using ${provider.label} · key needed`
    : `Using ${provider.label}${provider.keyless ? " · no key" : ""}`;
  elements.providerButton.closest(".provider-line").classList.toggle("needs-key", needsKey);
}

function setLoading(loading) {
  state.loading = loading;
  elements.submitButton.disabled = loading;
  elements.submitButton.classList.toggle("is-loading", loading);
  elements.submitLabel.textContent = loading ? "Getting feedback…" : "Get feedback";
}

function scheduleRender() {
  if (state.renderQueued) {
    return;
  }

  state.renderQueued = true;
  window.requestAnimationFrame(() => {
    state.renderQueued = false;
    elements.resultBody.innerHTML = renderMarkdown(state.output);
  });
}

function scrollToResult() {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  elements.resultCard.scrollIntoView({
    behavior: reduced ? "auto" : "smooth",
    block: "start",
  });
}

function startResult(provider, model) {
  elements.resultCard.hidden = false;
  elements.resultCard.setAttribute("aria-busy", "true");
  elements.resultBody.innerHTML = "";
  elements.resultBody.classList.add("is-streaming");
  elements.thinking.hidden = false;
  elements.newSessionButton.hidden = true;
  elements.copyButton.disabled = true;
  elements.retryButton.hidden = true;
  elements.resultMeta.textContent = model ? `${provider.label} · ${model}` : provider.label;
  elements.resultMeta.title = model || "";
  window.requestAnimationFrame(scrollToResult);
}

function finishResult(startedAt, provider, model) {
  elements.resultCard.setAttribute("aria-busy", "false");
  elements.resultBody.innerHTML = renderMarkdown(state.output);
  elements.resultBody.classList.remove("is-streaming");
  elements.thinking.hidden = true;
  elements.newSessionButton.hidden = false;
  elements.copyButton.disabled = !state.output.trim();
  elements.retryButton.hidden = false;
  const duration = Math.max(0.1, (performance.now() - startedAt) / 1000);
  elements.resultMeta.textContent = `${provider.label} · ${duration.toFixed(1)}s`;
  elements.resultMeta.title = model;
  return duration;
}

function errorCopy(error) {
  const status = Number(error.status);
  const message = String(error.message || "");

  if (status === 401 || status === 403) {
    const provider = currentProvider();

    if (provider.keyless) {
      return {
        title: "The provider refused the request",
        message: provider.id === "pollinations"
          ? "Pollinations blocks requests from localhost. Try the deployed site, or choose another provider."
          : "Try again, or switch providers in settings.",
        settings: true,
      };
    }

    return {
      title: "The API key was rejected",
      message: "Open settings and check that your key is correct and still active.",
      settings: true,
    };
  }

  if (status === 429) {
    const retryAfter = Math.ceil(Number(error.retryAfter));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? `Try again in about ${retryAfter} seconds,` : "Wait a minute and try again,";
    const fallback = currentProvider().id === "pollinations"
      ? "or add a free key for Groq, Gemini, or OpenRouter"
      : "switch to Pollinations (no key) or add a free key for Groq, Gemini, or OpenRouter";
    return {
      title: "The free tier is busy",
      message: `${wait} ${fallback}.`,
      settings: true,
    };
  }

  if (status === 402) {
    return {
      title: "This model is not free",
      message: "Choose a free model under Advanced settings, or switch to another provider.",
      settings: true,
    };
  }

  if (/empty response/i.test(message)) {
    return {
      title: "No feedback came back",
      message: "The model returned an empty response. Try again, or switch providers in settings.",
      settings: true,
    };
  }

  if (status >= 500) {
    return {
      title: "The provider is having trouble",
      message: "Try again in a moment, or switch to another provider.",
      settings: true,
    };
  }

  if (error.name === "TypeError" || /fetch|network|connection/i.test(message)) {
    return {
      title: "Could not reach the provider",
      message: "Check your internet connection and try again. The keyless Pollinations option is the most reliable.",
      settings: true,
    };
  }

  return {
    title: "The feedback request failed",
    message: message || "Try again, or switch providers in settings.",
    settings: true,
  };
}

function showResultError(error) {
  const copy = errorCopy(error);
  elements.resultCard.setAttribute("aria-busy", "false");
  elements.resultBody.innerHTML = "";
  elements.resultBody.classList.remove("is-streaming");
  elements.thinking.hidden = true;
  elements.newSessionButton.hidden = true;
  elements.copyButton.disabled = true;
  elements.retryButton.hidden = true;
  elements.resultMeta.textContent = currentProvider().label;

  const panel = document.createElement("div");
  panel.className = "error-panel";

  const title = document.createElement("h3");
  title.textContent = copy.title;

  const message = document.createElement("p");
  message.textContent = copy.message;

  const actions = document.createElement("div");
  actions.className = "error-actions";

  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "Try again";
  retry.addEventListener("click", () => elements.form.requestSubmit());

  actions.append(retry);

  if (copy.settings) {
    const settingsButton = document.createElement("button");
    settingsButton.type = "button";
    settingsButton.textContent = "Open settings";
    settingsButton.addEventListener("click", () => openSettings());
    actions.append(settingsButton);
  }

  const technical = document.createElement("details");
  technical.className = "technical";
  const summary = document.createElement("summary");
  summary.textContent = "Technical details";
  const detail = document.createElement("p");
  detail.textContent = error.message || "Unknown error";
  technical.append(summary, detail);

  panel.append(title, message, actions, technical);
  elements.resultBody.append(panel);
}

async function submitFeedback(event) {
  event.preventDefault();

  const text = elements.draft.value.trim();
  setFormError("");

  if (!text) {
    setFormError("Paste a draft first — even a rough paragraph works.");
    elements.draft.focus();
    return;
  }

  if (text.length < 20) {
    setFormError("Add a little more text so there is something to review.");
    elements.draft.focus();
    return;
  }

  if (text.length > MAX_DRAFT_LENGTH) {
    setFormError(`That draft is too long. Keep it under ${MAX_DRAFT_LENGTH.toLocaleString()} characters.`);
    elements.draft.focus();
    return;
  }

  const promptTemplate = state.settings.prompt || state.defaultPrompt;
  if (!promptTemplate.trim()) {
    if (state.promptLoadState === "loading") {
      setFormError("The coach prompt is still loading. Try again in a moment.");
    } else {
      setFormError("The coach prompt is not available. Add one with Edit prompt.");
      openPrompt();
    }
    return;
  }

  const provider = currentProvider();
  const apiKey = providerKey(provider.id);

  if (!provider.keyless && !apiKey) {
    openSettings({
      focusKey: true,
      message: `Add a free API key to use ${provider.label}.`,
    });
    return;
  }

  if (state.controller) {
    state.controller.abort();
  }

  const requestId = ++state.requestId;
  const controller = new AbortController();
  const model = providerModel(provider.id);
  const prompt = buildPrompt(promptTemplate, text);
  const startedAt = performance.now();

  state.controller = controller;
  state.output = "";

  startResult(provider, model);
  setLoading(true);
  announce(`Getting feedback from ${provider.label}.`);

  try {
    for await (const chunk of provider.stream({
      system: prompt.system,
      user: prompt.user,
      model,
      apiKey,
      signal: controller.signal,
    })) {
      if (requestId !== state.requestId) {
        return;
      }

      state.output += chunk;

      if (!elements.thinking.hidden) {
        elements.thinking.hidden = true;
      }

      scheduleRender();
    }

    if (requestId !== state.requestId) {
      return;
    }

    if (!state.output.trim()) {
      throw new Error("The model returned an empty response.");
    }

    const duration = finishResult(startedAt, provider, model);
    saveHistoryEntry({
      draft: text,
      providerId: provider.id,
      model,
      duration,
    });
    announce("Feedback ready.");
  } catch (error) {
    if (error.name === "AbortError" || requestId !== state.requestId) {
      return;
    }

    showResultError(error);
    announce("The feedback request failed.");
  } finally {
    if (requestId === state.requestId) {
      state.controller = null;
      setLoading(false);
    }
  }
}

async function copyText(value, successMessage) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
    } else {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    showToast(successMessage);
  } catch {
    showToast("Could not copy — select the text manually.");
  }
}

async function copyFeedback() {
  if (!state.output.trim()) {
    return;
  }

  await copyText(state.output, "Feedback copied");
}

function startNewSession() {
  state.controller?.abort();
  state.controller = null;
  state.requestId += 1;
  state.output = "";
  state.renderQueued = false;
  setLoading(false);

  elements.resultCard.hidden = true;
  elements.resultCard.setAttribute("aria-busy", "false");
  elements.resultBody.innerHTML = "";
  elements.resultBody.classList.remove("is-streaming");
  elements.thinking.hidden = true;
  elements.newSessionButton.hidden = true;
  elements.copyButton.disabled = true;
  elements.retryButton.hidden = true;
  elements.resultMeta.textContent = "";
  elements.resultMeta.title = "";

  elements.draft.value = "";
  elements.draft.dispatchEvent(new Event("input", { bubbles: true }));
  window.clearTimeout(saveDraftSoon.timer);
  writeStorage(STORAGE_KEYS.draft, "");
  setFormError("");

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  elements.draft.focus({ preventScroll: true });
  elements.draft.scrollIntoView({
    behavior: reduced ? "auto" : "smooth",
    block: "center",
  });
  showToast("New session started");
  announce("New writing session started.");
}

function setSettingsError(message) {
  elements.settingsError.textContent = message || "";
  elements.settingsError.hidden = !message;
}

function populateProviderFields(providerId) {
  const provider = PROVIDERS[providerId];
  if (!provider) {
    return;
  }

  elements.apiKey.value = state.settingsDraft.keys[providerId] || "";
  elements.modelInput.value = state.settingsDraft.models[providerId] || "";
  elements.modelInput.placeholder = provider.defaultModel;
  elements.keyField.hidden = provider.keyless;
  elements.apiKey.disabled = provider.keyless;
  elements.toggleKey.hidden = provider.keyless;
  elements.apiKey.type = "password";
  elements.toggleKey.setAttribute("aria-pressed", "false");
  elements.toggleKey.setAttribute("aria-label", "Show API key");
  elements.keyHelp.textContent = "Stored only in this browser. Never sent anywhere except the provider.";
  updateProviderHelp(provider);
}

function updateProviderHelp(provider) {
  elements.providerHelp.replaceChildren();
  elements.providerHelp.append(`${provider.description} `);

  if (provider.keyUrl) {
    const link = document.createElement("a");
    link.href = provider.keyUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = provider.keyLinkLabel;
    elements.providerHelp.append(link);
  }
}

function stashProviderFields(providerId) {
  if (!state.settingsDraft || !providerId) {
    return;
  }

  const provider = PROVIDERS[providerId];
  if (!provider) {
    return;
  }

  if (!provider.keyless) {
    state.settingsDraft.keys[providerId] = elements.apiKey.value.trim();
  }

  const model = elements.modelInput.value.trim();
  if (model) {
    state.settingsDraft.models[providerId] = model;
  } else {
    delete state.settingsDraft.models[providerId];
  }
}

function openSettings(options = {}) {
  state.settingsDraft = {
    provider: options.providerId && PROVIDERS[options.providerId] ? options.providerId : state.settings.provider,
    keys: { ...state.settings.keys },
    models: { ...state.settings.models },
  };

  elements.fontSizeInput.value = String(state.settings.fontSize);
  elements.fontSizeValue.value = `${state.settings.fontSize} px`;
  elements.fontSizeValue.textContent = `${state.settings.fontSize} px`;
  elements.providerSelect.value = state.settingsDraft.provider;
  populateProviderFields(state.settingsDraft.provider);
  setSettingsError(options.message || "");

  if (!elements.settingsDialog.open) {
    elements.settingsDialog.showModal();
  }

  if (options.focusKey && !PROVIDERS[state.settingsDraft.provider].keyless) {
    window.setTimeout(() => elements.apiKey.focus(), 120);
  }
}

function saveProviderSettings(event) {
  event.preventDefault();

  stashProviderFields(state.settingsDraft.provider);

  const providerId = elements.providerSelect.value;
  const provider = PROVIDERS[providerId];
  const key = (state.settingsDraft.keys[providerId] || "").trim();

  if (!provider.keyless && !key) {
    setSettingsError(`Add a free API key to use ${provider.label}.`);
    elements.apiKey.focus();
    return;
  }

  state.settings.provider = providerId;
  state.settings.keys = { ...state.settingsDraft.keys };
  state.settings.models = { ...state.settingsDraft.models };
  state.settings.fontSize = Number(elements.fontSizeInput.value);
  saveSettings();
  applyReadingFontSize();
  updateProviderLine();
  elements.settingsDialog.close();
  showToast("Settings saved");
}

function bindEvents() {
  elements.form.addEventListener("submit", submitFeedback);

  elements.draft.addEventListener("input", () => {
    updateWordCount();
    autosizeDraft();
    saveDraftSoon();
    if (!elements.formError.hidden) {
      setFormError("");
    }
  });

  elements.draft.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      elements.form.requestSubmit();
    }
  });

  elements.sampleButton.addEventListener("click", () => {
    elements.draft.value = SAMPLE_DRAFT;
    elements.draft.dispatchEvent(new Event("input", { bubbles: true }));
    writeStorage(STORAGE_KEYS.draft, SAMPLE_DRAFT);
    elements.draft.focus();
  });

  elements.copyButton.addEventListener("click", copyFeedback);
  elements.newSessionButton.addEventListener("click", startNewSession);

  elements.retryButton.addEventListener("click", () => {
    elements.form.requestSubmit();
  });

  elements.historyButton.addEventListener("click", openHistory);
  elements.closeHistory.addEventListener("click", () => elements.historyDialog.close());
  elements.historyBack.addEventListener("click", () => {
    showHistoryList();
    renderHistory();
    focusHistoryList();
  });
  elements.clearHistory.addEventListener("click", clearAllHistory);
  elements.historyDelete.addEventListener("click", deleteHistoryEntry);
  elements.historyRestore.addEventListener("click", restoreHistoryDraft);
  elements.historyCopy.addEventListener("click", () => {
    if (state.historyEntry) {
      copyText(state.historyEntry.output, "Feedback copied");
    }
  });

  elements.historyDialog.addEventListener("click", (event) => {
    if (event.target === elements.historyDialog) {
      elements.historyDialog.close();
    }
  });

  elements.settingsButton.addEventListener("click", () => openSettings());
  elements.providerButton.addEventListener("click", () => openSettings());
  elements.fontSizeInput.addEventListener("input", () => {
    const fontSize = Number(elements.fontSizeInput.value);
    applyReadingFontSize(fontSize);
    elements.fontSizeValue.value = `${fontSize} px`;
    elements.fontSizeValue.textContent = `${fontSize} px`;
  });
  elements.storageMode.addEventListener("change", () => {
    if (elements.storageMode.value === "file") {
      chooseDataFile();
      return;
    }

    state.storageMode = "localStorage";
    try {
      localStorage.setItem(STORAGE_KEYS.storageMode, "localStorage");
    } catch {
      showToast("Could not save the storage preference.");
    }
    setStorageStatus("Your drafts, settings, prompt, and history are saved in this browser.");
  });
  elements.chooseDataFile.addEventListener("click", chooseDataFile);
  elements.exportDataFile.addEventListener("click", downloadDataFile);
  elements.importDataFile.addEventListener("change", async () => {
    const [file] = elements.importDataFile.files || [];
    if (file) {
      await importDataFile(file);
    }
    elements.importDataFile.value = "";
  });

  elements.promptButton.addEventListener("click", openPrompt);
  elements.closePrompt.addEventListener("click", () => elements.promptDialog.close());
  elements.cancelPrompt.addEventListener("click", () => elements.promptDialog.close());
  elements.promptForm.addEventListener("submit", savePrompt);
  elements.resetPrompt.addEventListener("click", useDefaultPrompt);

  elements.promptDialog.addEventListener("click", (event) => {
    if (event.target === elements.promptDialog) {
      elements.promptDialog.close();
    }
  });

  elements.closeSettings.addEventListener("click", () => elements.settingsDialog.close());
  elements.cancelSettings.addEventListener("click", () => elements.settingsDialog.close());
  elements.settingsDialog.addEventListener("close", () => applyReadingFontSize());

  elements.settingsDialog.addEventListener("click", (event) => {
    if (event.target === elements.settingsDialog) {
      elements.settingsDialog.close();
    }
  });

  elements.providerSelect.addEventListener("change", () => {
    stashProviderFields(state.settingsDraft.provider);
    state.settingsDraft.provider = elements.providerSelect.value;
    setSettingsError("");
    populateProviderFields(state.settingsDraft.provider);
  });

  elements.toggleKey.addEventListener("click", () => {
    const showing = elements.apiKey.type === "text";
    elements.apiKey.type = showing ? "password" : "text";
    elements.toggleKey.setAttribute("aria-pressed", String(!showing));
    elements.toggleKey.setAttribute("aria-label", showing ? "Show API key" : "Hide API key");
    elements.apiKey.focus();
  });

  elements.settingsForm.addEventListener("submit", saveProviderSettings);

  window.addEventListener("resize", autosizeDraft);

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
    if (state.themeMeta) {
      state.themeMeta.content = event.matches ? "#141210" : "#f5f1e8";
    }
  });
}

function init() {
  PROVIDER_LIST.forEach((provider) => {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.keyless ? `${provider.label} — free, no key` : `${provider.label} — free API key`;
    elements.providerSelect.append(option);
  });

  elements.draft.value = readStorage(STORAGE_KEYS.draft) || "";
  updateWordCount();
  autosizeDraft();
  applyReadingFontSize();
  updateProviderLine();
  updatePromptStatus();
  updateHistoryBadge();
  bindEvents();
  loadCoachPrompt();
  restoreFileMode();

  if (state.themeMeta) {
    state.themeMeta.content = window.matchMedia("(prefers-color-scheme: dark)").matches ? "#141210" : "#f5f1e8";
  }
}

init();
