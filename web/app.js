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
  적음: false,
  보통: true,
  많음: true,
  없음: true,
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
    typePreview: byId("typePreview"),
    typePreviewValue: byId("typePreviewValue"),
    saveButton: byId("saveButton"),
    cancelEditButton: byId("cancelEditButton"),
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
  const raw = String(value || "").trim().toLowerCase();
  const allowed = [
    "vegetable",
    "carb",
    "protein",
    "dairy",
    "fruit",
    "sauce",
    "frozen",
    "other",
  ];

  return allowed.includes(raw) ? raw : "other";
}

function ingredientTypeOf(item) {
  return normalizeType(item.type ?? item.Type ?? "other");
}

function typeDisplay(type) {
  switch (normalizeType(type)) {
    case "vegetable": return "야채";
    case "carb": return "탄수화물";
    case "protein": return "고기/단백질";
    case "dairy": return "유제품";
    case "fruit": return "과일";
    case "sauce": return "소스/조미료";
    case "frozen": return "냉동식품";
    default: return "기타";
  }
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
      <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
        <path d="M4 20h4l10-10-4-4L4 16v4zm13.7-11.3a1 1 0 0 0 0-1.4l-1-1a1 1 0 0 0-1.4 0l-1 1 4 4 1-1z" fill="currentColor"></path>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
      <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v8h-2V9zm4 0h2v8h-2V9zM7 9h2v8H7V9zm-1 11h12a2 2 0 0 0 2-2V7H4v11a2 2 0 0 0 2 2z" fill="currentColor"></path>
    </svg>
  `;
}

function getCheckedValue(name, fallback) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : fallback;
}

function setCheckedValue(name, value) {
  const target = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (target) target.checked = true;
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
  const { ingredientNameInput, ingredientTypeInput, typePreviewValue } = getEls();
  if (!ingredientNameInput || !ingredientTypeInput || !typePreviewValue) return;
  if (editingRowId) return;

  const name = ingredientNameInput.value.trim();
  if (!name) {
    ingredientTypeInput.value = "other";
    typePreviewValue.textContent = "기타";
    return;
  }

  try {
    const result = await classifyIngredientType(name);
    const detectedType = normalizeType(result.type);
    ingredientTypeInput.value = detectedType;
    typePreviewValue.textContent = typeDisplay(detectedType);
  } catch (error) {
    console.error("classifyIngredientType failed:", error);
    ingredientTypeInput.value = "other";
    typePreviewValue.textContent = "기타";
  }
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
    <div class="summary-chip total">Total ${counts.total}</div>
    <div class="summary-chip low">적음 ${counts.low}</div>
    <div class="summary-chip some">보통 ${counts.some}</div>
    <div class="summary-chip plenty">많음 ${counts.plenty}</div>
    <div class="summary-chip out">없음 ${counts.out}</div>
  `;
}

function renderIngredients() {
  const { ingredientsSections } = getEls();
  if (!ingredientsSections) return;

  const filtered = applyIngredientFilters(currentIngredients);
  buildPantrySummary(filtered);

  ingredientsSections.innerHTML = "";

  if (!filtered.length) {
    ingredientsSections.innerHTML = `<div class="empty-state">조건에 맞는 재료가 없어요.</div>`;
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

        const name = ingredientNameOf(item);
        const stock = ingredientStockOf(item);
        const type = ingredientTypeOf(item);

        row.innerHTML = `
          <div class="item-main">
            <div class="item-name">${escapeHtml(name)}</div>
            <div class="item-meta">
              <span class="${stockBadgeClass(stock)}">${escapeHtml(stock)}</span>
              <span class="type-badge">${escapeHtml(typeDisplay(type))}</span>
            </div>
          </div>
          <div class="item-actions">
            <button type="button" class="icon-button edit" aria-label="수정">${iconSvg("edit")}</button>
            <button type="button" class="icon-button delete" aria-label="삭제">${iconSvg("delete")}</button>
          </div>
        `;

        const [editButton, deleteButton] = row.querySelectorAll("button");

        editButton.addEventListener("click", () => {
          startEditIngredient(item);
        });

        deleteButton.addEventListener("click", async () => {
          const confirmed = window.confirm(`'${name}' 재료를 삭제할까요?`);
          if (!confirmed) return;
          await deleteIngredient(ingredientIdOf(item));
        });

        list.appendChild(row);
      }

      section.appendChild(list);
    }

    ingredientsSections.appendChild(section);
  }
}

function startEditIngredient(item) {
  const {
    ingredientNameInput,
    ingredientStockLevelInput,
    ingredientTypeInput,
    typePreview,
    saveButton,
    cancelEditButton,
  } = getEls();

  editingRowId = ingredientIdOf(item);

  ingredientNameInput.value = ingredientNameOf(item);
  ingredientStockLevelInput.value = ingredientStockOf(item);
  ingredientTypeInput.hidden = false;
  ingredientTypeInput.value = ingredientTypeOf(item);
  if (typePreview) typePreview.hidden = true;

  saveButton.textContent = "수정 저장";
  cancelEditButton.hidden = false;
}

function resetForm() {
  const {
    ingredientNameInput,
    ingredientStockLevelInput,
    ingredientTypeInput,
    typePreview,
    typePreviewValue,
    saveButton,
    cancelEditButton,
  } = getEls();

  editingRowId = null;
  ingredientNameInput.value = "";
  ingredientStockLevelInput.value = "보통";
  ingredientTypeInput.value = "other";
  ingredientTypeInput.hidden = true;
  if (typePreview) typePreview.hidden = false;
  if (typePreviewValue) typePreviewValue.textContent = "기타";

  saveButton.textContent = "재료 추가";
  cancelEditButton.hidden = true;
}

