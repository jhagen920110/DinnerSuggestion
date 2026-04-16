const apiBase = window.APP_CONFIG.apiBase;

let currentUserEmail = "";

async function initAuth() {
  try {
    const res = await fetch("/.auth/me");
    const data = await res.json();
    if (data.clientPrincipal) {
      currentUserEmail = data.clientPrincipal.userDetails || "";
    } else {
      showLoginScreen();
      return;
    }
  } catch {
    // Local dev - no SWA auth
    currentUserEmail = "";
  }
}

function showLoginScreen() {
  const splash = byId("splashScreen");
  if (splash) splash.remove();

  byId("topBar").hidden = true;
  document.querySelector(".tab-bar").hidden = true;
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));

  const loginPage = byId("page-login");
  if (loginPage) {
    loginPage.classList.add("active");
    return;
  }

  const page = document.createElement("div");
  page.id = "page-login";
  page.className = "page active";
  page.innerHTML = `
    <div class="login-screen">
      <div class="login-icon">🍲</div>
      <h1 class="login-title">오늘 뭐 먹지?</h1>
      <p class="login-sub">Google 계정으로 로그인해주세요</p>
      <a href="/.auth/login/google?post_login_redirect_uri=/" class="login-btn">Google로 로그인</a>
    </div>
  `;
  document.querySelector(".app-shell").appendChild(page);
}

async function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (currentUserEmail) {
    headers["X-User-Email"] = currentUserEmail;
  }
  return fetch(url, { ...options, headers });
}

let currentIngredients = [];
let classifyTimer = null;
let editingRowId = null;
let inlineDraft = { name: "", type: "기타" };

let pantryUiState = {
  search: "",
  type: "all",
};

let collapsedSections = {
  "야채": true,
  "탄수화물": true,
  "고기/단백질": true,
  "유제품": true,
  "과일": true,
  "소스/조미료": true,
  "냉동식품": true,
  "기타": true,
};

let pantryCollapsed = false;
let filtersCollapsed = true;
let selectedIngredients = new Set();

// Meals state
let currentMeals = [];
let editingMealId = null;
let mealSearchQuery = "";
let mealCuisineFilter = "all";
let availableTags = [];
let selectedTags = new Set();
let todayLoggedNames = new Set();
let mealFiltersCollapsed = true;
let collapsedMealSections = {};

function byId(id) {
  return document.getElementById(id);
}

