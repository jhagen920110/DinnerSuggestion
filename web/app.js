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
let selectedIngredients = new Set();

// Meals state
let currentMeals = [];
let editingMealId = null;
let mealSearchQuery = "";

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

        const isSelected = selectedIngredients.has(name);

        row.innerHTML = `
          <div class="ingredient-row-top">
            <label class="ingredient-select-label">
              <input type="checkbox" class="ingredient-select-cb" ${isSelected ? "checked" : ""} />
            </label>
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

async function fetchSuggestions(exclude = []) {
  const body = {};
  if (selectedIngredients.size > 0) {
    body.mustInclude = [...selectedIngredients];
  }
  if (exclude.length > 0) {
    body.exclude = exclude;
  }

  const response = await fetch(`${apiBase}/suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to load suggestions: ${response.status}`);
  }

  const suggestions = await response.json();
  const safeSuggestions = Array.isArray(suggestions) ? suggestions : [];

  // Keep saved (DB) suggestions on top in order, shuffle AI suggestions
  const saved = safeSuggestions.filter(s => (s.source ?? s.Source) === "saved");
  const ai = safeSuggestions.filter(s => (s.source ?? s.Source) !== "saved");
  for (let i = ai.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ai[i], ai[j]] = [ai[j], ai[i]];
  }

  return [...saved, ...ai];
}

async function suggestDinner() {
  const { suggestButton, suggestionsDiv } = getEls();

  try {
    setBusy(suggestButton, true, "추천 중...");

    suggestionsDiv.innerHTML = `
      <div class="empty-state">추천 메뉴를 불러오는 중...</div>
    `;

    const results = await fetchSuggestions();
    renderSuggestions(results);
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

  try {
    btn.textContent = "추천 불러오는 중...";
    btn.disabled = true;

    // Collect already-shown dish names to exclude
    const existingNames = [...suggestionsDiv.querySelectorAll("h3")].map(h => h.textContent.trim());
    const results = await fetchSuggestions(existingNames);

    // Remove the "more" button before appending
    const existingBtn = suggestionsDiv.querySelector(".more-suggestions-btn");
    if (existingBtn) existingBtn.remove();

    // Client-side dedup as safety net
    const existingNamesLower = new Set(existingNames.map(n => n.toLowerCase()));
    const newResults = results.filter(s => {
      const name = (s.name ?? s.Name ?? "").trim().toLowerCase();
      return !existingNamesLower.has(name);
    });

    if (newResults.length === 0) {
      const notice = document.createElement("div");
      notice.className = "empty-state";
      notice.textContent = "새로운 추천이 없어요. 다시 시도해보세요!";
      suggestionsDiv.appendChild(notice);
    } else {
      appendSuggestionCards(newResults, suggestionsDiv);
    }

    // Re-add the "more" button
    const moreBtn = document.createElement("button");
    moreBtn.className = "more-suggestions-btn";
    moreBtn.textContent = "🔄 더 보기";
    moreBtn.addEventListener("click", () => loadMoreSuggestions(moreBtn));
    suggestionsDiv.appendChild(moreBtn);
  } catch (error) {
    console.error("loadMoreSuggestions failed:", error);
    btn.textContent = "🔄 더 보기";
    btn.disabled = false;
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

  appendSuggestionCards(suggestions, suggestionsDiv);

  // "More suggestions" button
  const moreBtn = document.createElement("button");
  moreBtn.className = "more-suggestions-btn";
  moreBtn.textContent = "🔄 더 보기";
  moreBtn.addEventListener("click", () => loadMoreSuggestions(moreBtn));
  suggestionsDiv.appendChild(moreBtn);
}

function appendSuggestionCards(suggestions, container) {
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
    const source = item.source ?? item.Source ?? "ai";

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
      <div class="suggestion-img-wrap">
        <div class="suggestion-img-placeholder">🍽️</div>
      </div>
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
      </div>
    `;

    // Async-load dish image
    loadDishImage(name, card.querySelector(".suggestion-img-wrap"));

    container.appendChild(card);
  });
}

async function loadDishImage(dishName, imgWrap) {
  try {
    const src = await findDishImage(dishName);
    if (!src) return;
    const img = document.createElement("img");
    img.className = "suggestion-img";
    img.alt = dishName;
    img.src = src;
    img.onload = () => {
      imgWrap.innerHTML = "";
      imgWrap.appendChild(img);
    };
  } catch {
    // Keep placeholder on failure
  }
}

async function findDishImage(name) {
  // 1. Korean Wikipedia search (handles exact + compound names)
  let src = await wikiSearchThumb(name, "ko");
  if (src) return src;

  // 2. If name has spaces, try the last word (core dish name)
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1) {
    src = await wikiSearchThumb(parts[parts.length - 1], "ko");
    if (src) return src;
  }

  // 3. English Wikipedia fallback
  return await wikiSearchThumb(name, "en");
}

