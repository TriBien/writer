import { FOCUS_OPTIONS, SAMPLE_DRAFT, buildPrompt } from "./prompt.js";
import { PROVIDERS, PROVIDER_LIST } from "./providers.js";
import { renderMarkdown } from "./markdown.js";

const MAX_DRAFT_LENGTH = 20000;
const STORAGE_KEYS = {
  draft: "draftwise:draft",
  focus: "draftwise:focus",
  settings: "draftwise:settings",
};

const elements = {
  form: document.getElementById("feedbackForm"),
  draft: document.getElementById("draft"),
  wordCount: document.getElementById("wordCount"),
  focusChips: document.getElementById("focusChips"),
  formError: document.getElementById("formError"),
  submitButton: document.getElementById("submitButton"),
  submitLabel: document.querySelector("#submitButton .button-label"),
  sampleButton: document.getElementById("sampleButton"),
  providerButton: document.getElementById("providerButton"),
  resultCard: document.getElementById("resultCard"),
  resultBody: document.getElementById("resultBody"),
  resultMeta: document.getElementById("resultMeta"),
  thinking: document.getElementById("thinking"),
  copyButton: document.getElementById("copyButton"),
  retryButton: document.getElementById("retryButton"),
  settingsButton: document.getElementById("settingsButton"),
  settingsDialog: document.getElementById("settingsDialog"),
  settingsForm: document.getElementById("settingsForm"),
  settingsError: document.getElementById("settingsError"),
  providerSelect: document.getElementById("providerSelect"),
  providerHelp: document.getElementById("providerHelp"),
  keyField: document.getElementById("keyField"),
  apiKey: document.getElementById("apiKey"),
  keyHelp: document.getElementById("keyHelp"),
  toggleKey: document.getElementById("toggleKey"),
  modelInput: document.getElementById("modelInput"),
  closeSettings: document.getElementById("closeSettings"),
  cancelSettings: document.getElementById("cancelSettings"),
  toast: document.getElementById("toast"),
  srStatus: document.getElementById("srStatus"),
};

const state = {
  settings: loadSettings(),
  focus: loadFocus(),
  controller: null,
  requestId: 0,
  output: "",
  renderQueued: false,
  loading: false,
  toastTimer: null,
  settingsDraft: null,
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
    return;
  }
}

function loadSettings() {
  const fallback = { provider: "llm7", keys: {}, models: {} };

  try {
    const stored = JSON.parse(readStorage(STORAGE_KEYS.settings) || "null");
    if (!stored || typeof stored !== "object") {
      return fallback;
    }

    return {
      provider: PROVIDERS[stored.provider] ? stored.provider : "llm7",
      keys: stored.keys && typeof stored.keys === "object" ? stored.keys : {},
      models: stored.models && typeof stored.models === "object" ? stored.models : {},
    };
  } catch {
    return fallback;
  }
}

function saveSettings() {
  writeStorage(STORAGE_KEYS.settings, JSON.stringify(state.settings));
}

function loadFocus() {
  const stored = readStorage(STORAGE_KEYS.focus);
  return FOCUS_OPTIONS.some((option) => option.id === stored) ? stored : "general";
}

function currentProvider() {
  return PROVIDERS[state.settings.provider] || PROVIDERS.llm7;
}

function providerKey(providerId) {
  return (state.settings.keys[providerId] || "").trim();
}

function providerModel(providerId) {
  const provider = PROVIDERS[providerId] || PROVIDERS.llm7;
  return (state.settings.models[providerId] || "").trim() || provider.defaultModel;
}

function updateWordCount() {
  const text = elements.draft.value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  elements.wordCount.textContent = `${words.toLocaleString()} ${words === 1 ? "word" : "words"}`;
}

function autosizeDraft() {
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

function buildFocusChips() {
  elements.focusChips.replaceChildren();

  FOCUS_OPTIONS.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.dataset.focus = option.id;
    button.textContent = option.label;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", String(option.id === state.focus));
    button.tabIndex = option.id === state.focus ? 0 : -1;
    button.addEventListener("click", () => selectFocus(option.id));
    elements.focusChips.append(button);
  });
}