function getEls() {
  return {
    ingredientNameInput: byId("ingredientName"),
    typePreview: byId("typePreview"),
    typePreviewValue: byId("typePreviewValue"),
    saveButton: byId("saveButton"),
    suggestButton: byId("suggestButton"),
    suggestionsDiv: byId("suggestions"),
    pantryStatus: byId("pantryStatus"),
    ingredientsSections: byId("ingredientsSections"),
    pantryContent: byId("pantryContent"),
    filterSearch: byId("filterSearch"),
    filterTypeSelect: byId("filterTypeSelect"),
    clearFiltersButton: byId("clearFiltersButton"),
    toggleFiltersButton: byId("toggleFiltersButton"),
    filtersContent: byId("filtersContent"),
    filtersCaret: byId("filtersCaret"),
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setBusy(button, isBusy, textWhenBusy) {
  if (!button) return;

  button.disabled = isBusy;

  if (isBusy) {
    button.dataset.originalText = button.textContent;
    button.textContent = textWhenBusy;
  } else if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
    delete button.dataset.originalText;
  }
}

function showStatus(message) {
  const { pantryStatus } = getEls();
  if (!pantryStatus) return;

  pantryStatus.textContent = message;

  window.clearTimeout(showStatus._timer);
  showStatus._timer = window.setTimeout(() => {
    pantryStatus.textContent = "";
  }, 1800);
}

function normalizeName(value) {
  return String(value || "").trim();
}

function ingredientNameOf(item) {
  return normalizeName(item.name ?? item.Name ?? "");
}

function ingredientIdOf(item) {
  return item.id ?? item.Id ?? "";
}

function normalizeType(value) {
  const raw = String(value || "").trim();
  const allowed = [
    "야채",
    "탄수화물",
    "고기/단백질",
    "유제품",
    "과일",
    "소스/조미료",
    "냉동식품",
    "기타",
  ];
  return allowed.includes(raw) ? raw : "기타";
}

function ingredientTypeOf(item) {
  return normalizeType(item.type ?? item.Type ?? "기타");
}

function typeDisplay(type) {
  return normalizeType(type);
}

function compareKo(a, b) {
  return String(a).localeCompare(String(b), "ko");
}

function iconSvg(kind) {
  if (kind === "edit") {
    return `
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  `;
}

async function classifyIngredientType(name) {
  const response = await apiFetch(`${apiBase}/ingredients/classify-type`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    throw new Error(`Failed to classify ingredient type: ${response.status}`);
  }

  return await response.json();
}

async function updateTypePreviewFromName() {
  const { ingredientNameInput, typePreviewValue } = getEls();

  if (!ingredientNameInput || !typePreviewValue) return;
  if (editingRowId) return;

  const name = ingredientNameInput.value.trim();

  if (!name) {
    typePreviewValue.textContent = "기타";
    return;
  }

  try {
    const result = await classifyIngredientType(name);
    const detectedType = normalizeType(result.type ?? result.Type);
    typePreviewValue.textContent = typeDisplay(detectedType);
  } catch (error) {
    console.error("classifyIngredientType failed:", error);
    typePreviewValue.textContent = "기타";
  }
}

async function loadIngredients() {
  const { ingredientsSections } = getEls();
  if (!ingredientsSections) return;

  try {
    const response = await apiFetch(`${apiBase}/ingredients`);

    if (!response.ok) {
      throw new Error(`Failed to load ingredients: ${response.status}`);
    }

    const items = await response.json();
    currentIngredients = Array.isArray(items) ? items : [];

    renderIngredients();
  } catch (error) {
    console.error("loadIngredients failed:", error);

    ingredientsSections.innerHTML = `
      <div class="empty-state">Failed to load ingredients.</div>
    `;
  }
}

function applyIngredientFilters(items) {
  let filtered = [...items];

  if (pantryUiState.search) {
    const q = pantryUiState.search.toLowerCase();
    filtered = filtered.filter((item) =>
      ingredientNameOf(item).toLowerCase().includes(q)
    );
  }

  if (pantryUiState.type !== "all") {
    filtered = filtered.filter(
      (item) => ingredientTypeOf(item) === pantryUiState.type
    );
  }

  filtered.sort((a, b) => compareKo(ingredientNameOf(a), ingredientNameOf(b)));

  return filtered;
}

function renderIngredients() {
  const { ingredientsSections } = getEls();
  if (!ingredientsSections) return;

  const filtered = applyIngredientFilters(currentIngredients);

  ingredientsSections.innerHTML = "";

  // Sync expand-all button text
  const toggleBtn = byId("toggleAllPantry");
  if (toggleBtn) {
    const allCollapsed = Object.values(collapsedSections).every(v => v);
    toggleBtn.textContent = allCollapsed ? "리스트 모두 펼치기" : "리스트 모두 접기";
  }

  if (!filtered.length) {
    ingredientsSections.innerHTML = `
      <div class="empty-state">조건에 맞는 재료가 없어요.</div>
    `;
    return;
  }

  const groups = {};
  const typeOrder = ["야채", "탄수화물", "고기/단백질", "유제품", "과일", "소스/조미료", "냉동식품", "기타"];
  for (const t of typeOrder) groups[t] = [];

  filtered.forEach((item) => {
    const type = ingredientTypeOf(item);
    if (!groups[type]) groups[type] = [];
    groups[type].push(item);
  });

  const order = typeOrder;

  for (const groupName of order) {
    const items = groups[groupName];
    if (!items.length) continue;

    const section = document.createElement("section");
    section.className = "pantry-group";

    const header = document.createElement("button");
    header.type = "button";
    header.className = "group-header";
    header.innerHTML = `
      <span class="group-title">${collapsedSections[groupName] ? "▸" : "▾"} ${groupName}</span>
      <span class="group-count">${items.length}</span>
    `;

    header.addEventListener("click", () => {
      collapsedSections[groupName] = !collapsedSections[groupName];
      renderIngredients();
    });

    section.appendChild(header);

    if (!collapsedSections[groupName]) {
      const list = document.createElement("div");
      list.className = "ingredient-list";

      for (const item of items) {
        const row = document.createElement("div");
        row.className = "ingredient-row";

        const id = ingredientIdOf(item);
        const name = ingredientNameOf(item);
        const type = ingredientTypeOf(item);
        const isEditing = editingRowId === id;

        const isSelected = selectedIngredients.has(name);

        row.innerHTML = `
          <div class="ingredient-row-top">
            <label class="ingredient-select-label">
              <input type="checkbox" class="ingredient-select-cb" ${isSelected ? "checked" : ""} />
            </label>
            <div class="item-main">
              <div class="item-name">${escapeHtml(name)}</div>
            </div>

            <div class="item-actions">
              <button type="button" class="icon-button edit" aria-label="수정">
                ${iconSvg("edit")}
              </button>
              <button type="button" class="icon-button delete" aria-label="삭제">
                ${iconSvg("delete")}
              </button>
            </div>
          </div>

          ${isEditing ? `
            <div class="inline-edit-panel compact">
              <div class="inline-edit-field">
                <label class="inline-edit-label" for="inline-type-${id}">종류</label>
                <select class="inline-edit-select" id="inline-type-${id}">
                  <option value="야채" ${inlineDraft.type === "야채" ? "selected" : ""}>야채</option>
                  <option value="탄수화물" ${inlineDraft.type === "탄수화물" ? "selected" : ""}>탄수화물</option>
                  <option value="고기/단백질" ${inlineDraft.type === "고기/단백질" ? "selected" : ""}>고기/단백질</option>
                  <option value="유제품" ${inlineDraft.type === "유제품" ? "selected" : ""}>유제품</option>
                  <option value="과일" ${inlineDraft.type === "과일" ? "selected" : ""}>과일</option>
                  <option value="소스/조미료" ${inlineDraft.type === "소스/조미료" ? "selected" : ""}>소스/조미료</option>
                  <option value="냉동식품" ${inlineDraft.type === "냉동식품" ? "selected" : ""}>냉동식품</option>
                  <option value="기타" ${inlineDraft.type === "기타" ? "selected" : ""}>기타</option>
                </select>
              </div>

              <div class="inline-edit-actions compact">
                <button type="button" class="inline-save-btn">저장</button>
                <button type="button" class="inline-cancel-btn">취소</button>
              </div>
            </div>
          ` : ""}
        `;

        const editButton = row.querySelector(".edit");
        const deleteButton = row.querySelector(".delete");

        editButton.addEventListener("click", () => {
          startEditIngredient(item);
        });

        deleteButton.addEventListener("click", async () => {
          const confirmed = window.confirm(`'${name}' 재료를 삭제할까요?`);
          if (!confirmed) return;
          await deleteIngredient(id);
        });

        const checkbox = row.querySelector(".ingredient-select-cb");
        if (checkbox) {
          checkbox.addEventListener("change", () => {
            if (checkbox.checked) {
              selectedIngredients.add(name);
            } else {
              selectedIngredients.delete(name);
            }
            updateSelectedCount();
          });
        }

        if (isEditing) {
          const typeSelect = row.querySelector(`#inline-type-${id}`);
          const saveBtn = row.querySelector(".inline-save-btn");
          const cancelBtn = row.querySelector(".inline-cancel-btn");

          if (typeSelect) {
            typeSelect.addEventListener("change", (e) => {
              inlineDraft.type = normalizeType(e.target.value);
            });
          }

          if (saveBtn) {
            saveBtn.addEventListener("click", () => {
              saveInlineEdit(id);
            });
          }

          if (cancelBtn) {
            cancelBtn.addEventListener("click", () => {
              cancelInlineEdit();
            });
          }
        }

        list.appendChild(row);
      }

      section.appendChild(list);
    }

    ingredientsSections.appendChild(section);
  }
}

function startEditIngredient(item) {
  editingRowId = ingredientIdOf(item);
  inlineDraft = {
    name: ingredientNameOf(item),
    type: ingredientTypeOf(item),
  };
  renderIngredients();
}

function cancelInlineEdit() {
  editingRowId = null;
  inlineDraft = { name: "", type: "기타" };
  renderIngredients();
}

function resetForm() {
  const {
    ingredientNameInput,
    typePreview,
    typePreviewValue,
    saveButton,
  } = getEls();

  ingredientNameInput.value = "";

  if (typePreview) typePreview.hidden = false;
  if (typePreviewValue) typePreviewValue.textContent = "기타";

  saveButton.textContent = "재료 추가";
}

async function saveIngredient() {
  const { ingredientNameInput, saveButton } = getEls();

  const name = ingredientNameInput.value.trim();

  if (!name) {
    alert("재료명을 입력해주세요.");
    ingredientNameInput.focus();
    return;
  }

  const payload = {
    name,
  };

  try {
    setBusy(saveButton, true, "추가 중...");

    const response = await apiFetch(`${apiBase}/ingredients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 409) {
        alert(text);
        return;
      }
      throw new Error(`Failed to save ingredient: ${response.status} ${text}`);
    }

    resetForm();
    await loadIngredients();
    showStatus("재료를 추가했어요.");
  } catch (error) {
    console.error("saveIngredient failed:", error);
    alert("재료 저장에 실패했어요.");
  } finally {
    setBusy(saveButton, false);
  }
}

async function deleteIngredient(id) {
  try {
    const response = await apiFetch(`${apiBase}/ingredients/${id}`, {
      method: "DELETE",
    });

    if (!response.ok && response.status !== 204) {
      throw new Error(`Failed to delete ingredient: ${response.status}`);
    }

    if (editingRowId === id) {
      resetForm();
    }

    await loadIngredients();
    showStatus("재료를 삭제했어요.");
  } catch (error) {
    console.error("deleteIngredient failed:", error);
    alert("재료 삭제에 실패했어요.");
  }
}

async function saveInlineEdit(id) {
  const name = inlineDraft.name.trim();
  if (!name) {
    alert("재료명을 입력해주세요.");
    return;
  }

  const payload = {
    name,
    type: normalizeType(inlineDraft.type),
  };

  try {
    const response = await apiFetch(`${apiBase}/ingredients/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to save ingredient: ${response.status} ${text}`);
    }

    editingRowId = null;
    inlineDraft = { name: "", type: "기타" };
    await loadIngredients();
    showStatus("재료를 수정했어요.");
  } catch (error) {
    console.error("saveInlineEdit failed:", error);
    alert("재료 저장에 실패했어요.");
  }
}

function updateSelectedCount() {
  const { suggestButton } = getEls();
  if (!suggestButton) return;
  const count = selectedIngredients.size;
  suggestButton.textContent = count > 0
    ? `선택 재료로 추천 (${count})`
    : "오늘 뭐 먹지?";

  const existing = document.getElementById("mustIncludeToggle");
  if (existing) existing.remove();
}

async function fetchSuggestions(exclude = [], answers = null) {
  const body = {};
  if (selectedIngredients.size > 0) {
    body.mustInclude = [...selectedIngredients];
  }
  if (exclude.length > 0) {
    body.exclude = exclude;
  }
  if (answers && answers.length > 0) {
    body.answers = answers;
  }

  const response = await apiFetch(`${apiBase}/suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to load suggestions: ${response.status}`);
  }

  const data = await response.json();
  const aiMessage = data.message ?? data.Message ?? "";
  const suggestions = data.suggestions ?? data.Suggestions ?? data;
  const safeSuggestions = Array.isArray(suggestions) ? suggestions : [];

  // Priority-based sorting:
  // P0: Saved recipes (missing ≤ 2)
  // P1: AI, 0 missing & popular (top half of AI order)
  // P2: AI, 1 missing & popular
  // P3: AI, 0 missing & less popular (bottom half)
  // P4: AI, 1 missing & less popular
  // P5: rest (2+ missing)
  // AI returns results sorted by popularity, so original index = popularity rank
  const saved = safeSuggestions.filter(s => (s.source ?? s.Source) === "saved");
  saved.sort((a, b) => {
    const am = (a.missingIngredients ?? a.MissingIngredients ?? []).length;
    const bm = (b.missingIngredients ?? b.MissingIngredients ?? []).length;
    return am - bm;
  });

  const ai = safeSuggestions.filter(s => (s.source ?? s.Source) !== "saved");
  const popularCutoff = Math.ceil(ai.length / 2);

  const prioritized = ai.map((s, idx) => {
    const missing = (s.missingIngredients ?? s.MissingIngredients ?? []).length;
    const isPopular = idx < popularCutoff;
    let priority;
    if (missing === 0 && isPopular) priority = 1;
    else if (missing <= 1 && isPopular) priority = 2;
    else if (missing === 0) priority = 3;
    else if (missing <= 1) priority = 4;
    else priority = 5;
    return { ...s, _priority: priority, _origIdx: idx };
  });

  prioritized.sort((a, b) => a._priority - b._priority || a._origIdx - b._origIdx);

  return { message: aiMessage, suggestions: [...saved, ...prioritized] };
}

let allSuggestions = [];
let shownSuggestionCount = 0;
let currentAiMessage = "";
let currentAnswers = [];
const SUGGESTIONS_PER_PAGE = 3;

async function fetchQuestions() {
  const response = await apiFetch(`${apiBase}/suggestions/questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!response.ok) throw new Error(`Failed to get questions: ${response.status}`);
  return await response.json();
}

function showQuestion(question, container) {
  return new Promise((resolve) => {
    const qDiv = document.createElement("div");
    qDiv.className = "ai-question";

    const text = document.createElement("div");
    text.className = "ai-question-text";
    text.textContent = question.text ?? question.Text ?? "";
    qDiv.appendChild(text);

    const optionsDiv = document.createElement("div");
    optionsDiv.className = "ai-options";

    const options = question.options ?? question.Options ?? [];
    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.className = "ai-option-btn";
      btn.textContent = opt;
      btn.addEventListener("click", () => {
        optionsDiv.querySelectorAll(".ai-option-btn").forEach(b => {
          b.classList.remove("selected");
          b.disabled = true;
        });
        btn.classList.add("selected");
        customWrap.hidden = true;
        setTimeout(() => resolve(opt), 300);
      });
      optionsDiv.appendChild(btn);
    });

    qDiv.appendChild(optionsDiv);

    const customWrap = document.createElement("div");
    customWrap.className = "ai-custom-input";
    const customInput = document.createElement("input");
    customInput.type = "text";
    customInput.placeholder = "직접 입력...";
    const customBtn = document.createElement("button");
    customBtn.textContent = "확인";
    const submitCustom = () => {
      const val = customInput.value.trim();
      if (val) {
        optionsDiv.querySelectorAll(".ai-option-btn").forEach(b => b.disabled = true);
        customWrap.hidden = true;
        resolve(val);
      }
    };
    customBtn.addEventListener("click", submitCustom);
    customInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitCustom();
    });
    customWrap.appendChild(customInput);
    customWrap.appendChild(customBtn);
    qDiv.appendChild(customWrap);

    container.appendChild(qDiv);
  });
}