async function wikiSearchThumb(query, lang) {
  try {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search` +
      `&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1&gsrnamespace=0` +
      `&prop=pageimages&piprop=thumbnail&pithumbsize=800&format=json&origin=*`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0];
    return page?.thumbnail?.source || null;
  } catch {
    return null;
  }
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
  attachTabEvents();
  attachMealEvents();
  resetForm();
  loadIngredients().then(() => {
    switchPage("suggestions");
    suggestDinner();
  });
}

// ─── Tab Navigation ───

function attachTabEvents() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const page = btn.dataset.page;
      switchPage(page);
    });
  });
}

function switchPage(pageName) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === pageName);
  });

  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === `page-${pageName}`);
  });

  if (pageName === "meals") {
    if (currentMeals.length === 0) {
      loadMeals();
    } else {
      renderMeals();
    }
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
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      mealSearchQuery = searchInput.value.trim().toLowerCase();
      renderMeals();
    });
  }
}

function resetMealForm() {
  byId("mealName").value = "";
  byId("mealCuisine").value = "한식";
  byId("mealDifficulty").value = "보통";
  byId("mealCookTime").value = "";
  byId("mealIngredients").value = "";
  byId("mealTags").value = "";
  byId("mealRecipeUrl").value = "";
  byId("mealNotes").value = "";
  byId("saveMealBtn").textContent = "저장";
}

function fillMealForm(meal) {
  byId("mealName").value = meal.name ?? meal.Name ?? "";
  byId("mealCuisine").value = meal.cuisine ?? meal.Cuisine ?? "한식";
  byId("mealDifficulty").value = meal.difficulty ?? meal.Difficulty ?? "보통";
  byId("mealCookTime").value = meal.cookTime ?? meal.CookTime ?? "";
  byId("mealIngredients").value = (meal.ingredients ?? meal.Ingredients ?? []).join(", ");
  byId("mealTags").value = (meal.tags ?? meal.Tags ?? []).join(", ");
  byId("mealRecipeUrl").value = meal.recipeUrl ?? meal.RecipeUrl ?? "";
  byId("mealNotes").value = meal.notes ?? meal.Notes ?? "";
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
    const response = await fetch(`${apiBase}/meals`);
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

  const tagsRaw = byId("mealTags").value;
  const tags = tagsRaw
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

  const payload = {
    name,
    cuisine: byId("mealCuisine").value,
    difficulty: byId("mealDifficulty").value,
    cookTime: byId("mealCookTime").value.trim(),
    ingredients,
    tags,
    recipeUrl: byId("mealRecipeUrl").value.trim(),
    notes: byId("mealNotes").value.trim(),
  };

  const saveBtn = byId("saveMealBtn");

  try {
    setBusy(saveBtn, true, "저장 중...");

    const isEditing = editingMealId !== null;
    const url = isEditing ? `${apiBase}/meals/${editingMealId}` : `${apiBase}/meals`;
    const method = isEditing ? "PUT" : "POST";

    const response = await fetch(url, {
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
    await loadMeals();
    showMealStatus(isEditing ? "레시피를 수정했어요." : "레시피를 추가했어요.");
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
    const response = await fetch(`${apiBase}/meals/${id}`, { method: "DELETE" });
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

  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state">저장된 레시피가 없어요. 자주 만드는 요리를 추가해보세요!</div>`;
    return;
  }

  const list = document.createElement("div");
  list.className = "meals-list";

  for (const meal of filtered) {
    const id = meal.id ?? meal.Id ?? "";
    const name = meal.name ?? meal.Name ?? "";
    const cuisine = meal.cuisine ?? meal.Cuisine ?? "";
    const difficulty = meal.difficulty ?? meal.Difficulty ?? "";
    const cookTime = meal.cookTime ?? meal.CookTime ?? "";
    const ingredients = meal.ingredients ?? meal.Ingredients ?? [];
    const tags = meal.tags ?? meal.Tags ?? [];
    const notes = meal.notes ?? meal.Notes ?? "";
    const recipeUrl = meal.recipeUrl ?? meal.RecipeUrl ?? "";

    const diffClass = difficulty === "쉬움" ? "easy" : difficulty === "어려움" ? "hard" : "medium";

    const card = document.createElement("article");
    card.className = "meal-card";

    card.innerHTML = `
      <div class="meal-card-top">
        <div>
          <h3>${escapeHtml(name)}</h3>
          <div class="meal-card-meta">
            <span class="suggestion-cuisine">${escapeHtml(cuisine)}</span>
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

      ${notes ? `<div class="meal-card-notes">${escapeHtml(notes)}</div>` : ""}

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
      byId("mealName").focus();
    });

    deleteBtn.addEventListener("click", () => {
      deleteMeal(id, name);
    });

    list.appendChild(card);
  }

  container.appendChild(list);
}

document.addEventListener("DOMContentLoaded", init);