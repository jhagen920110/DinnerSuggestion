const apiBase = "http://localhost:7071/api";

let currentIngredients = [];
let classifyTimer = null;
let editingRowId = null;

let pantryUiState = {
  search: "",
  amount: "all",
  sort: "hangul-asc",
  type: "all",
};

let collapsedSections = {
  "적음": false,
  "보통": true,
  "많음": true,
  "없음": true,
};

let filtersCollapsed = true;

function byId(id) {
  return document.getElementById(id);
}

function getEls() {
  return {
    ingredientNameInput: byId("ingredientName"),
    ingredientStockLevelInput: byId("ingredientStockLevel"),
    ingredientTypeInput: byId("ingredientType"),
    saveButton: byId("saveButton"),
    suggestButton: byId("suggestButton"),
    suggestionsDiv: byId("suggestions"),
    pantryCount: byId("pantryCount"),
    suggestionCount: byId("suggestionCount"),
    pantryStatus: byId("pantryStatus"),
    ingredientsSections: byId("ingredientsSections"),
    pantrySummary: byId("pantrySummary"),
    filterSearch: byId("filterSearch"),
    clearFiltersButton: byId("clearFiltersButton"),
    toggleFiltersButton: byId("toggleFiltersButton"),
    filtersContent: byId("filtersContent"),
    filtersCaret: byId("filtersCaret"),
  };
}