async function suggestDinner() {
  const { suggestButton, suggestionsDiv } = getEls();

  const available = currentIngredients;
  if (available.length === 0) {
    suggestionsDiv.innerHTML = `
      <div class="empty-state">Pantry에 재료를 먼저 추가해주세요! 🥕</div>
    `;
    return;
  }

  try {
    setBusy(suggestButton, true, "추천 중...");
    suggestionsDiv.innerHTML = `
      <div class="ai-message ai-thinking">
        <span class="ai-thinking-dots"></span>
        오늘 저녁 메뉴를 고민하고 있어요...
      </div>
    `;

    const qResult = await fetchQuestions();

    // Show greeting + questions
    suggestionsDiv.innerHTML = "";

    const qMsg = qResult.message ?? qResult.Message ?? "";
    if (qMsg) {
      const msgDiv = document.createElement("div");
      msgDiv.className = "ai-message";
      msgDiv.textContent = qMsg;
      suggestionsDiv.appendChild(msgDiv);
    }

    // Phase 2: Show questions one by one
    const questions = qResult.questions ?? qResult.Questions ?? [];
    const answers = [];
    for (const q of questions) {
      const category = q.category ?? q.Category ?? "";
      const answer = await showQuestion(q, suggestionsDiv);
      answers.push({ category, answer });
    }

    currentAnswers = answers;

    // Phase 3: Fetch suggestions with answers
    const thinkingDiv = document.createElement("div");
    thinkingDiv.className = "ai-message ai-thinking";
    thinkingDiv.innerHTML = `<span class="ai-thinking-dots"></span> 선택하신 조건에 맞는 메뉴를 골라보고 있어요...`;
    suggestionsDiv.appendChild(thinkingDiv);

    const result = await fetchSuggestions([], answers);

    // Replace everything with results
    suggestionsDiv.innerHTML = "";
    allSuggestions = result.suggestions;
    currentAiMessage = result.message;
    shownSuggestionCount = 0;
    await renderSuggestions(allSuggestions);
  } catch (error) {
    console.error("suggestDinner failed:", error);
    suggestionsDiv.innerHTML = `
      <div class="empty-state">추천을 불러오지 못했어요.</div>
    `;
  } finally {
    setBusy(suggestButton, false);
  }
}

async function loadMoreSuggestions(btn) {
  const { suggestionsDiv } = getEls();

  // If we still have buffered suggestions to show
  if (shownSuggestionCount < allSuggestions.length) {
    const next = allSuggestions.slice(shownSuggestionCount, shownSuggestionCount + SUGGESTIONS_PER_PAGE);
    shownSuggestionCount += next.length;

    // Remove the more button before appending
    const existingBtn = suggestionsDiv.querySelector(".more-suggestions-btn");
    if (existingBtn) existingBtn.remove();

    appendSuggestionCards(next, suggestionsDiv);
    addMoreButton(suggestionsDiv);
    return;
  }

  // Otherwise fetch new batch from API
  try {
    btn.textContent = "추천 불러오는 중...";
    btn.disabled = true;

    const existingNames = [...suggestionsDiv.querySelectorAll("h3")].map(h => h.textContent.trim());
    const result = await fetchSuggestions(existingNames, currentAnswers);

    const existingBtn = suggestionsDiv.querySelector(".more-suggestions-btn");
    if (existingBtn) existingBtn.remove();

    const existingNamesLower = new Set(existingNames.map(n => n.toLowerCase()));
    const newResults = result.suggestions.filter(s => {
      const name = (s.name ?? s.Name ?? "").trim().toLowerCase();
      return !existingNamesLower.has(name);
    });

    // Buffer new results
    allSuggestions = newResults;
    shownSuggestionCount = 0;

    if (newResults.length === 0) {
      const notice = document.createElement("div");
      notice.className = "empty-state";
      notice.textContent = "새로운 추천이 없어요. 다시 시도해보세요!";
      suggestionsDiv.appendChild(notice);
    } else {
      const next = allSuggestions.slice(0, SUGGESTIONS_PER_PAGE);
      shownSuggestionCount = next.length;
      appendSuggestionCards(next, suggestionsDiv);
    }

    addMoreButton(suggestionsDiv);
  } catch (error) {
    console.error("loadMoreSuggestions failed:", error);
    btn.textContent = "🔄 더 보기";
    btn.disabled = false;
  }
}

