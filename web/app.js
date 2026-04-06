const apiBase = "http://localhost:7071/api";

let editingIngredientId = null;
let currentIngredients = [];
let pantryUiState = {
  search: "",
  amount: "all",
  sort: "hangul-asc",
  type: "all",
};
let collapsedSections = {
  Low: false,
  Some: true,
  Plenty: true,
  Out: true,
};

function byId(id) {
  return document.getElementById(id);
}

function getEls() {
  return {
    ingredientNameInput: byId("ingredientName"),
    ingredientStockLevelInput: byId("ingredientStockLevel"),
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
    filterAmount: byId("filterAmount"),
    filterSort: byId("filterSort"),
    filterType: byId("filterType"),
    clearFiltersButton: byId("clearFiltersButton"),
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

function stockLabel(stockLevel) {
  const normalized = String(stockLevel || "").toLowerCase();

  if (normalized === "low") return "Low";
  if (normalized === "plenty") return "Plenty";
  if (normalized === "out") return "Out";
  return "Some";
}

function stockDisplayText(stockLevel) {
  const normalized = stockLabel(stockLevel);
  if (normalized === "Some") return "Enough";
  return normalized;
}

function stockBadgeClass(stockLevel) {
  const normalized = stockLabel(stockLevel).toLowerCase();
  return `badge ${normalized}`;
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

function ingredientStockOf(item) {
  return stockLabel(item.stockLevel ?? item.StockLevel ?? "Some");
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

function getIngredientType(name) {
  const raw = String(name || "").trim().toLowerCase();

  const typeMap = {
    vegetable: [
      "onion", "green onion", "scallion", "garlic", "carrot", "potato", "cabbage", "lettuce",
      "spinach", "broccoli", "zucchini", "cucumber", "pepper", "bell pepper", "jalapeno",
      "mushroom", "tomato", "radish", "daikon", "bean sprout", "sprout", "corn", "kimchi",
      "양파", "대파", "파", "마늘", "감자", "배추", "상추", "시금치", "브로콜리", "오이",
      "고추", "버섯", "토마토", "무", "숙주", "옥수수", "김치"
    ],
    carb: [
      "rice", "pasta", "noodle", "ramen", "udon", "bread", "tortilla", "flour", "oat", "cereal",
      "떡", "rice cake", "면", "라면", "국수", "쌀", "밥", "파스타", "빵", "토르티야", "밀가루"
    ],
    protein: [
      "egg", "spam", "beef", "pork", "chicken", "tuna", "shrimp", "fish", "tofu", "sausage",
      "bacon", "ham", "meatball", "ground beef", "ground pork", "ground chicken",
      "계란", "달걀", "스팸", "소고기", "돼지고기", "닭고기", "참치", "새우", "생선", "두부", "소시지", "베이컨", "햄"
    ],
    dairy: [
      "milk", "cheese", "butter", "yogurt", "cream", "mozzarella", "parmesan",
      "우유", "치즈", "버터", "요거트", "생크림"
    ],
    fruit: [
      "apple", "banana", "pear", "orange", "grape", "strawberry", "blueberry", "lemon", "lime",
      "사과", "바나나", "배", "오렌지", "포도", "딸기", "블루베리", "레몬", "라임"
    ],
    sauce: [
      "soy sauce", "gochujang", "doenjang", "vinegar", "sesame oil", "oil", "ketchup", "mayo",
      "mayonnaise", "mustard", "hot sauce", "sauce", "salt", "sugar", "pepper", "gochugaru",
      "간장", "고추장", "된장", "식초", "참기름", "기름", "케첩", "마요네즈", "머스타드", "소금", "설탕", "후추", "고춧가루"
    ],
    frozen: [
      "frozen", "dumpling", "mandu", "gyoza", "ice cream",
      "냉동", "만두", "아이스크림"
    ],
  };

  for (const [type, keywords] of Object.entries(typeMap)) {
    if (keywords.some((keyword) => raw.includes(keyword))) {
      return type;
    }
  }

  return "other";
}

function typeDisplay(type) {
  const labels = {
    vegetable: "야채",
    carb: "탄수화물",
    protein: "고기/단백질",
    dairy: "유제품",
    fruit: "과일",
    sauce: "소스/조미료",
    frozen: "냉동식품",
    other: "기타",
  };
  return labels[type] || "기타";
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
    filtered = filtered.filter(
      (item) => getIngredientType(ingredientNameOf(item)) === pantryUiState.type
    );
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
    Low: items.filter((x) => ingredientStockOf(x) === "Low").length,
    Some: items.filter((x) => ingredientStockOf(x) === "Some").length,
    Plenty: items.filter((x) => ingredientStockOf(x) === "Plenty").length,
    Out: items.filter((x) => ingredientStockOf(x) === "Out").length,
  };

  pantrySummary.innerHTML = `
    <div class="summary-pill">Total <strong>${counts.total}</strong></div>
    <div class="summary-pill low">Low <strong>${counts.Low}</strong></div>
    <div class="summary-pill some">Enough <strong>${counts.Some}</strong></div>
    <div class="summary-pill plenty">Plenty <strong>${counts.Plenty}</strong></div>
    <div class="summary-pill out">Out <strong>${counts.Out}</strong></div>
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

  const grouped = {
    Low: [],
    Some: [],
    Plenty: [],
    Out: [],
  };

  filteredItems.forEach((item) => {
    grouped[ingredientStockOf(item)].push(item);
  });

  const order = ["Low", "Some", "Plenty", "Out"];
  const fragment = document.createDocumentFragment();

  for (const stockKey of order) {
    const items = grouped[stockKey];
    if (!items.length) continue;

    const section = document.createElement("section");
    section.className = "pantry-group";

    const headerButton = document.createElement("button");
    headerButton.type = "button";
    headerButton.className = "group-header";
    headerButton.setAttribute("aria-expanded", String(!collapsedSections[stockKey]));
    headerButton.innerHTML = `
      <div class="group-title-wrap">
        <span class="caret">${collapsedSections[stockKey] ? "▸" : "▾"}</span>
        <span class="${stockBadgeClass(stockKey)}">${stockDisplayText(stockKey)}</span>
        <span class="group-title">${stockDisplayText(stockKey)}</span>
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
        const id = ingredientIdOf(item);
        const name = ingredientNameOf(item);
        const stockLevel = ingredientStockOf(item);
        const type = getIngredientType(name);

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
        amountBadge.textContent = stockDisplayText(stockLevel);

        const typeBadge = document.createElement("span");
        typeBadge.className = "type-badge";
        typeBadge.textContent = typeDisplay(type);

        const orderBadge = document.createElement("span");
        orderBadge.className = "alphabet-badge";
        orderBadge.textContent = hasKoreanChar(name) ? "가나다" : "ABC";

        metaDiv.appendChild(amountBadge);
        metaDiv.appendChild(typeBadge);
        metaDiv.appendChild(orderBadge);

        mainDiv.appendChild(nameDiv);
        mainDiv.appendChild(metaDiv);

        const actionsDiv = document.createElement("div");
        actionsDiv.className = "item-actions";

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "icon-button edit";
        editBtn.title = "Edit ingredient";
        editBtn.setAttribute("aria-label", "Edit ingredient");
        editBtn.innerHTML = iconSvg("edit");
        editBtn.addEventListener("click", () => startEditIngredient(id));

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "icon-button delete";
        deleteBtn.title = "Delete ingredient";
        deleteBtn.setAttribute("aria-label", "Delete ingredient");
        deleteBtn.innerHTML = iconSvg("delete");
        deleteBtn.addEventListener("click", async () => {
          await deleteIngredient(id);
        });

        actionsDiv.appendChild(editBtn);
        actionsDiv.appendChild(deleteBtn);

        li.appendChild(mainDiv);
        li.appendChild(actionsDiv);
        list.appendChild(li);
      });

      section.appendChild(list);
    }

    fragment.appendChild(section);
  }

  ingredientsSections.appendChild(fragment);
}