function selectFocus(focusId) {
  state.focus = focusId;
  writeStorage(STORAGE_KEYS.focus, focusId);

  elements.focusChips.querySelectorAll(".chip").forEach((chip) => {
    const selected = chip.dataset.focus === focusId;
    chip.setAttribute("aria-checked", String(selected));
    chip.tabIndex = selected ? 0 : -1;
  });
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
  elements.copyButton.disabled = true;
  elements.retryButton.hidden = true;
  elements.resultMeta.textContent = model ? `${provider.label} · ${model}` : provider.label;
  elements.resultMeta.title = model || "";
  window.requestAnimationFrame(scrollToResult);
}

function finishResult(startedAt) {
  elements.resultCard.setAttribute("aria-busy", "false");
  elements.resultBody.innerHTML = renderMarkdown(state.output);
  elements.resultBody.classList.remove("is-streaming");
  elements.thinking.hidden = true;
  elements.copyButton.disabled = !state.output.trim();
  elements.retryButton.hidden = false;
  const seconds = Math.max(0.1, (performance.now() - startedAt) / 1000).toFixed(1);
  const provider = currentProvider();
  elements.resultMeta.textContent = `${provider.label} · ${seconds}s`;
  elements.resultMeta.title = providerModel(provider.id);
}

function errorCopy(error) {
  const status = Number(error.status);
  const message = String(error.message || "");

  if (status === 401 || status === 403) {
    return {
      title: "The API key was rejected",
      message: "Open settings and check that your key is correct and still active.",
      settings: true,
    };
  }

  if (status === 429) {
    return {
      title: "Rate limit reached",
      message: "You have hit the provider's free limit for now. Wait a few minutes or switch to another provider.",
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
      message: "Check your internet connection and try again. The keyless LLM7 option is the most reliable.",
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
  const prompt = buildPrompt(text, state.focus);
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

    finishResult(startedAt);
    announce("Feedback ready.");
    elements.resultMeta.title = model;
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

async function copyFeedback() {
  if (!state.output.trim()) {
    return;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(state.output);
    } else {
      const area = document.createElement("textarea");
      area.value = state.output;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    showToast("Feedback copied");
  } catch {
    showToast("Could not copy — select the text manually.");
  }
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
  saveSettings();
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

  elements.focusChips.addEventListener("keydown", (event) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    if (!keys.includes(event.key)) {
      return;
    }

    event.preventDefault();
    const index = FOCUS_OPTIONS.findIndex((option) => option.id === state.focus);
    const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const next = FOCUS_OPTIONS[(index + direction + FOCUS_OPTIONS.length) % FOCUS_OPTIONS.length];
    selectFocus(next.id);
    elements.focusChips.querySelector(`[data-focus="${next.id}"]`)?.focus();
  });

  elements.sampleButton.addEventListener("click", () => {
    elements.draft.value = SAMPLE_DRAFT;
    elements.draft.dispatchEvent(new Event("input", { bubbles: true }));
    writeStorage(STORAGE_KEYS.draft, SAMPLE_DRAFT);
    elements.draft.focus();
  });

  elements.copyButton.addEventListener("click", copyFeedback);

  elements.retryButton.addEventListener("click", () => {
    elements.form.requestSubmit();
  });

  elements.settingsButton.addEventListener("click", () => openSettings());
  elements.providerButton.addEventListener("click", () => openSettings());

  elements.closeSettings.addEventListener("click", () => elements.settingsDialog.close());
  elements.cancelSettings.addEventListener("click", () => elements.settingsDialog.close());

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
  buildFocusChips();
  updateProviderLine();
  bindEvents();

  if (state.themeMeta) {
    state.themeMeta.content = window.matchMedia("(prefers-color-scheme: dark)").matches ? "#141210" : "#f5f1e8";
  }
}

init();