async function loadTodayLogs() {
  const today = new Date().toLocaleDateString("sv-SE");
  try {
    const res = await apiFetch(`${apiBase}/meal-logs?startDate=${today}&endDate=${today}`);
    if (!res.ok) return;
    const logs = await res.json();
    todayLoggedNames = new Set(logs.map(l => (l.name ?? l.Name ?? "").toLowerCase()));
  } catch (e) {
    console.error("loadTodayLogs failed:", e);
  }
}

async function renderSuggestions(suggestions) {
  const { suggestionsDiv } = getEls();
  suggestionsDiv.innerHTML = "";

  if (!suggestions.length) {
    suggestionsDiv.innerHTML = `
      <div class="empty-state">추천 가능한 메뉴가 아직 없어요.</div>
    `;
    return;
  }

  await loadTodayLogs();

  // Show AI message if available
  if (currentAiMessage) {
    const msgDiv = document.createElement("div");
    msgDiv.className = "ai-message";
    msgDiv.textContent = currentAiMessage;
    suggestionsDiv.appendChild(msgDiv);
  }

  const first = suggestions.slice(0, SUGGESTIONS_PER_PAGE);
  shownSuggestionCount = first.length;
  appendSuggestionCards(first, suggestionsDiv);

  addMoreButton(suggestionsDiv);
}

function addMoreButton(container) {
  const moreBtn = document.createElement("button");
  moreBtn.className = "more-suggestions-btn";
  moreBtn.textContent = "🔄 더 보기";
  moreBtn.addEventListener("click", () => loadMoreSuggestions(moreBtn));
  container.appendChild(moreBtn);
}

function appendSuggestionCards(suggestions, container) {
  suggestions.forEach((item) => {
    const card = document.createElement("article");
    card.className = "suggestion";

    const missing = Array.isArray(item.missingIngredients ?? item.MissingIngredients)
      ? (item.missingIngredients ?? item.MissingIngredients)
      : [];

    const uses = Array.isArray(item.uses ?? item.Uses)
      ? (item.uses ?? item.Uses)
      : [];

    const name = item.name ?? item.Name ?? "";
    const cuisine = item.cuisine ?? item.Cuisine ?? "";
    const canMakeNow = item.canMakeNow ?? item.CanMakeNow ?? false;
    const recipeUrl = item.recipeUrl ?? item.RecipeUrl ?? "";
    const recipeSource = item.recipeSource ?? item.RecipeSource ?? "";
    const difficulty = item.difficulty ?? item.Difficulty ?? "";
    const cookTime = item.cookTime ?? item.CookTime ?? "";
    const source = item.source ?? item.Source ?? "ai";
    const imageUrl = item.imageUrl ?? item.ImageUrl ?? "";

    const statusBadge = canMakeNow
      ? `<span class="suggestion-pill ready">지금 가능</span>`
      : `<span class="suggestion-pill missing">재료 필요 ${missing.length}</span>`;

    const sourceBadge = source === "saved"
      ? `<span class="suggestion-pill source-saved">📌 저장됨</span>`
      : `<span class="suggestion-pill source-ai">🤖 AI</span>`;

    const difficultyBadge = difficulty
      ? `<span class="suggestion-pill difficulty-${difficulty === '쉬움' ? 'easy' : difficulty === '어려움' ? 'hard' : 'medium'}">${escapeHtml(difficulty)}</span>`
      : "";

    const cookTimeBadge = cookTime
      ? `<span class="suggestion-pill cook-time">⏱ ${escapeHtml(cookTime)}</span>`
      : "";

    card.innerHTML = `
      ${imageUrl ? `<div class="suggestion-img-wrap"><img class="suggestion-img" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}" onerror="this.parentElement.style.display='none'"></div>` : ""}
      <div class="suggestion-body">
        <div class="suggestion-top">
          <div class="suggestion-title-wrap">
            <h3>${escapeHtml(name)}</h3>
            <div class="suggestion-subchips">
              <span class="suggestion-cuisine">${escapeHtml(cuisine || "추천")}</span>
              ${sourceBadge}
              ${statusBadge}
              ${difficultyBadge}
              ${cookTimeBadge}
            </div>
          </div>
          ${source === "ai" ? `<button type="button" class="save-to-recipe-btn" title="레시피에 저장">+ 저장</button>` : ""}
        </div>

        <div class="suggestion-section">
          <div class="suggestion-label">사용 재료</div>
          <div class="suggestion-chip-row">
            ${
              uses.length
                ? uses.map(x => `<span class="ingredient-chip use">${escapeHtml(x)}</span>`).join("")
                : `<span class="ingredient-chip neutral">-</span>`
            }
          </div>
        </div>

        ${
          missing.length
            ? `
          <div class="suggestion-section">
            <div class="suggestion-label">부족한 재료</div>
            <div class="suggestion-chip-row">
              ${missing.map(x => `<span class="ingredient-chip missing">${escapeHtml(x)}</span>`).join("")}
            </div>
          </div>
          `
            : ""
        }

        <div class="suggestion-actions">
          ${
            recipeUrl
              ? `<a class="recipe-link" href="${escapeHtml(recipeUrl)}" target="_blank" rel="noreferrer">레시피보기</a>`
              : ""
          }
          <span class="suggestion-actions-spacer"></span>
          <button type="button" class="log-today-btn"${todayLoggedNames.has(name.toLowerCase()) ? ' disabled' : ""}>
            ${todayLoggedNames.has(name.toLowerCase()) ? "✅ 기록됨" : "🍽️ 오늘의 식사"}
          </button>
        </div>
      </div>
    `;

    if (source === "ai") {
      card.querySelector(".save-to-recipe-btn").addEventListener("click", () => {
        saveAiSuggestionToRecipe({ name, cuisine, difficulty, cookTime, uses, recipeUrl });
      });
    }

    card.querySelector(".log-today-btn").addEventListener("click", async () => {
      const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD
      try {
        await apiFetch(`${apiBase}/meal-logs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: today, name, imageUrl }),
        });
        todayLoggedNames.add(name.toLowerCase());
        card.querySelector(".log-today-btn").textContent = "✅ 기록됨";
        card.querySelector(".log-today-btn").disabled = true;
      } catch (e) {
        alert("식사 기록에 실패했어요.");
      }
    });

    container.appendChild(card);
  });
}

function updateImagePreview() {
  const url = byId("mealImageUrl")?.value.trim();
  const preview = byId("mealImagePreview");
  const img = byId("mealImagePreviewImg");
  if (!preview || !img) return;
  if (url) {
    img.src = url;
    img.onload = () => { preview.hidden = false; };
    img.onerror = () => { preview.hidden = true; };
  } else {
    preview.hidden = true;
  }
}

function saveAiSuggestionToRecipe({ name, cuisine, difficulty, cookTime, uses, recipeUrl }) {
  switchPage("meals");
  editingMealId = null;
  resetMealForm();
  byId("mealName").value = name;
  byId("mealCuisine").value = cuisine || "한식";
  byId("mealDifficulty").value = difficulty || "보통";

  // Map AI cookTime to closest dropdown value
  const ct = (cookTime || "").replace(/\s/g, "");
  const mins = parseInt(ct, 10);
  let cookVal = "";
  if (mins > 0) {
    if (mins <= 15) cookVal = "15분";
    else if (mins <= 30) cookVal = "30분";
    else if (mins <= 45) cookVal = "45분";
    else if (mins <= 60) cookVal = "60분";
    else cookVal = "60분+";
  } else if (["15분","30분","45분","60분","60분+"].includes(ct)) {
    cookVal = ct;
  }
  byId("mealCookTime").value = cookVal;

  byId("mealIngredients").value = uses.join(", ");
  byId("mealRecipeUrl").value = recipeUrl || "";
  byId("mealFormWrap").hidden = false;
  byId("showMealFormBtn").hidden = true;
  byId("mealFiltersWrap").hidden = true;
  byId("mealsContainer").hidden = true;
  byId("mealName").focus();
}