function escapeHtml(value) {
  return String(value)
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
  return item.id ?? item.Id;
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

function hasKoreanChar(text) {
  return /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(String(text || ""));
}

function compareKo(a, b) {
  return String(a).localeCompare(String(b), "ko");
}

function compareEn(a, b) {
  return String(a).localeCompare(String(b), "en", { sensitivity: "base" });
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
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20h4l10.5-10.5a1.4 1.4 0 0 0 0-2L16.5 5a1.4 1.4 0 0 0-2 0L4 15.5V20zm11.8-13.8 2 2"></path>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16"></path>
      <path d="M9 7V5h6v2"></path>
      <path d="M7 7l1 12h8l1-12"></path>
      <path d="M10 11v5"></path>
      <path d="M14 11v5"></path>
    </svg>
  `;
}

function getCheckedValue(name, fallback) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : fallback;
}

function setCheckedValue(name, value) {
  const target = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (target) {
    target.checked = true;
  }
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

async function loadIngredients() {
  const { pantryCount, ingredientsSections } = getEls();
  if (!ingredientsSections) return;

  try {
    const response = await fetch(`${apiBase}/ingredients`);
    if (!response.ok) {
      throw new Error(`Failed to load ingredients: ${response.status}`);
    }

    const items = await response.json();
    currentIngredients = Array.isArray(items) ? items : [];

    if (pantryCount) {
      pantryCount.textContent = String(currentIngredients.length);
    }

    renderIngredients();
  } catch (error) {
    console.error("loadIngredients failed:", error);
    ingredientsSections.innerHTML = `<div class="empty-state">Failed to load ingredients.</div>`;

    if (pantryCount) {
      pantryCount.textContent = "0";
    }
  }
}

function applyIngredientFilters(items) {
  let filtered = [...items];

  if (pantryUiState.search) {
    const q = pantryUiState.search.toLowerCase();
    filtered = filtered.filter((item) => ingredientNameOf(item).toLowerCase().includes(q));
  }

  if (pantryUiState.amount !== "all") {
    filtered = filtered.filter((item) => ingredientStockOf(item) === pantryUiState.amount);
  }

  if (pantryUiState.type !== "all") {
    filtered = filtered.filter((item) => ingredientTypeOf(item) === pantryUiState.type);
  }

  if (pantryUiState.sort === "hangul-asc") {
    filtered.sort((a, b) => compareKo(ingredientNameOf(a), ingredientNameOf(b)));
  } else if (pantryUiState.sort === "latin-asc") {
    filtered.sort((a, b) => compareEn(ingredientNameOf(a), ingredientNameOf(b)));
  } else {
    filtered.sort((a, b) => {
      const aId = String(ingredientIdOf(a) ?? "");
      const bId = String(ingredientIdOf(b) ?? "");
      return compareEn(bId, aId);
    });
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
    <div class="summary-pill">전체 <strong>${counts.total}</strong></div>
    <div class="summary-pill low">적음 <strong>${counts.low}</strong></div>
    <div class="summary-pill some">보통 <strong>${counts.some}</strong></div>
    <div class="summary-pill plenty">많음 <strong>${counts.plenty}</strong></div>
    <div class="summary-pill out">없음 <strong>${counts.out}</strong></div>
  `;
}

function renderIngredients() {
  const { ingredientsSections } = getEls();
  if (!ingredientsSections) return;

  const filteredItems = applyIngredientFilters(currentIngredients);
  buildPantrySummary(filteredItems);

  ingredientsSections.innerHTML = "";

  if (!filteredItems.length) {
    ingredientsSections.innerHTML = `<div class="empty-state">No ingredients match your filters.</div>`;
    return;
  }

  const shouldGroupByAmount = pantryUiState.amount === "all";

  if (!shouldGroupByAmount) {
    const list = document.createElement("ul");
    list.className = "ingredient-list";

    filteredItems.forEach((item) => {
      list.appendChild(createIngredientRow(item));
    });

    ingredientsSections.appendChild(list);
    return;
  }

  const grouped = {
    "적음": [],
    "보통": [],
    "많음": [],
    "없음": [],
  };

  filteredItems.forEach((item) => {
    grouped[ingredientStockOf(item)].push(item);
  });

  const order = ["적음", "보통", "많음", "없음"];
  const fragment = document.createDocumentFragment();

  for (const stockKey of order) {
    const items = grouped[stockKey];
    if (!items.length) continue;

    const section = document.createElement("section");
    section.className = groupClassName(stockKey);

    const headerButton = document.createElement("button");
    headerButton.type = "button";
    headerButton.className = "group-header";
    headerButton.setAttribute("aria-expanded", String(!collapsedSections[stockKey]));
    headerButton.innerHTML = `
      <div class="group-title-wrap">
        <span class="caret">${collapsedSections[stockKey] ? "▸" : "▾"}</span>
        <span class="${stockBadgeClass(stockKey)}">${stockKey}</span>
        <span class="group-title">${stockKey}</span>
      </div>
      <span class="group-count">${items.length}</span>
    `;

    headerButton.addEventListener("click", () => {
      collapsedSections[stockKey] = !collapsedSections[stockKey];
      renderIngredients();
    });

    section.appendChild(headerButton);

    if (!collapsedSections[stockKey]) {
      const list = document.createElement("ul");
      list.className = "ingredient-list";

      items.forEach((item) => {
        list.appendChild(createIngredientRow(item));
      });

      section.appendChild(list);
    }

    fragment.appendChild(section);
  }

  ingredientsSections.appendChild(fragment);
}

function createIngredientRow(item) {
  const id = ingredientIdOf(item);
  const name = ingredientNameOf(item);
  const stockLevel = ingredientStockOf(item);
  const type = ingredientTypeOf(item);

  const li = document.createElement("li");
  li.className = "ingredient-row";

  const mainDiv = document.createElement("div");
  mainDiv.className = "item-main";

  const nameDiv = document.createElement("div");
  nameDiv.className = "item-name";
  nameDiv.textContent = name;

  const metaDiv = document.createElement("div");
  metaDiv.className = "item-meta";

  const amountBadge = document.createElement("span");
  amountBadge.className = stockBadgeClass(stockLevel);
  amountBadge.textContent = stockLevel;

  const typeBadge = document.createElement("span");
  typeBadge.className = "type-badge";
  typeBadge.textContent = type;

  const orderBadge = document.createElement("span");
  orderBadge.className = "alphabet-badge";
  orderBadge.textContent = hasKoreanChar(name) ? "가나다" : "ABC";

  metaDiv.appendChild(amountBadge);
  metaDiv.appendChild(typeBadge);
  metaDiv.appendChild(orderBadge);

  mainDiv.appendChild(nameDiv);
  mainDiv.appendChild(metaDiv);

  if (editingRowId === id) {
    mainDiv.appendChild(createInlineEditBox(item));
  }

  const actionsDiv = document.createElement("div");
  actionsDiv.className = "item-actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "icon-button edit";
  editBtn.title = "수정";
  editBtn.setAttribute("aria-label", "수정");
  editBtn.innerHTML = iconSvg("edit");
  editBtn.addEventListener("click", () => {
    editingRowId = editingRowId === id ? null : id;
    renderIngredients();
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "icon-button delete";
  deleteBtn.title = "삭제";
  deleteBtn.setAttribute("aria-label", "삭제");
  deleteBtn.innerHTML = iconSvg("delete");
  deleteBtn.addEventListener("click", async () => {
    const confirmed = window.confirm(`Delete "${name}"?`);
    if (!confirmed) return;
    await deleteIngredient(id);
  });

  actionsDiv.appendChild(editBtn);
  actionsDiv.appendChild(deleteBtn);

  li.appendChild(mainDiv);
  li.appendChild(actionsDiv);

  return li;
}

function createInlineEditBox(item) {
  const id = ingredientIdOf(item);
  const stockLevel = ingredientStockOf(item);
  const type = ingredientTypeOf(item);

  const box = document.createElement("div");
  box.className = "inline-edit-box";

  box.innerHTML = `
    <div class="inline-edit-title">Quick edit</div>
    <div class="inline-edit-grid">
      <label class="field">
        <span class="inline-label">수량</span>
        <select data-inline-stock>
          <option value="많음" ${stockLevel === "많음" ? "selected" : ""}>많음</option>
          <option value="보통" ${stockLevel === "보통" ? "selected" : ""}>보통</option>
          <option value="적음" ${stockLevel === "적음" ? "selected" : ""}>적음</option>
          <option value="없음" ${stockLevel === "없음" ? "selected" : ""}>없음</option>
        </select>
      </label>

      <label class="field">
        <span class="inline-label">종류</span>
        <select data-inline-type>
          <option value="야채" ${type === "야채" ? "selected" : ""}>야채</option>
          <option value="탄수화물" ${type === "탄수화물" ? "selected" : ""}>탄수화물</option>
          <option value="고기/단백질" ${type === "고기/단백질" ? "selected" : ""}>고기/단백질</option>
          <option value="유제품" ${type === "유제품" ? "selected" : ""}>유제품</option>
          <option value="과일" ${type === "과일" ? "selected" : ""}>과일</option>
          <option value="소스/조미료" ${type === "소스/조미료" ? "selected" : ""}>소스/조미료</option>
          <option value="냉동식품" ${type === "냉동식품" ? "selected" : ""}>냉동식품</option>
          <option value="기타" ${type === "기타" ? "selected" : ""}>기타</option>
        </select>
      </label>
    </div>
    <div class="inline-edit-actions">
      <button type="button" class="btn btn-primary" data-inline-save>Save</button>
      <button type="button" class="btn btn-secondary" data-inline-cancel>Cancel</button>
    </div>
  `;

  const stockSelect = box.querySelector("[data-inline-stock]");
  const typeSelect = box.querySelector("[data-inline-type]");
  const saveBtn = box.querySelector("[data-inline-save]");
  const cancelBtn = box.querySelector("[data-inline-cancel]");

  saveBtn.addEventListener("click", async () => {
    await updateIngredientInline(id, {
      name: ingredientNameOf(item),
      stockLevel: stockSelect.value,
      type: typeSelect.value,
    });
  });

  cancelBtn.addEventListener("click", () => {
    editingRowId = null;
    renderIngredients();
  });

  return box;
}

async function saveIngredient() {
  const {
    ingredientNameInput,
    ingredientStockLevelInput,
    ingredientTypeInput,
    saveButton
  } = getEls();

  if (!ingredientNameInput || !ingredientStockLevelInput || !ingredientTypeInput) {
    alert("Pantry form is not loaded correctly.");
    return;
  }

  const name = ingredientNameInput.value.trim();
  const stockLevel = ingredientStockLevelInput.value || "보통";
  const type = ingredientTypeInput.value || "기타";

  if (!name) {
    alert("Ingredient name is required.");
    ingredientNameInput.focus();
    return;
  }

  const payload = { name, stockLevel, type };

  try {
    setBusy(saveButton, true, "Adding...");

    const response = await fetch(`${apiBase}/ingredients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to save ingredient: ${response.status} ${text}`);
    }

    resetTopForm();
    await loadIngredients();
    showStatus("재료가 추가되었습니다.");
  } catch (error) {
    console.error("saveIngredient failed:", error);
    alert("Failed to save ingredient.");
  } finally {
    setBusy(saveButton, false);
  }
}

async function updateIngredientInline(id, payload) {
  try {
    const response = await fetch(`${apiBase}/ingredients/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to update ingredient: ${response.status} ${text}`);
    }

    editingRowId = null;
    await loadIngredients();
    showStatus("재료가 수정되었습니다.");
  } catch (error) {
    console.error("updateIngredientInline failed:", error);
    alert("Failed to update ingredient.");
  }
}

function resetTopForm() {
  const {
    ingredientNameInput,
    ingredientStockLevelInput,
    ingredientTypeInput,
  } = getEls();

  if (ingredientNameInput) ingredientNameInput.value = "";
  if (ingredientStockLevelInput) ingredientStockLevelInput.value = "보통";
  if (ingredientTypeInput) ingredientTypeInput.value = "기타";
}

async function deleteIngredient(id) {
  try {
    const response = await fetch(`${apiBase}/ingredients/${id}`, { method: "DELETE" });

    if (!response.ok && response.status !== 204) {
      throw new Error(`Failed to delete ingredient: ${response.status}`);
    }

    if (editingRowId === id) {
      editingRowId = null;
    }

    await loadIngredients();
    showStatus("재료가 삭제되었습니다.");
  } catch (error) {
    console.error("deleteIngredient failed:", error);
    alert("Failed to delete ingredient.");
  }
}

async function loadSuggestions() {
  const { suggestionsDiv, suggestButton, suggestionCount } = getEls();
  if (!suggestionsDiv) return;

  try {
    setBusy(suggestButton, true, "Loading...");

    const response = await fetch(`${apiBase}/suggestions`, { method: "POST" });
    if (!response.ok) {
      throw new Error(`Failed to load suggestions: ${response.status}`);
    }

    const items = await response.json();
    renderSuggestions(Array.isArray(items) ? items : []);
  } catch (error) {
    console.error("loadSuggestions failed:", error);
    suggestionsDiv.innerHTML = `<div class="empty-state">Failed to load suggestions.</div>`;

    if (suggestionCount) {
      suggestionCount.textContent = "0";
    }
  } finally {
    setBusy(suggestButton, false);
  }
}

function renderSuggestions(items) {
  const { suggestionsDiv, suggestionCount } = getEls();
  if (!suggestionsDiv) return;

  const sortedItems = [...items].sort((a, b) => {
    const aReady = a.canMakeNow ?? a.CanMakeNow ?? false;
    const bReady = b.canMakeNow ?? b.CanMakeNow ?? false;
    return Number(bReady) - Number(aReady);
  });

  if (suggestionCount) {
    suggestionCount.textContent = String(sortedItems.length);
  }

  suggestionsDiv.innerHTML = "";

  if (!sortedItems.length) {
    suggestionsDiv.innerHTML = `<div class="empty-state">No suggestions available.</div>`;
    return;
  }

  const fallbackRecipeUrl = "https://www.10000recipe.com/recipe/1785098";

  for (const item of sortedItems) {
    const name = item.name ?? item.Name ?? "";
    const cuisine = item.cuisine ?? item.Cuisine ?? "";
    const canMakeNow = item.canMakeNow ?? item.CanMakeNow ?? false;
    const missingIngredients = item.missingIngredients ?? item.MissingIngredients ?? [];
    const lowStockIngredients = item.lowStockIngredients ?? item.LowStockIngredients ?? [];
    const uses = item.uses ?? item.Uses ?? [];
    const recipeUrl =
      (item.recipeUrl && item.recipeUrl.trim()) ||
      (item.RecipeUrl && item.RecipeUrl.trim()) ||
      fallbackRecipeUrl;
    const recipeSource =
      (item.recipeSource && item.recipeSource.trim()) ||
      (item.RecipeSource && item.RecipeSource.trim()) ||
      "10000recipe";

    const div = document.createElement("div");
    div.className = "suggestion";

    const header = document.createElement("div");
    header.className = "suggestion-header";

    const title = document.createElement("h3");
    title.className = "suggestion-title";
    title.textContent = name;

    const metaRow = document.createElement("div");
    metaRow.className = "suggestion-meta";

    if (cuisine) {
      metaRow.innerHTML += `<span class="meta-pill">${escapeHtml(cuisine)}</span>`;
    }

    if (canMakeNow) {
      metaRow.innerHTML += `<span class="meta-pill success">Can make now</span>`;
    } else if (missingIngredients.length > 0) {
      metaRow.innerHTML += `<span class="meta-pill warn">Missing ${missingIngredients.length}</span>`;
    }

    if (lowStockIngredients.length > 0) {
      metaRow.innerHTML += `<span class="meta-pill caution">Low stock ${lowStockIngredients.length}</span>`;
    }

    header.appendChild(title);
    header.appendChild(metaRow);

    const usesBlock = document.createElement("div");
    usesBlock.className = "uses-block";

    const usesLabel = document.createElement("div");
    usesLabel.className = "detail-label standalone";
    usesLabel.textContent = "Uses";

    const usesChips = document.createElement("div");
    usesChips.className = "chip-row";

    for (const ingredient of uses) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = ingredient;
      usesChips.appendChild(chip);
    }

    usesBlock.appendChild(usesLabel);
    usesBlock.appendChild(usesChips);

    const details = document.createElement("div");
    details.className = "suggestion-details";

    if (!canMakeNow && missingIngredients.length > 0) {
      const missing = document.createElement("p");
      missing.className = "detail-line missing-line";
      missing.innerHTML = `<strong>Missing:</strong> ${escapeHtml(missingIngredients.join(", "))}`;
      details.appendChild(missing);
    }

    if (lowStockIngredients.length > 0) {
      const low = document.createElement("p");
      low.className = "detail-line low-line";
      low.innerHTML = `<strong>Low stock:</strong> ${escapeHtml(lowStockIngredients.join(", "))}`;
      details.appendChild(low);
    }

    const recipeCard = document.createElement("a");
    recipeCard.className = "recipe-preview";
    recipeCard.href = recipeUrl;
    recipeCard.target = "_blank";
    recipeCard.rel = "noreferrer";
    recipeCard.innerHTML = `
      <div class="recipe-source">${escapeHtml(recipeSource)}</div>
      <div class="recipe-title">Recipe link</div>
      <div class="recipe-url">${escapeHtml(recipeUrl)}</div>
    `;

    div.appendChild(header);
    div.appendChild(usesBlock);
    div.appendChild(details);
    div.appendChild(recipeCard);

    suggestionsDiv.appendChild(div);
  }
}