async function saveIngredient() {
  const {
    ingredientNameInput,
    ingredientStockLevelInput,
    ingredientTypeInput,
    saveButton,
  } = getEls();

  const name = ingredientNameInput.value.trim();
  if (!name) {
    alert("재료명을 입력해주세요.");
    ingredientNameInput.focus();
    return;
  }

  const payload = {
    name,
    stockLevel: ingredientStockLevelInput.value,
    type: normalizeType(ingredientTypeInput.value),
  };

  try {
    setBusy(saveButton, true, editingRowId ? "저장 중..." : "추가 중...");

    const response = await fetch(
      editingRowId ? `${apiBase}/ingredients/${editingRowId}` : `${apiBase}/ingredients`,
      {
        method: editingRowId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to save ingredient: ${response.status} ${text}`);
    }

    resetForm();
    await loadIngredients();
    showStatus(editingRowId ? "재료를 수정했어요." : "재료를 추가했어요.");
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

async function suggestDinner() {
  const { suggestButton, suggestionsDiv, suggestionCount } = getEls();

  try {
    setBusy(suggestButton, true, "추천 중...");
    suggestionsDiv.innerHTML = `<div class="empty-state">추천 메뉴를 불러오는 중...</div>`;

    const response = await fetch(`${apiBase}/suggestions`, {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Failed to load suggestions: ${response.status}`);
    }

    const suggestions = await response.json();
    suggestionCount.textContent = String(Array.isArray(suggestions) ? suggestions.length : 0);

    renderSuggestions(Array.isArray(suggestions) ? suggestions : []);
  } catch (error) {
    console.error("suggestDinner failed:", error);
    suggestionsDiv.innerHTML = `<div class="empty-state">추천을 불러오지 못했어요.</div>`;
    suggestionCount.textContent = "0";
  } finally {
    setBusy(suggestButton, false);
  }
}

function renderSuggestions(suggestions) {
  const { suggestionsDiv } = getEls();
  suggestionsDiv.innerHTML = "";

  if (!suggestions.length) {
    suggestionsDiv.innerHTML = `<div class="empty-state">추천 가능한 메뉴가 아직 없어요.</div>`;
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

    card.innerHTML = `
      <div class="suggestion-top">
        <h3>${escapeHtml(name)}</h3>
        <span class="suggestion-cuisine">${escapeHtml(cuisine || "추천")}</span>
      </div>
      <p class="suggestion-status">
        ${canMakeNow ? "지금 만들 수 있어요" : `부족한 재료: ${escapeHtml(missing.join(", ") || "없음")}`}
      </p>
      ${low.length ? `<p class="suggestion-low">적은 재료: ${escapeHtml(low.join(", "))}</p>` : ""}
      <p class="suggestion-uses">사용 재료: ${escapeHtml(uses.join(", ") || "-")}</p>
      ${recipeUrl ? `<a class="recipe-link" href="${escapeHtml(recipeUrl)}" target="_blank" rel="noreferrer">레시피 보기${recipeSource ? ` (${escapeHtml(recipeSource)})` : ""}</a>` : ""}
    `;

    suggestionsDiv.appendChild(card);
  });
}

function wireFilters() {
  const {
    toggleFiltersButton,
    filtersContent,
    filtersCaret,
    filterSearch,
    clearFiltersButton,
  } = getEls();

  toggleFiltersButton?.addEventListener("click", () => {
    filtersCollapsed = !filtersCollapsed;
    if (filtersContent) filtersContent.hidden = filtersCollapsed;
    if (filtersCaret) filtersCaret.textContent = filtersCollapsed ? "▸" : "▾";
  });

  filterSearch?.addEventListener("input", (e) => {
    pantryUiState.search = e.target.value.trim();
    renderIngredients();
  });

  document.querySelectorAll('input[name="filterAmount"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      pantryUiState.amount = getCheckedValue("filterAmount", "all");
      renderIngredients();
    });
  });

  document.querySelectorAll('input[name="filterSort"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      pantryUiState.sort = getCheckedValue("filterSort", "hangul-asc");
      renderIngredients();
    });
  });

  document.querySelectorAll('input[name="filterType"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      pantryUiState.type = getCheckedValue("filterType", "all");
      renderIngredients();
    });
  });

  clearFiltersButton?.addEventListener("click", () => {
    pantryUiState = {
      search: "",
      amount: "all",
      sort: "hangul-asc",
      type: "all",
    };

    if (filterSearch) filterSearch.value = "";
    setCheckedValue("filterAmount", "all");
    setCheckedValue("filterSort", "hangul-asc");
    setCheckedValue("filterType", "all");

    renderIngredients();
  });
}

function wireForm() {
  const {
    ingredientNameInput,
    saveButton,
    cancelEditButton,
    suggestButton,
  } = getEls();

  ingredientNameInput?.addEventListener("input", () => {
    if (editingRowId) return;

    window.clearTimeout(classifyTimer);
    classifyTimer = window.setTimeout(() => {
      updateTypePreviewFromName();
    }, 250);
  });

  saveButton?.addEventListener("click", saveIngredient);
  cancelEditButton?.addEventListener("click", resetForm);
  suggestButton?.addEventListener("click", suggestDinner);
}

wireFilters();
wireForm();
resetForm();
loadIngredients();