// ─── Tags ───

async function loadTags() {
  try {
    const res = await apiFetch(`${apiBase}/tags`);
    if (!res.ok) return;
    const items = await res.json();
    availableTags = Array.isArray(items) ? items : [];
    renderTagChips();
  } catch (e) {
    console.error("loadTags failed:", e);
  }
}

function renderTagChips() {
  const wrap = byId("mealTagsChips");
  if (!wrap) return;
  wrap.innerHTML = "";
  for (const tag of availableTags) {
    const name = tag.name ?? tag.Name ?? "";
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `tag-chip${selectedTags.has(name) ? " selected" : ""}`;
    chip.textContent = name;
    chip.addEventListener("click", () => {
      if (selectedTags.has(name)) {
        selectedTags.delete(name);
      } else {
        selectedTags.add(name);
      }
      renderTagChips();
    });
    wrap.appendChild(chip);
  }
}

function openTagModal() {
  byId("tagModal").hidden = false;
  renderTagModalList();
}

function closeTagModal() {
  byId("tagModal").hidden = true;
  renderTagChips();
}

function renderTagModalList() {
  const list = byId("tagModalList");
  if (!list) return;
  list.innerHTML = "";
  for (const tag of availableTags) {
    const name = tag.name ?? tag.Name ?? "";
    const id = tag.id ?? tag.Id ?? "";
    const row = document.createElement("div");
    row.className = "tag-modal-row";
    row.innerHTML = `
      <span>${escapeHtml(name)}</span>
      <button type="button" class="icon-button delete" aria-label="삭제">${iconSvg("delete")}</button>
    `;
    row.querySelector(".delete").addEventListener("click", async () => {
      if (!confirm(`'${name}' 태그를 삭제할까요?`)) return;
      try {
        await apiFetch(`${apiBase}/tags/${id}`, { method: "DELETE" });
        selectedTags.delete(name);
        await loadTags();
        renderTagModalList();
      } catch (e) {
        alert("태그 삭제에 실패했어요.");
      }
    });
    list.appendChild(row);
  }
}

