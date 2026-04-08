const apiBase = window.APP_CONFIG.apiBase;

let currentIngredients = [];
let classifyTimer = null;
let editingRowId = null;
let inlineDraft = { name: "", stockLevel: "보통", type: "기타" };

let pantryUiState = {
  search: "",
  lowOnly: false,
  sortKorean: true,
  type: "all",
};

let collapsedSections = {
  적음: false,
  보통: false,
  많음: false,
  없음: false,
};

let pantryCollapsed = false;
let filtersCollapsed = true;

function byId(id) {
  return document.getElementById(id);
}

function getEls() {
  return {
    ingredientNameInput: byId("ingredientName"),
    ingredientStockLevelInput: byId("ingredientStockLevel"),
    typePreview: byId("typePreview"),
    typePreviewValue: byId("typePreviewValue"),
    saveButton: byId("saveButton"),
    suggestButton: byId("suggestButton"),
    suggestionsDiv: byId("suggestions"),
    pantryStatus: byId("pantryStatus"),
    ingredientsSections: byId("ingredientsSections"),
    pantrySummary: byId("pantrySummary"),
    pantryToggleButton: byId("pantryToggleButton"),
    pantryContent: byId("pantryContent"),
    pantryCaret: byId("pantryCaret"),
    filterSearch: byId("filterSearch"),
    filterLowOnly: byId("filterLowOnly"),
    filterSortKorean: byId("filterSortKorean"),
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

function normalizeStockLevel(value) {
  const raw = String(value || "").trim();

  if (raw === "많음" || raw.toLowerCase() === "plenty") return "많음";
  if (raw === "적음" || raw.toLowerCase() === "low") return "적음";
  if (raw === "없음" || raw.toLowerCase() === "out") return "없음";
  if (raw === "보통" || raw.toLowerCase() === "some") return "보통";

  return "보통";
}

function ingredientStockOf(item) {
  return normalizeStockLevel(item.stockLevel ?? item.StockLevel ?? "보통");
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

function stockBadgeClass(stockLevel) {
  const value = normalizeStockLevel(stockLevel);

  if (value === "적음") return "badge low";
  if (value === "보통") return "badge some";
  if (value === "많음") return "badge plenty";
  return "badge out";
}

function groupClassName(stockLevel) {
  if (stockLevel === "적음") return "pantry-group low-group";
  if (stockLevel === "보통") return "pantry-group some-group";
  if (stockLevel === "많음") return "pantry-group plenty-group";
  return "pantry-group out-group";
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
  const response = await fetch(`${apiBase}/ingredients/classify-type`, {
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
    const response = await fetch(`${apiBase}/ingredients`);

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

  if (pantryUiState.lowOnly) {
    filtered = filtered.filter(
      (item) => ingredientStockOf(item) === "적음"
    );
  }

  if (pantryUiState.type !== "all") {
    filtered = filtered.filter(
      (item) => ingredientTypeOf(item) === pantryUiState.type
    );
  }

  if (pantryUiState.sortKorean) {
    filtered.sort((a, b) => compareKo(ingredientNameOf(a), ingredientNameOf(b)));
  }

  return filtered;
}

function buildPantrySummary(items) {
  const { pantrySummary } = getEls();
  if (!pantrySummary) return;

  const counts = {
    total: items.length,
    low: items.filter((x) => ingredientStockOf(x) === "적음").length,
    some: items.filter((x) => ingredientStockOf(x) === "보통").length,
    plenty: items.filter((x) => ingredientStockOf(x) === "많음").length,
    out: items.filter((x) => ingredientStockOf(x) === "없음").length,
  };

  pantrySummary.innerHTML = `
    <span class="summary-chip total">Total ${counts.total}</span>
    <span class="summary-chip low">적음 ${counts.low}</span>
    <span class="summary-chip some">보통 ${counts.some}</span>
    <span class="summary-chip plenty">많음 ${counts.plenty}</span>
    <span class="summary-chip out">없음 ${counts.out}</span>
  `;
}

function renderIngredients() {
  const { ingredientsSections } = getEls();
  if (!ingredientsSections) return;

  const filtered = applyIngredientFilters(currentIngredients);
  buildPantrySummary(filtered);

  ingredientsSections.innerHTML = "";

  if (!filtered.length) {
    ingredientsSections.innerHTML = `
      <div class="empty-state">조건에 맞는 재료가 없어요.</div>
    `;
    return;
  }

  const groups = {
    적음: [],
    보통: [],
    많음: [],
    없음: [],
  };

  filtered.forEach((item) => {
    groups[ingredientStockOf(item)].push(item);
  });

  const order = ["적음", "보통", "많음", "없음"];

  for (const groupName of order) {
    const items = groups[groupName];
    if (!items.length) continue;

    const section = document.createElement("section");
    section.className = groupClassName(groupName);

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
        const stock = ingredientStockOf(item);
        const type = ingredientTypeOf(item);
        const isEditing = editingRowId === id;

        row.innerHTML = `
          <div class="ingredient-row-top">
            <div class="item-main">
              <div class="item-name">${escapeHtml(name)}</div>
              <div class="item-meta">
                <span class="${stockBadgeClass(stock)}">${escapeHtml(stock)}</span>
                <span class="type-badge">${escapeHtml(typeDisplay(type))}</span>
              </div>
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
                <label class="inline-edit-label" for="inline-stock-${id}">수량</label>
                <select class="inline-edit-select" id="inline-stock-${id}">
                  <option value="적음" ${inlineDraft.stockLevel === "적음" ? "selected" : ""}>적음</option>
                  <option value="보통" ${inlineDraft.stockLevel === "보통" ? "selected" : ""}>보통</option>
                  <option value="많음" ${inlineDraft.stockLevel === "많음" ? "selected" : ""}>많음</option>
                  <option value="없음" ${inlineDraft.stockLevel === "없음" ? "selected" : ""}>없음</option>
                </select>
              </div>

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

        if (isEditing) {
          const stockSelect = row.querySelector(`#inline-stock-${id}`);
          const typeSelect = row.querySelector(`#inline-type-${id}`);
          const saveBtn = row.querySelector(".inline-save-btn");
          const cancelBtn = row.querySelector(".inline-cancel-btn");

          if (stockSelect) {
            stockSelect.addEventListener("change", (e) => {
              inlineDraft.stockLevel = e.target.value;
            });
          }

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
    stockLevel: ingredientStockOf(item),
    type: ingredientTypeOf(item),
  };
  renderIngredients();
}

function cancelInlineEdit() {
  editingRowId = null;
  inlineDraft = { name: "", stockLevel: "보통", type: "기타" };
  renderIngredients();
}

function resetForm() {
  const {
    ingredientNameInput,
    ingredientStockLevelInput,
    typePreview,
    typePreviewValue,
    saveButton,
  } = getEls();

  ingredientNameInput.value = "";
  ingredientStockLevelInput.value = "보통";

  if (typePreview) typePreview.hidden = false;
  if (typePreviewValue) typePreviewValue.textContent = "기타";

  saveButton.textContent = "재료 추가";
}

async function saveIngredient() {
  const { ingredientNameInput, ingredientStockLevelInput, saveButton } = getEls();

  const name = ingredientNameInput.value.trim();

  if (!name) {
    alert("재료명을 입력해주세요.");
    ingredientNameInput.focus();
    return;
  }

  const payload = {
    name,
    stockLevel: ingredientStockLevelInput.value,
  };

  try {
    setBusy(saveButton, true, "추가 중...");

    const response = await fetch(`${apiBase}/ingredients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
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
    const response = await fetch(`${apiBase}/ingredients/${id}`, {
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
    stockLevel: inlineDraft.stockLevel,
    type: normalizeType(inlineDraft.type),
  };

  try {
    const response = await fetch(`${apiBase}/ingredients/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to save ingredient: ${response.status} ${text}`);
    }

    editingRowId = null;
    inlineDraft = { name: "", stockLevel: "보통", type: "기타" };
    await loadIngredients();
    showStatus("재료를 수정했어요.");
  } catch (error) {
    console.error("saveInlineEdit failed:", error);
    alert("재료 저장에 실패했어요.");
  }
}

async function suggestDinner() {
  const { suggestButton, suggestionsDiv } = getEls();

  try {
    setBusy(suggestButton, true, "추천 중...");

    suggestionsDiv.innerHTML = `
      <div class="empty-state">추천 메뉴를 불러오는 중...</div>
    `;

    const response = await fetch(`${apiBase}/suggestions`, {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Failed to load suggestions: ${response.status}`);
    }

    const suggestions = await response.json();
    const safeSuggestions = Array.isArray(suggestions) ? suggestions : [];

    renderSuggestions(safeSuggestions);
  } catch (error) {
    console.error("suggestDinner failed:", error);

    suggestionsDiv.innerHTML = `
      <div class="empty-state">추천을 불러오지 못했어요.</div>
    `;
  } finally {
    setBusy(suggestButton, false);
  }
}

function renderSuggestions(suggestions) {
  const { suggestionsDiv } = getEls();
  suggestionsDiv.innerHTML = "";

  if (!suggestions.length) {
    suggestionsDiv.innerHTML = `
      <div class="empty-state">추천 가능한 메뉴가 아직 없어요.</div>
    `;
    return;
  }

  suggestions.forEach((item) => {
    const card = document.createElement("article");
    card.className = "suggestion";

    const missing = Array.isArray(item.missingIngredients ?? item.MissingIngredients)
      ? (item.missingIngredients ?? item.MissingIngredients)
      : [];

    const low = Array.isArray(item.lowStockIngredients ?? item.LowStockIngredients)
      ? (item.lowStockIngredients ?? item.LowStockIngredients)
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

    const statusBadge = canMakeNow
      ? `<span class="suggestion-pill ready">지금 가능</span>`
      : `<span class="suggestion-pill missing">재료 필요 ${missing.length}</span>`;

    const difficultyBadge = difficulty
      ? `<span class="suggestion-pill difficulty-${difficulty === '쉬움' ? 'easy' : difficulty === '어려움' ? 'hard' : 'medium'}">${escapeHtml(difficulty)}</span>`
      : "";

    const cookTimeBadge = cookTime
      ? `<span class="suggestion-pill cook-time">⏱ ${escapeHtml(cookTime)}</span>`
      : "";

    card.innerHTML = `
      <div class="suggestion-top">
        <div class="suggestion-title-wrap">
          <h3>${escapeHtml(name)}</h3>
          <div class="suggestion-subchips">
            <span class="suggestion-cuisine">${escapeHtml(cuisine || "추천")}</span>
            ${statusBadge}
            ${difficultyBadge}
            ${cookTimeBadge}
          </div>
        </div>
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

      ${
        low.length
          ? `
          <div class="suggestion-section">
            <div class="suggestion-label">적은 재료</div>
            <div class="suggestion-chip-row">
              ${low.map(x => `<span class="ingredient-chip low">${escapeHtml(x)}</span>`).join("")}
            </div>
          </div>
          `
          : ""
      }

      ${
        recipeUrl
          ? `
          <a class="recipe-link" href="${escapeHtml(recipeUrl)}" target="_blank" rel="noreferrer">
            레시피 보기${recipeSource ? ` · ${escapeHtml(recipeSource)}` : ""}
          </a>
          `
          : ""
      }
    `;

    suggestionsDiv.appendChild(card);
  });
}

function syncFilterStateFromUi() {
  const { filterSearch, filterLowOnly, filterSortKorean, filterTypeSelect } = getEls();

  pantryUiState.search = filterSearch ? filterSearch.value.trim() : "";
  pantryUiState.lowOnly = Boolean(filterLowOnly?.checked);
  pantryUiState.sortKorean = filterSortKorean ? filterSortKorean.checked : true;
  pantryUiState.type = filterTypeSelect ? filterTypeSelect.value : "all";
}

function syncUiFromFilterState() {
  const { filterSearch, filterLowOnly, filterSortKorean, filterTypeSelect } = getEls();

  if (filterSearch) filterSearch.value = pantryUiState.search;
  if (filterLowOnly) filterLowOnly.checked = pantryUiState.lowOnly;
  if (filterSortKorean) filterSortKorean.checked = pantryUiState.sortKorean;
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
    lowOnly: false,
    sortKorean: true,
    type: "all",
  };

  syncUiFromFilterState();
  renderIngredients();
}

function attachFilterEvents() {
  const {
    filterSearch,
    filterLowOnly,
    filterSortKorean,
    filterTypeSelect,
    clearFiltersButton,
    toggleFiltersButton,
    pantryToggleButton,
  } = getEls();

  if (filterSearch) {
    filterSearch.addEventListener("input", () => {
      syncFilterStateFromUi();
      renderIngredients();
    });
  }

  if (filterLowOnly) {
    filterLowOnly.addEventListener("change", () => {
      syncFilterStateFromUi();
      renderIngredients();
    });
  }

  if (filterSortKorean) {
    filterSortKorean.addEventListener("change", () => {
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

  if (pantryToggleButton) {
    pantryToggleButton.addEventListener("click", () => {
      pantryCollapsed = !pantryCollapsed;
      renderPantryCollapsedState();
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

function renderPantryCollapsedState() {
  const { pantryContent, pantryCaret } = getEls();

  if (pantryContent) {
    pantryContent.hidden = pantryCollapsed;
  }

  if (pantryCaret) {
    pantryCaret.textContent = pantryCollapsed ? "▸" : "▾";
  }
}

function init() {
  syncUiFromFilterState();
  renderPantryCollapsedState();
  renderFiltersCollapsedState();
  attachFilterEvents();
  attachFormEvents();
  resetForm();
  loadIngredients();
}

document.addEventListener("DOMContentLoaded", init);