function syncFiltersFromUi() {
  const { filterSearch } = getEls();

  pantryUiState = {
    search: filterSearch?.value.trim() ?? "",
    amount: getCheckedValue("filterAmount", "all"),
    sort: getCheckedValue("filterSort", "hangul-asc"),
    type: getCheckedValue("filterType", "all"),
  };
}

function clearFilters() {
  const { filterSearch } = getEls();

  if (filterSearch) filterSearch.value = "";

  setCheckedValue("filterAmount", "all");
  setCheckedValue("filterSort", "hangul-asc");
  setCheckedValue("filterType", "all");

  syncFiltersFromUi();
  renderIngredients();
}

function renderFiltersCollapsedState() {
  const { filtersContent, toggleFiltersButton, filtersCaret } = getEls();
  if (!filtersContent || !toggleFiltersButton || !filtersCaret) return;

  filtersContent.classList.toggle("hidden", filtersCollapsed);
  toggleFiltersButton.setAttribute("aria-expanded", String(!filtersCollapsed));
  filtersCaret.textContent = filtersCollapsed ? "▸" : "▾";
}

function wireUpFilters() {
  const {
    filterSearch,
    clearFiltersButton,
    toggleFiltersButton,
  } = getEls();

  const radioInputs = document.querySelectorAll(
    'input[name="filterSort"], input[name="filterAmount"], input[name="filterType"]'
  );

  if (filterSearch) {
    filterSearch.addEventListener("input", () => {
      syncFiltersFromUi();
      renderIngredients();
    });
  }

  radioInputs.forEach((el) => {
    el.addEventListener("change", () => {
      syncFiltersFromUi();
      renderIngredients();
    });
  });

  if (clearFiltersButton) {
    clearFiltersButton.addEventListener("click", clearFilters);
  }

  if (toggleFiltersButton) {
    toggleFiltersButton.addEventListener("click", () => {
      filtersCollapsed = !filtersCollapsed;
      renderFiltersCollapsedState();
    });
  }

  renderFiltersCollapsedState();
}

function wireUpTypeAutoClassify() {
  const { ingredientNameInput, ingredientTypeInput } = getEls();

  if (!ingredientNameInput || !ingredientTypeInput) return;

  ingredientNameInput.addEventListener("input", () => {
    const name = ingredientNameInput.value.trim();

    window.clearTimeout(classifyTimer);

    if (!name) {
      ingredientTypeInput.value = "기타";
      return;
    }

    classifyTimer = window.setTimeout(async () => {
      try {
        const result = await classifyIngredientType(name);
        if (ingredientNameInput.value.trim() === name && result?.type) {
          ingredientTypeInput.value = result.type;
        }
      } catch (error) {
        console.error("classifyIngredientType failed:", error);
      }
    }, 350);
  });
}

function wireUp() {
  const {
    ingredientNameInput,
    saveButton,
    suggestButton,
  } = getEls();

  if (saveButton) saveButton.addEventListener("click", saveIngredient);
  if (suggestButton) suggestButton.addEventListener("click", loadSuggestions);

  if (ingredientNameInput) {
    ingredientNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveIngredient();
      }
    });
  }

  wireUpFilters();
  wireUpTypeAutoClassify();
  loadIngredients();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wireUp);
} else {
  wireUp();
}