async function addTag() {
  const input = byId("newTagInput");
  const name = input.value.trim();
  if (!name) return;
  try {
    const res = await apiFetch(`${apiBase}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.status === 409) {
      alert("이미 있는 태그입니다.");
      return;
    }
    if (!res.ok) throw new Error("Failed");
    input.value = "";
    await loadTags();
    renderTagModalList();
  } catch (e) {
    alert("태그 추가에 실패했어요.");
  }
}

function attachTagEvents() {
  const manageBtn = byId("manageTagsBtn");
  if (manageBtn) manageBtn.addEventListener("click", openTagModal);

  const closeBtn = byId("closeTagModalBtn");
  if (closeBtn) closeBtn.addEventListener("click", closeTagModal);

  const addBtn = byId("addTagBtn");
  if (addBtn) addBtn.addEventListener("click", addTag);

  const newTagInput = byId("newTagInput");
  if (newTagInput) {
    newTagInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); addTag(); }
    });
  }
}

function syncFilterStateFromUi() {
  const { filterSearch, filterTypeSelect } = getEls();

  pantryUiState.search = filterSearch ? filterSearch.value.trim() : "";
  pantryUiState.type = filterTypeSelect ? filterTypeSelect.value : "all";
}

function syncUiFromFilterState() {
  const { filterSearch, filterTypeSelect } = getEls();

  if (filterSearch) filterSearch.value = pantryUiState.search;
  if (filterTypeSelect) filterTypeSelect.value = pantryUiState.type;
}

function renderFiltersCollapsedState() {
  const { filtersContent, filtersCaret } = getEls();

  if (filtersContent) {
    filtersContent.hidden = filtersCollapsed;
  }

  if (filtersCaret) {
    filtersCaret.textContent = filtersCollapsed ? "▸" : "▾";
  }
}

function clearFilters() {
  pantryUiState = {
    search: "",
    type: "all",
  };

  syncUiFromFilterState();
  renderIngredients();
}

function attachFilterEvents() {
  const {
    filterSearch,
    filterTypeSelect,
    clearFiltersButton,
    toggleFiltersButton,
  } = getEls();

  if (filterSearch) {
    filterSearch.addEventListener("input", () => {
      syncFilterStateFromUi();
      renderIngredients();
    });
  }

  if (filterTypeSelect) {
    filterTypeSelect.addEventListener("change", () => {
      syncFilterStateFromUi();
      renderIngredients();
    });
  }

  if (clearFiltersButton) {
    clearFiltersButton.addEventListener("click", clearFilters);
  }

  if (toggleFiltersButton) {
    toggleFiltersButton.addEventListener("click", () => {
      filtersCollapsed = !filtersCollapsed;
      renderFiltersCollapsedState();
    });
  }

  const toggleAllPantry = byId("toggleAllPantry");
  if (toggleAllPantry) {
    toggleAllPantry.addEventListener("click", () => {
      const allCollapsed = Object.values(collapsedSections).every(v => v);
      for (const key of Object.keys(collapsedSections)) {
        collapsedSections[key] = !allCollapsed;
      }
      toggleAllPantry.textContent = allCollapsed ? "리스트 모두 접기" : "리스트 모두 펼치기";
      renderIngredients();
    });
  }

  const showIngBtn = byId("showIngredientFormBtn");
  if (showIngBtn) {
    showIngBtn.addEventListener("click", () => {
      const form = byId("ingredientFormWrap");
      if (form) form.hidden = false;
      showIngBtn.hidden = true;
      const nameInput = byId("ingredientName");
      if (nameInput) nameInput.focus();
    });
  }
}

function attachFormEvents() {
  const {
    ingredientNameInput,
    saveButton,
    suggestButton,
  } = getEls();

  if (ingredientNameInput) {
    ingredientNameInput.addEventListener("input", () => {
      window.clearTimeout(classifyTimer);
      classifyTimer = window.setTimeout(updateTypePreviewFromName, 180);
    });

    ingredientNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveIngredient();
      }
    });
  }

  if (saveButton) {
    saveButton.addEventListener("click", saveIngredient);
  }

  if (suggestButton) {
    suggestButton.addEventListener("click", suggestDinner);
  }
}

async function init() {
  await initAuth();
  syncUiFromFilterState();
  renderFiltersCollapsedState();
  attachFilterEvents();
  attachFormEvents();
  attachTabEvents();
  attachMealEvents();
  initCalendar();
  attachCalendarEvents();
  attachCalendarOverlay();
  byId("accountBtn")?.addEventListener("click", () => switchPage("account"));
  resetForm();
  loadTags();
  loadIngredients().then(async () => {
    switchPage("suggestions");
    suggestDinner(); // runs in background, doesn't block splash
  }).catch((e) => {
    console.error("loadIngredients error during init:", e);
  });

  // Always dismiss splash after 3 seconds
  setTimeout(dismissSplash, 3000);
}

function dismissSplash() {
  const splash = byId("splashScreen");
  if (!splash) return;
  splash.classList.add("hidden");
  setTimeout(() => splash.remove(), 500);
}

// ─── Tab Navigation ───

function attachTabEvents() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const page = btn.dataset.page;
      if (page === "calendar") {
        openCalendarOverlay();
        return;
      }
      switchPage(page);
    });
  });
}

const PAGE_TITLES = {
  suggestions: "🍽️ 저녁 메뉴 추천",
  pantry: "🥕 Pantry",
  meals: "🍳 저장된 레시피",
  account: "👤 계정",
};

function switchPage(pageName) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === pageName);
  });

  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === `page-${pageName}`);
  });

  if (pageName === "account") {
    const emailEl = byId("accountEmail");
    if (emailEl) emailEl.textContent = currentUserEmail || "-";
  }

  const titleEl = byId("topBarTitle");
  if (titleEl && PAGE_TITLES[pageName]) titleEl.textContent = PAGE_TITLES[pageName];
  window.scrollTo(0, 0);

  // Reset pantry page state
  if (pageName === "pantry") {
    const ingredientForm = byId("ingredientFormWrap");
    const showIngBtn = byId("showIngredientFormBtn");
    if (ingredientForm) ingredientForm.hidden = true;
    if (showIngBtn) showIngBtn.hidden = false;
    resetForm();
  }

  // Reset meals page state
  if (pageName === "meals") {
    editingMealId = null;
    resetMealForm();
    byId("mealFormWrap").hidden = true;
    byId("showMealFormBtn").hidden = false;
    byId("mealFiltersWrap").hidden = false;
    byId("mealsContainer").hidden = false;
    if (currentMeals.length === 0) {
      loadMeals();
    } else {
      renderMeals();
    }
  }

  // Load and render calendar
  if (pageName === "calendar") {
    openCalendarOverlay();
  }
}

// ─── Meals Page ───

function attachMealEvents() {
  const showBtn = byId("showMealFormBtn");
  const saveBtn = byId("saveMealBtn");
  const cancelBtn = byId("cancelMealBtn");
  const searchInput = byId("mealSearchInput");

  if (showBtn) {
    showBtn.addEventListener("click", () => {
      editingMealId = null;
      resetMealForm();
      byId("mealFormWrap").hidden = false;
      byId("mealFiltersWrap").hidden = true;
      byId("mealsContainer").hidden = true;
      showBtn.hidden = true;
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", saveMeal);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      editingMealId = null;
      resetMealForm();
      byId("mealFormWrap").hidden = true;
      byId("showMealFormBtn").hidden = false;
      byId("mealFiltersWrap").hidden = false;
      byId("mealsContainer").hidden = false;
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      mealSearchQuery = searchInput.value.trim().toLowerCase();
      renderMeals();
    });
  }

  const cuisineFilter = byId("mealCuisineFilter");
  if (cuisineFilter) {
    cuisineFilter.addEventListener("change", () => {
      mealCuisineFilter = cuisineFilter.value;
      renderMeals();
    });
  }

  const toggleMealFilters = byId("toggleMealFiltersBtn");
  if (toggleMealFilters) {
    toggleMealFilters.addEventListener("click", () => {
      mealFiltersCollapsed = !mealFiltersCollapsed;
      byId("mealFiltersContent").hidden = mealFiltersCollapsed;
      byId("mealFiltersCaret").textContent = mealFiltersCollapsed ? "▸" : "▾";
    });
  }

  const clearMealFilters = byId("clearMealFiltersBtn");
  if (clearMealFilters) {
    clearMealFilters.addEventListener("click", () => {
      mealSearchQuery = "";
      mealCuisineFilter = "all";
      if (searchInput) searchInput.value = "";
      if (cuisineFilter) cuisineFilter.value = "all";
      renderMeals();
    });
  }

  const toggleAllMeals = byId("toggleAllMeals");
  if (toggleAllMeals) {
    toggleAllMeals.addEventListener("click", () => {
      const allCollapsed = Object.values(collapsedMealSections).every(v => v);
      for (const key of Object.keys(collapsedMealSections)) {
        collapsedMealSections[key] = !allCollapsed;
      }
      toggleAllMeals.textContent = allCollapsed ? "리스트 모두 접기" : "리스트 모두 펼치기";
      renderMeals();
    });
  }

  attachTagEvents();

  const imageUrlInput = byId("mealImageUrl");
  if (imageUrlInput) {
    imageUrlInput.addEventListener("change", updateImagePreview);
  }
}

function resetMealForm() {
  byId("mealName").value = "";
  byId("mealCuisine").value = "한식";
  byId("mealDifficulty").value = "보통";
  byId("mealCookTime").value = "";
  byId("mealIngredients").value = "";
  selectedTags = new Set();
  renderTagChips();
  byId("mealRecipeUrl").value = "";
  byId("mealImageUrl").value = "";
  const preview = byId("mealImagePreview");
  if (preview) preview.hidden = true;
  const logCheck = byId("mealLogToday");
  if (logCheck) logCheck.checked = false;
  byId("saveMealBtn").textContent = "저장";
}

function fillMealForm(meal) {
  byId("mealName").value = meal.name ?? meal.Name ?? "";
  byId("mealCuisine").value = meal.cuisine ?? meal.Cuisine ?? "한식";
  byId("mealDifficulty").value = meal.difficulty ?? meal.Difficulty ?? "보통";
  byId("mealCookTime").value = meal.cookTime ?? meal.CookTime ?? "";
  byId("mealIngredients").value = (meal.ingredients ?? meal.Ingredients ?? []).join(", ");
  selectedTags = new Set(meal.tags ?? meal.Tags ?? []);
  renderTagChips();
  byId("mealRecipeUrl").value = meal.recipeUrl ?? meal.RecipeUrl ?? "";
  byId("mealImageUrl").value = meal.imageUrl ?? meal.ImageUrl ?? "";
  updateImagePreview();
  byId("saveMealBtn").textContent = "수정 저장";
}

function showMealStatus(message) {
  const el = byId("mealStatus");
  if (!el) return;
  el.textContent = message;
  window.clearTimeout(showMealStatus._timer);
  showMealStatus._timer = window.setTimeout(() => {
    el.textContent = "";
  }, 1800);
}

async function loadMeals() {
  try {
    const response = await apiFetch(`${apiBase}/meals`);
    if (!response.ok) throw new Error(`Failed to load meals: ${response.status}`);
    const items = await response.json();
    currentMeals = Array.isArray(items) ? items : [];
    renderMeals();
  } catch (error) {
    console.error("loadMeals failed:", error);
    const container = byId("mealsContainer");
    if (container) {
      container.innerHTML = `<div class="empty-state">레시피를 불러오지 못했어요.</div>`;
    }
  }
}

async function saveMeal() {
  const name = byId("mealName").value.trim();
  if (!name) {
    alert("요리 이름을 입력해주세요.");
    byId("mealName").focus();
    return;
  }

  const ingredientsRaw = byId("mealIngredients").value;
  const ingredients = ingredientsRaw
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

  const tags = [...selectedTags];

  const payload = {
    name,
    cuisine: byId("mealCuisine").value,
    difficulty: byId("mealDifficulty").value,
    cookTime: byId("mealCookTime").value,
    ingredients,
    tags,
    recipeUrl: byId("mealRecipeUrl").value.trim(),
    imageUrl: byId("mealImageUrl").value.trim(),
  };

  const logToday = byId("mealLogToday")?.checked ?? false;
  const saveBtn = byId("saveMealBtn");

  try {
    setBusy(saveBtn, true, "저장 중...");

    const isEditing = editingMealId !== null;
    const url = isEditing ? `${apiBase}/meals/${editingMealId}` : `${apiBase}/meals`;
    const method = isEditing ? "PUT" : "POST";

    const response = await apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 409) {
        alert(text);
        return;
      }
      throw new Error(`Failed to save meal: ${response.status} ${text}`);
    }

    editingMealId = null;
    resetMealForm();
    byId("mealFormWrap").hidden = true;
    byId("showMealFormBtn").hidden = false;
    byId("mealFiltersWrap").hidden = false;
    byId("mealsContainer").hidden = false;
    await loadMeals();
    showMealStatus(isEditing ? "레시피를 수정했어요." : "레시피를 추가했어요.");

    // Log as today's meal if checked
    if (logToday) {
      const today = new Date().toLocaleDateString("sv-SE");
      try {
        await apiFetch(`${apiBase}/meal-logs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: today, name: payload.name, imageUrl: payload.imageUrl, source: "recipe" }),
        });
      } catch (e) {
        console.error("Failed to log today's meal:", e);
      }
    }
  } catch (error) {
    console.error("saveMeal failed:", error);
    alert("레시피 저장에 실패했어요.");
  } finally {
    setBusy(saveBtn, false);
  }
}