async function saveIngredient() {
  const { ingredientNameInput, ingredientStockLevelInput, saveButton } = getEls();

  if (!ingredientNameInput || !ingredientStockLevelInput) {
    alert("Pantry form is not loaded correctly.");
    return;
  }

  const wasEditing = editingIngredientId !== null;
  const name = ingredientNameInput.value.trim();
  const stockLevel = ingredientStockLevelInput.value || "Some";

  if (!name) {
    alert("Ingredient name is required.");
    ingredientNameInput.focus();
    return;
  }

  const payload = { name, stockLevel };

  try {
    setBusy(saveButton, true, wasEditing ? "Saving..." : "Adding...");

    const response = await fetch(
      wasEditing
        ? `${apiBase}/ingredients/${editingIngredientId}`
        : `${apiBase}/ingredients`,
      {
        method: wasEditing ? "PUT" : "POST",
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
    showStatus(wasEditing ? "Ingredient updated." : "Ingredient added.");
  } catch (error) {
    console.error("saveIngredient failed:", error);
    alert("Failed to save ingredient. Check browser console.");
  } finally {
    setBusy(saveButton, false);
  }
}

function startEditIngredient(id) {
  const { ingredientNameInput, ingredientStockLevelInput, saveButton, cancelEditButton } = getEls();
  const item = currentIngredients.find((x) => ingredientIdOf(x) === id);
  if (!item || !ingredientNameInput || !ingredientStockLevelInput) return;

  editingIngredientId = id;
  ingredientNameInput.value = ingredientNameOf(item);
  ingredientStockLevelInput.value = ingredientStockOf(item);

  if (saveButton) saveButton.textContent = "Save Changes";
  if (cancelEditButton) cancelEditButton.classList.remove("hidden");

  ingredientNameInput.focus();
}

function resetForm() {
  const { ingredientNameInput, ingredientStockLevelInput, saveButton, cancelEditButton } = getEls();

  editingIngredientId = null;

  if (ingredientNameInput) ingredientNameInput.value = "";
  if (ingredientStockLevelInput) ingredientStockLevelInput.value = "Some";
  if (saveButton) saveButton.textContent = "Add Ingredient";
  if (cancelEditButton) cancelEditButton.classList.add("hidden");
}

async function deleteIngredient(id) {
  try {
    const response = await fetch(`${apiBase}/ingredients/${id}`, { method: "DELETE" });

    if (!response.ok && response.status !== 204) {
      throw new Error(`Failed to delete ingredient: ${response.status}`);
    }

    if (editingIngredientId === id) {
      resetForm();
    }

    await loadIngredients();
    showStatus("Ingredient deleted.");
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
  const { filterSearch, filterAmount, filterSort, filterType } = getEls();

  pantryUiState = {
    search: filterSearch?.value.trim() ?? "",
    amount: filterAmount?.value ?? "all",
    sort: filterSort?.value ?? "hangul-asc",
    type: filterType?.value ?? "all",
  };
}

function clearFilters() {
  const { filterSearch, filterAmount, filterSort, filterType } = getEls();

  if (filterSearch) filterSearch.value = "";
  if (filterAmount) filterAmount.value = "all";
  if (filterSort) filterSort.value = "hangul-asc";
  if (filterType) filterType.value = "all";

  syncFiltersFromUi();
  renderIngredients();
}

function wireUpFilters() {
  const { filterSearch, filterAmount, filterSort, filterType, clearFiltersButton } = getEls();

  [filterSearch, filterAmount, filterSort, filterType].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", () => {
      syncFiltersFromUi();
      renderIngredients();
    });
    el.addEventListener("change", () => {
      syncFiltersFromUi();
      renderIngredients();
    });
  });

  if (clearFiltersButton) {
    clearFiltersButton.addEventListener("click", clearFilters);
  }
}

function wireUp() {
  const {
    ingredientNameInput,
    saveButton,
    cancelEditButton,
    suggestButton,
  } = getEls();

  if (saveButton) saveButton.addEventListener("click", saveIngredient);
  if (cancelEditButton) cancelEditButton.addEventListener("click", resetForm);
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
  loadIngredients();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wireUp);
} else {
  wireUp();
}