async function deleteMeal(id, name) {
  const confirmed = window.confirm(`'${name}' 레시피를 삭제할까요?`);
  if (!confirmed) return;

  try {
    const response = await apiFetch(`${apiBase}/meals/${id}`, { method: "DELETE" });
    if (!response.ok && response.status !== 204) {
      throw new Error(`Failed to delete meal: ${response.status}`);
    }
    await loadMeals();
    showMealStatus("레시피를 삭제했어요.");
  } catch (error) {
    console.error("deleteMeal failed:", error);
    alert("레시피 삭제에 실패했어요.");
  }
}

function renderMeals() {
  const container = byId("mealsContainer");
  if (!container) return;

  let filtered = [...currentMeals];

  if (mealCuisineFilter !== "all") {
    filtered = filtered.filter((meal) => {
      const cuisine = (meal.cuisine ?? meal.Cuisine ?? "기타");
      return cuisine === mealCuisineFilter;
    });
  }

  if (mealSearchQuery) {
    filtered = filtered.filter((meal) => {
      const name = (meal.name ?? meal.Name ?? "").toLowerCase();
      const ingredients = (meal.ingredients ?? meal.Ingredients ?? []).join(" ").toLowerCase();
      const tags = (meal.tags ?? meal.Tags ?? []).join(" ").toLowerCase();
      return name.includes(mealSearchQuery) || ingredients.includes(mealSearchQuery) || tags.includes(mealSearchQuery);
    });
  }

  filtered.sort((a, b) => compareKo(a.name ?? a.Name ?? "", b.name ?? b.Name ?? ""));

  container.innerHTML = "";

  // Sync expand-all button text
  const toggleBtn = byId("toggleAllMeals");
  if (toggleBtn) {
    const allCollapsed = Object.values(collapsedMealSections).every(v => v);
    toggleBtn.textContent = allCollapsed ? "리스트 모두 펼치기" : "리스트 모두 접기";
  }

  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state">저장된 레시피가 없어요. 자주 만드는 요리를 추가해보세요!</div>`;
    return;
  }

  // Group by cuisine
  const cuisineOrder = ["한식", "양식", "중식", "일식", "분식", "기타"];
  const groups = {};
  for (const c of cuisineOrder) groups[c] = [];

  for (const meal of filtered) {
    const cuisine = meal.cuisine ?? meal.Cuisine ?? "기타";
    if (!groups[cuisine]) groups[cuisine] = [];
    groups[cuisine].push(meal);
  }

  for (const cuisineName of cuisineOrder) {
    const items = groups[cuisineName];
    if (!items.length) continue;

    // Default collapsed
    if (collapsedMealSections[cuisineName] === undefined) {
      collapsedMealSections[cuisineName] = true;
    }

    const section = document.createElement("section");
    section.className = "pantry-group";

    const header = document.createElement("button");
    header.type = "button";
    header.className = "group-header";
    header.innerHTML = `
      <span class="group-title">${collapsedMealSections[cuisineName] ? "▸" : "▾"} ${cuisineName}</span>
      <span class="group-count">${items.length}</span>
    `;

    header.addEventListener("click", () => {
      collapsedMealSections[cuisineName] = !collapsedMealSections[cuisineName];
      renderMeals();
    });

    section.appendChild(header);

    if (!collapsedMealSections[cuisineName]) {
      const list = document.createElement("div");
      list.className = "meals-list";

      for (const meal of items) {
        const id = meal.id ?? meal.Id ?? "";
        const name = meal.name ?? meal.Name ?? "";
        const cuisine = meal.cuisine ?? meal.Cuisine ?? "";
        const difficulty = meal.difficulty ?? meal.Difficulty ?? "";
        const cookTime = meal.cookTime ?? meal.CookTime ?? "";
        const ingredients = meal.ingredients ?? meal.Ingredients ?? [];
        const tags = meal.tags ?? meal.Tags ?? [];
        const recipeUrl = meal.recipeUrl ?? meal.RecipeUrl ?? "";
        const imageUrl = meal.imageUrl ?? meal.ImageUrl ?? "";

        const diffClass = difficulty === "쉬움" ? "easy" : difficulty === "어려움" ? "hard" : "medium";

        const card = document.createElement("article");
        card.className = "meal-card";

        card.innerHTML = `
          ${imageUrl ? `<div class="meal-card-image"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}" onerror="this.parentElement.style.display='none'"></div>` : ""}
          <div class="meal-card-top">
            <div>
              <h3>${escapeHtml(name)}</h3>
              <div class="meal-card-meta">
                ${difficulty ? `<span class="suggestion-pill difficulty-${diffClass}">${escapeHtml(difficulty)}</span>` : ""}
                ${cookTime ? `<span class="suggestion-pill cook-time">⏱ ${escapeHtml(cookTime)}</span>` : ""}
              </div>
            </div>
            <div class="meal-card-actions">
              <button type="button" class="icon-button edit" aria-label="수정">${iconSvg("edit")}</button>
              <button type="button" class="icon-button delete" aria-label="삭제">${iconSvg("delete")}</button>
            </div>
          </div>

          ${ingredients.length ? `
            <div class="meal-card-ingredients">
              <div class="meal-card-ingredients-label">재료</div>
              <div class="meal-card-chips">
                ${ingredients.map((i) => {
                  const pantryNames = currentIngredients.map(p => (p.name ?? p.Name ?? "").trim().toLowerCase());
                  const isMissing = !pantryNames.includes(i.trim().toLowerCase());
                  return `<span class="meal-chip${isMissing ? ' missing' : ''}">${escapeHtml(i)}${isMissing ? ' ❌' : ''}</span>`;
                }).join("")}
              </div>
            </div>
          ` : ""}

          ${tags.length ? `
            <div class="meal-card-ingredients">
              <div class="meal-card-ingredients-label">태그</div>
              <div class="meal-card-chips">
                ${tags.map((t) => `<span class="meal-chip tag">${escapeHtml(t)}</span>`).join("")}
              </div>
            </div>
          ` : ""}

          ${recipeUrl ? `
            <a class="recipe-link" href="${escapeHtml(recipeUrl)}" target="_blank" rel="noreferrer">
              레시피 보기
            </a>
          ` : ""}
        `;

        const editBtn = card.querySelector(".edit");
        const deleteBtn = card.querySelector(".delete");

        editBtn.addEventListener("click", () => {
          editingMealId = id;
          fillMealForm(meal);
          byId("mealFormWrap").hidden = false;
          byId("showMealFormBtn").hidden = true;
          byId("mealFiltersWrap").hidden = true;
          byId("mealsContainer").hidden = true;
          byId("mealName").focus();
        });

        deleteBtn.addEventListener("click", () => {
          deleteMeal(id, name);
        });

        list.appendChild(card);
      }

      section.appendChild(list);
    }

    container.appendChild(section);
  }
}

// ─── Calendar Page ───

let calYear, calMonth, calSelectedDate;
let calMealLogs = {}; // { "YYYY-MM-DD": [...] }

function initCalendar() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
  calSelectedDate = now.toLocaleDateString("sv-SE");
}

function attachCalendarOverlay() {
  byId("calendarFab")?.addEventListener("click", openCalendarOverlay);
  byId("calCloseBtn")?.addEventListener("click", closeCalendarOverlay);
  byId("calendarOverlay")?.addEventListener("click", (e) => {
    if (e.target === byId("calendarOverlay")) closeCalendarOverlay();
  });
}

function openCalendarOverlay() {
  const overlay = byId("calendarOverlay");
  if (!overlay) return;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  loadCalendarMonth().then(() => {
    renderCalendar();
    showDayDetail(calSelectedDate);
  });
}

function closeCalendarOverlay() {
  const overlay = byId("calendarOverlay");
  if (overlay) overlay.hidden = true;
  document.body.style.overflow = "";
}

function attachCalendarEvents() {
  byId("calPrevMonth")?.addEventListener("click", () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  });
  byId("calNextMonth")?.addEventListener("click", () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  });
  byId("calToday")?.addEventListener("click", () => {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    calSelectedDate = now.toLocaleDateString("sv-SE");
    renderCalendar();
    showDayDetail(calSelectedDate);
  });
  byId("calAddMealBtn")?.addEventListener("click", async () => {
    byId("calAddMealForm").hidden = false;
    byId("calManualFields").hidden = true;
    const toggle = byId("calManualToggle");
    if (toggle) toggle.textContent = "직접 입력 ▸";
    await renderCalRecipeList();
  });
  byId("calCancelMealBtn")?.addEventListener("click", () => {
    byId("calAddMealForm").hidden = true;
    byId("calManualFields").hidden = true;
    byId("calMealName").value = "";
    byId("calMealImageUrl").value = "";
  });
  byId("calManualToggle")?.addEventListener("click", () => {
    const fields = byId("calManualFields");
    const toggle = byId("calManualToggle");
    if (fields.hidden) {
      fields.hidden = false;
      toggle.textContent = "직접 입력 ▾";
      byId("calMealName").focus();
    } else {
      fields.hidden = true;
      toggle.textContent = "직접 입력 ▸";
    }
  });
  byId("calSaveMealBtn")?.addEventListener("click", async () => {
    const name = byId("calMealName").value.trim();
    if (!name) { alert("요리 이름을 입력해주세요."); return; }
    try {
      await apiFetch(`${apiBase}/meal-logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: calSelectedDate,
          name,
          imageUrl: byId("calMealImageUrl").value.trim(),
          source: "manual",
        }),
      });
      byId("calAddMealForm").hidden = true;
      byId("calMealName").value = "";
      byId("calMealImageUrl").value = "";
      await loadCalendarMonth();
      showDayDetail(calSelectedDate);
    } catch (e) {
      alert("식사 기록에 실패했어요.");
    }
  });
}

async function loadCalendarMonth() {
  const startDate = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(calYear, calMonth + 1, 0).getDate();
  const endDate = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  try {
    const res = await apiFetch(`${apiBase}/meal-logs?startDate=${startDate}&endDate=${endDate}`);
    if (!res.ok) return;
    const logs = await res.json();
    calMealLogs = {};
    for (const log of logs) {
      const d = log.date ?? log.Date;
      if (!calMealLogs[d]) calMealLogs[d] = [];
      calMealLogs[d].push(log);
    }
  } catch (e) {
    console.error("loadCalendarMonth failed:", e);
  }
}

function renderCalendar() {
  const grid = byId("calendarGrid");
  if (!grid) return;

  const title = byId("calTitle");
  const monthNames = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
  title.textContent = `${calYear}년 ${monthNames[calMonth]}`;

  grid.innerHTML = "";

  // Day headers
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  for (const d of dayNames) {
    const hdr = document.createElement("div");
    hdr.className = "cal-day-header";
    hdr.textContent = d;
    grid.appendChild(hdr);
  }

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayStr = new Date().toLocaleDateString("sv-SE");

  // Blank cells before first day
  for (let i = 0; i < firstDay; i++) {
    const blank = document.createElement("div");
    blank.className = "cal-day empty";
    grid.appendChild(blank);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const cell = document.createElement("div");
    cell.className = "cal-day";
    if (dateStr === todayStr) cell.classList.add("today");
    if (dateStr === calSelectedDate) cell.classList.add("selected");

    const meals = calMealLogs[dateStr] || [];
    cell.innerHTML = `
      <span class="cal-day-num">${d}</span>
      ${meals.length ? `<span class="cal-day-dot">${meals.length > 1 ? meals.length : "●"}</span>` : ""}
    `;

    cell.addEventListener("click", () => {
      calSelectedDate = dateStr;
      renderCalendar();
      showDayDetail(dateStr);
    });

    grid.appendChild(cell);
  }
}

async function renderCalRecipeList() {
  const list = byId("calRecipeList");
  if (!list) return;
  list.innerHTML = `<div class="empty-message">불러오는 중...</div>`;

  try {
    const res = await apiFetch(`${apiBase}/meals`);
    if (!res.ok) { list.innerHTML = ""; return; }
    const meals = await res.json();
    const sorted = meals.sort((a, b) => {
      const na = (a.name ?? a.Name ?? "").toLowerCase();
      const nb = (b.name ?? b.Name ?? "").toLowerCase();
      return na.localeCompare(nb, "ko");
    });

    list.innerHTML = "";
    if (!sorted.length) {
      list.innerHTML = `<div class="empty-message">저장된 레시피가 없어요.</div>`;
      return;
    }

    for (const meal of sorted) {
      const name = meal.name ?? meal.Name ?? "";
      const imageUrl = meal.imageUrl ?? meal.ImageUrl ?? "";

      const item = document.createElement("button");
      item.type = "button";
      item.className = "cal-recipe-item";
      item.innerHTML = `
        ${imageUrl ? `<img class="cal-recipe-item-img" src="${escapeHtml(imageUrl)}" alt="" onerror="this.style.display='none'" />` : `<span class="cal-recipe-item-icon">🍽️</span>`}
        <span>${escapeHtml(name)}</span>
      `;
      item.addEventListener("click", async () => {
        try {
          await apiFetch(`${apiBase}/meal-logs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date: calSelectedDate, name, imageUrl }),
          });
          byId("calAddMealForm").hidden = true;
          await loadCalendarMonth();
          showDayDetail(calSelectedDate);
          renderCalendar();
        } catch (e) {
          alert("식사 기록에 실패했어요.");
        }
      });

      list.appendChild(item);
    }
  } catch (e) {
    console.error("renderCalRecipeList failed:", e);
    list.innerHTML = "";
  }
}

function showDayDetail(dateStr) {
  const detail = byId("calDayDetail");
  if (!detail) return;
  detail.hidden = false;

  const [y, m, d] = dateStr.split("-");
  byId("calDayTitle").textContent = `${parseInt(m)}월 ${parseInt(d)}일`;
  byId("calAddMealForm").hidden = true;

  const container = byId("calDayMeals");
  container.innerHTML = "";

  const meals = calMealLogs[dateStr] || [];
  if (!meals.length) {
    container.innerHTML = `<p class="empty-message">기록된 식사가 없어요.</p>`;
    return;
  }

  for (const meal of meals) {
    const name = meal.name ?? meal.Name ?? "";
    const imageUrl = meal.imageUrl ?? meal.ImageUrl ?? "";
    const id = meal.id ?? meal.Id ?? "";

    const row = document.createElement("div");
    row.className = "cal-meal-row";
    row.innerHTML = `
      ${imageUrl ? `<img class="cal-meal-img" src="${escapeHtml(imageUrl)}" alt="" onerror="this.style.display='none'" />` : ""}
      <div class="cal-meal-info">
        <span class="cal-meal-name">${escapeHtml(name)}</span>
      </div>
      <button type="button" class="icon-button delete" aria-label="삭제">${iconSvg("delete")}</button>
    `;

    row.querySelector(".delete").addEventListener("click", async () => {
      if (!confirm(`'${name}' 기록을 삭제할까요?`)) return;
      try {
        await apiFetch(`${apiBase}/meal-logs/${id}`, { method: "DELETE" });
        await loadCalendarMonth();
        showDayDetail(dateStr);
        renderCalendar();
      } catch (e) {
        alert("삭제에 실패했어요.");
      }
    });

    container.appendChild(row);
  }
}

document.addEventListener("DOMContentLoaded", init);

// Register service worker for PWA
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js").catch(() => {});
}