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
  적음: false,
  보통: false,
  많음: true,
  없음: true,
};

const INGREDIENT_TYPE_MAP = {
  야채: [
    "양파", "대파", "쪽파", "마늘", "생강", "감자", "고구마", "당근", "오이", "호박", "애호박",
    "주키니", "브로콜리", "콜리플라워", "양배추", "배추", "상추", "깻잎", "시금치", "부추",
    "청경채", "콩나물", "숙주", "버섯", "표고버섯", "새송이", "팽이버섯", "느타리버섯",
    "파프리카", "피망", "고추", "청양고추", "토마토", "방울토마토", "가지", "무", "비트",
    "샐러리", "아스파라거스", "옥수수"
  ],
  탄수화물: [
    "밥", "쌀", "현미", "보리", "오트밀", "식빵", "빵", "모닝빵", "베이글", "또띠아",
    "국수", "소면", "중면", "우동", "라면", "파스타", "스파게티", "페투치네", "펜네",
    "떡", "떡국떡", "떡볶이떡", "감자면", "당면", "만두피", "피자도우", "시리얼"
  ],
  "고기/단백질": [
    "계란", "달걀", "닭", "닭가슴살", "닭다리", "돼지고기", "삼겹살", "목살", "소고기",
    "차돌박이", "불고기", "갈비", "다진고기", "햄", "베이컨", "소시지", "참치", "참치캔",
    "연어", "고등어", "오징어", "새우", "두부", "순두부", "유부", "콩", "병아리콩", "렌틸콩"
  ],
  유제품: [
    "우유", "치즈", "모짜렐라", "체다", "파마산", "버터", "생크림", "휘핑크림", "요거트", "요구르트"
  ],
  과일: [
    "사과", "배", "바나나", "포도", "딸기", "블루베리", "레몬", "라임", "오렌지",
    "귤", "자몽", "복숭아", "자두", "망고", "파인애플", "아보카도", "키위"
  ],
  "소스/조미료": [
    "소금", "후추", "설탕", "간장", "고추장", "된장", "쌈장", "식초", "참기름", "들기름",
    "올리브오일", "식용유", "마요네즈", "케첩", "머스타드", "굴소스", "칠리소스", "핫소스",
    "토마토소스", "파스타소스", "카레", "카레가루", "다시다", "치킨스톡", "멸치액젓", "까나리액젓",
    "올리고당", "물엿", "맛술"
  ],
  냉동식품: [
    "냉동만두", "냉동피자", "냉동볶음밥", "냉동새우", "냉동치킨", "냉동감자", "아이스크림"
  ]
};

function byId(id) {
  return document.getElementById(id);
}

function getEls() {
  return {
    ingredientNameInput: byId("ingredientName"),
    ingredientStockLevelInput: byId("ingredientStockLevel"),
    ingredientTypeInput: byId("ingredientType"),
    ingredientTypeLabel: byId("ingredientTypeLabel"),
    ingredientTypePreview: byId("ingredientTypePreview"),
    ingredientTypePreviewValue: byId("ingredientTypePreviewValue"),

    saveButton: byId("saveButton"),
    cancelEditButton: byId("cancelEditButton"),

    filtersToggle: byId("filtersToggle"),
    filtersPanel: byId("filtersPanel"),
    filterSearch: byId("filterSearch"),
    filterAmount: byId("filterAmount"),
    filterSort: byId("filterSort"),
    filterType: byId("filterType"),
    clearFiltersButton: byId("clearFiltersButton"),

    pantryCount: byId("pantryCount"),
    suggestionCount: byId("suggestionCount"),
    pantryStatus: byId("pantryStatus"),
    pantrySummary: byId("pantrySummary"),
    ingredientsSections: byId("ingredientsSections"),

    suggestButton: byId("suggestButton"),
    suggestionsDiv: byId("suggestions"),
  };
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
  clearTimeout(showStatus._timer);
  showStatus._timer = setTimeout(() => {
    pantryStatus.textContent = "";
  }, 1800);
}

function ingredientIdOf(item) {
  return item?.id ?? item?.Id ?? "";
}

function ingredientNameOf(item) {
  return String(item?.name ?? item?.Name ?? "").trim();
}

function normalizeStockLevel(value) {
  switch (String(value ?? "").trim()) {
    case "많음":
      return "많음";
    case "적음":
      return "적음";
    case "없음":
      return "없음";
    default:
      return "보통";
  }
}

function ingredientStockOf(item) {
  return normalizeStockLevel(item?.stockLevel ?? item?.StockLevel ?? "보통");
}

function normalizeType(value) {
  const normalized = String(value ?? "").trim();
  const valid = new Set([
    "야채",
    "탄수화물",
    "고기/단백질",
    "유제품",
    "과일",
    "소스/조미료",
    "냉동식품",
    "기타",
  ]);

  return valid.has(normalized) ? normalized : "기타";
}

function ingredientTypeOf(item) {
  return normalizeType(item?.type ?? item?.Type ?? "기타");
}

function detectIngredientType(name) {
  const normalizedName = String(name ?? "").trim().toLowerCase();
  if (!normalizedName) return "기타";

  for (const [type, keywords] of Object.entries(INGREDIENT_TYPE_MAP)) {
    for (const keyword of keywords) {
      const k = keyword.toLowerCase();
      if (normalizedName === k || normalizedName.includes(k) || k.includes(normalizedName)) {
        return type;
      }
    }
  }

  if (
    normalizedName.includes("버섯") ||
    normalizedName.includes("파") ||
    normalizedName.includes("배추") ||
    normalizedName.includes("상추") ||
    normalizedName.includes("시금치")
  ) {
    return "야채";
  }

  if (
    normalizedName.includes("고기") ||
    normalizedName.includes("닭") ||
    normalizedName.includes("돼지") ||
    normalizedName.includes("소고기") ||
    normalizedName.includes("계란") ||
    normalizedName.includes("두부")
  ) {
    return "고기/단백질";
  }

  if (
    normalizedName.includes("소스") ||
    normalizedName.includes("오일") ||
    normalizedName.includes("가루") ||
    normalizedName.includes("시즈닝")
  ) {
    return "소스/조미료";
  }

  return "기타";
}

function updateAutoTypePreview() {
  const {
    ingredientNameInput,
    ingredientTypePreviewValue,
    ingredientTypeInput,
  } = getEls();

  if (!ingredientNameInput || !ingredientTypePreviewValue || !ingredientTypeInput) return;

  const detected = detectIngredientType(ingredientNameInput.value);
  ingredientTypePreviewValue.textContent = detected;

  if (editingIngredientId === null) {
    ingredientTypeInput.value = detected;
  }
}

function setAddMode() {
  const {
    ingredientTypeLabel,
    ingredientTypePreview,
    ingredientTypeInput,
  } = getEls();

  if (ingredientTypeLabel) ingredientTypeLabel.textContent = "종류";
  if (ingredientTypePreview) ingredientTypePreview.hidden = false;
  if (ingredientTypeInput) ingredientTypeInput.hidden = true;
}

function setEditMode() {
  const {
    ingredientTypeLabel,
    ingredientTypePreview,
    ingredientTypeInput,
  } = getEls();

  if (ingredientTypeLabel) ingredientTypeLabel.textContent = "종류 (수정 가능)";
  if (ingredientTypePreview) ingredientTypePreview.hidden = true;
  if (ingredientTypeInput) ingredientTypeInput.hidden = false;
}

function stockBadgeClass(stockLevel) {
  switch (normalizeStockLevel(stockLevel)) {
    case "적음":
      return "badge low";
    case "없음":
      return "badge out";
    case "많음":
      return "badge plenty";
    default:
      return "badge some";
  }
}

function compareKo(a, b) {
  return String(a ?? "").localeCompare(String(b ?? ""), "ko");
}

function compareEn(a, b) {
  return String(a ?? "").localeCompare(String(b ?? ""), "en", { sensitivity: "base" });
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
    ingredientsSections.innerHTML = `<div class="empty-state">재료를 불러오지 못했어요.</div>`;
    if (pantryCount) pantryCount.textContent = "0";
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
    filtered.sort((a, b) => compareEn(String(ingredientIdOf(b)), String(ingredientIdOf(a))));
  }

  return filtered;
}

function buildPantrySummary(items) {
  const { pantrySummary } = getEls();
  if (!pantrySummary) return;

  const counts = {
    total: items.length,
    적음: items.filter((x) => ingredientStockOf(x) === "적음").length,
    보통: items.filter((x) => ingredientStockOf(x) === "보통").length,
    많음: items.filter((x) => ingredientStockOf(x) === "많음").length,
    없음: items.filter((x) => ingredientStockOf(x) === "없음").length,
  };

  pantrySummary.innerHTML = `
    <div class="summary-chip total">Total ${counts.total}</div>
    <div class="summary-chip low">적음 ${counts.적음}</div>
    <div class="summary-chip some">보통 ${counts.보통}</div>
    <div class="summary-chip plenty">많음 ${counts.많음}</div>
    <div class="summary-chip out">없음 ${counts.없음}</div>
  `;
}

function renderIngredients() {
  const { ingredientsSections } = getEls();
  if (!ingredientsSections) return;

  const filteredItems = applyIngredientFilters(currentIngredients);
  buildPantrySummary(filteredItems);
  ingredientsSections.innerHTML = "";

  if (!filteredItems.length) {
    ingredientsSections.innerHTML = `<div class="empty-state">조건에 맞는 재료가 없어요.</div>`;
    return;
  }

  const grouped = { 적음: [], 보통: [], 많음: [], 없음: [] };
  filteredItems.forEach((item) => {
    grouped[ingredientStockOf(item)].push(item);
  });

  const order = ["적음", "보통", "많음", "없음"];
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
      <span class="group-title">${collapsedSections[stockKey] ? "▸" : "▾"} ${stockKey}</span>
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

        metaDiv.appendChild(amountBadge);
        metaDiv.appendChild(typeBadge);

        mainDiv.appendChild(nameDiv);
        mainDiv.appendChild(metaDiv);

        const actionsDiv = document.createElement("div");
        actionsDiv.className = "item-actions";

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "icon-button edit";
        editBtn.title = "수정";
        editBtn.setAttribute("aria-label", "수정");
        editBtn.innerHTML = iconSvg("edit");
        editBtn.addEventListener("click", () => startEditIngredient(id));

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "icon-button delete";
        deleteBtn.title = "삭제";
        deleteBtn.setAttribute("aria-label", "삭제");
        deleteBtn.innerHTML = iconSvg("delete");
        deleteBtn.addEventListener("click", async () => {
          const confirmed = window.confirm(`'${name}' 재료를 삭제할까요?`);
          if (!confirmed) return;
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
  const {
    ingredientNameInput,
    ingredientStockLevelInput,
    ingredientTypeInput,
    saveButton,
  } = getEls();

  if (!ingredientNameInput || !ingredientStockLevelInput || !ingredientTypeInput) {
    alert("폼을 찾을 수 없어요.");
    return;
  }

  const wasEditing = editingIngredientId !== null;
  const name = ingredientNameInput.value.trim();
  const stockLevel = normalizeStockLevel(ingredientStockLevelInput.value || "보통");
  const type = wasEditing
    ? normalizeType(ingredientTypeInput.value || "기타")
    : detectIngredientType(name);

  if (!name) {
    alert("재료명을 입력해주세요.");
    ingredientNameInput.focus();
    return;
  }

  const payload = { name, stockLevel, type };

  try {
    setBusy(saveButton, true, wasEditing ? "저장 중..." : "추가 중...");

    const response = await fetch(
      wasEditing ? `${apiBase}/ingredients/${editingIngredientId}` : `${apiBase}/ingredients`,
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
    showStatus(wasEditing ? "재료를 수정했어요." : "재료를 추가했어요.");
  } catch (error) {
    console.error("saveIngredient failed:", error);
    alert("재료 저장에 실패했어요.");
  } finally {
    setBusy(saveButton, false);
  }
}

function startEditIngredient(id) {
  const {
    ingredientNameInput,
    ingredientStockLevelInput,
    ingredientTypeInput,
    saveButton,
    cancelEditButton,
  } = getEls();

  const item = currentIngredients.find((x) => ingredientIdOf(x) === id);
  if (!item) return;

  editingIngredientId = id;
  ingredientNameInput.value = ingredientNameOf(item);
  ingredientStockLevelInput.value = ingredientStockOf(item);
  ingredientTypeInput.value = ingredientTypeOf(item);

  setEditMode();
  saveButton.textContent = "수정 저장";
  cancelEditButton.hidden = false;
  ingredientNameInput.focus();
}

function resetForm() {
  const {
    ingredientNameInput,
    ingredientStockLevelInput,
    ingredientTypeInput,
    saveButton,
    cancelEditButton,
  } = getEls();

  editingIngredientId = null;
  ingredientNameInput.value = "";
  ingredientStockLevelInput.value = "보통";
  ingredientTypeInput.value = "기타";

  setAddMode();
  updateAutoTypePreview();

  saveButton.textContent = "재료 추가";
  cancelEditButton.hidden = true;
}

async function deleteIngredient(id) {
  try {
    const response = await fetch(`${apiBase}/ingredients/${id}`, {
      method: "DELETE",
    });

    if (!response.ok && response.status !== 204) {
      throw new Error(`Failed to delete ingredient: ${response.status}`);
    }

    if (editingIngredientId === id) {
      resetForm();
    }

    await loadIngredients();
    showStatus("재료를 삭제했어요.");
  } catch (error) {
    console.error("deleteIngredient failed:", error);
    alert("재료 삭제에 실패했어요.");
  }
}

async function loadSuggestions() {
  const { suggestButton, suggestionsDiv, suggestionCount } = getEls();

  try {
    setBusy(suggestButton, true, "불러오는 중...");
    suggestionsDiv.innerHTML = `<div class="empty-state">추천 메뉴를 불러오는 중...</div>`;

    const response = await fetch(`${apiBase}/suggestions`, {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Failed to load suggestions: ${response.status}`);
    }

    const items = await response.json();
    renderSuggestions(Array.isArray(items) ? items : []);

    if (suggestionCount) {
      suggestionCount.textContent = String(Array.isArray(items) ? items.length : 0);
    }
  } catch (error) {
    console.error("loadSuggestions failed:", error);
    suggestionsDiv.innerHTML = `<div class="empty-state">추천 메뉴를 불러오지 못했어요.</div>`;
    if (suggestionCount) suggestionCount.textContent = "0";
  } finally {
    setBusy(suggestButton, false);
  }
}

function renderSuggestions(items) {
  const { suggestionsDiv } = getEls();
  suggestionsDiv.innerHTML = "";

  if (!items.length) {
    suggestionsDiv.innerHTML = `<div class="empty-state">추천 가능한 메뉴가 아직 없어요.</div>`;
    return;
  }

  for (const item of items) {
    const name = item.name ?? item.Name ?? "";
    const cuisine = item.cuisine ?? item.Cuisine ?? "";
    const canMakeNow = item.canMakeNow ?? item.CanMakeNow ?? false;
    const missingIngredients = item.missingIngredients ?? item.MissingIngredients ?? [];
    const lowStockIngredients = item.lowStockIngredients ?? item.LowStockIngredients ?? [];
    const uses = item.uses ?? item.Uses ?? [];
    const recipeUrl = item.recipeUrl ?? item.RecipeUrl ?? "";
    const recipeSource = item.recipeSource ?? item.RecipeSource ?? "";

    const div = document.createElement("article");
    div.className = "suggestion";

    const top = document.createElement("div");
    top.className = "suggestion-top";

    const title = document.createElement("h3");
    title.textContent = name;

    const cuisineBadge = document.createElement("span");
    cuisineBadge.className = "suggestion-cuisine";
    cuisineBadge.textContent = cuisine || "추천";

    top.appendChild(title);
    top.appendChild(cuisineBadge);

    const status = document.createElement("p");
    status.className = "suggestion-status";
    status.textContent = canMakeNow
      ? "지금 만들 수 있어요"
      : `부족한 재료: ${missingIngredients.join(", ") || "없음"}`;

    const usesP = document.createElement("p");
    usesP.className = "suggestion-uses";
    usesP.textContent = `사용 재료: ${uses.join(", ") || "-"}`;

    div.appendChild(top);
    div.appendChild(status);

    if (lowStockIngredients.length > 0) {
      const lowP = document.createElement("p");
      lowP.className = "suggestion-low";
      lowP.textContent = `적은 재료: ${lowStockIngredients.join(", ")}`;
      div.appendChild(lowP);
    }

    div.appendChild(usesP);

    if (recipeUrl) {
      const recipeLink = document.createElement("a");
      recipeLink.className = "recipe-link";
      recipeLink.textContent = `레시피 보기${recipeSource ? ` (${recipeSource})` : ""}`;
      recipeLink.href = recipeUrl;
      recipeLink.target = "_blank";
      recipeLink.rel = "noreferrer";
      div.appendChild(recipeLink);
    }

    suggestionsDiv.appendChild(div);
  }
}

function wireFilters() {
  const {
    filtersToggle,
    filtersPanel,
    filterSearch,
    filterAmount,
    filterSort,
    filterType,
    clearFiltersButton,
  } = getEls();

  if (filtersToggle && filtersPanel) {
    filtersToggle.addEventListener("click", () => {
      const isOpening = filtersPanel.hidden;
      filtersPanel.hidden = !isOpening;
      filtersToggle.setAttribute("aria-expanded", String(isOpening));
      filtersToggle.textContent = isOpening ? "Filters ▾" : "Filters ▸";
    });
  }

  if (filterSearch) {
    filterSearch.addEventListener("input", (e) => {
      pantryUiState.search = e.target.value.trim();
      renderIngredients();
    });
  }

  if (filterAmount) {
    filterAmount.addEventListener("change", (e) => {
      pantryUiState.amount = e.target.value;
      renderIngredients();
    });
  }

  if (filterSort) {
    filterSort.addEventListener("change", (e) => {
      pantryUiState.sort = e.target.value;
      renderIngredients();
    });
  }

  if (filterType) {
    filterType.addEventListener("change", (e) => {
      pantryUiState.type = e.target.value;
      renderIngredients();
    });
  }

  if (clearFiltersButton) {
    clearFiltersButton.addEventListener("click", () => {
      pantryUiState = {
        search: "",
        amount: "all",
        sort: "hangul-asc",
        type: "all",
      };

      if (filterSearch) filterSearch.value = "";
      if (filterAmount) filterAmount.value = "all";
      if (filterSort) filterSort.value = "hangul-asc";
      if (filterType) filterType.value = "all";

      renderIngredients();
    });
  }
}

function wireMainActions() {
  const {
    saveButton,
    cancelEditButton,
    suggestButton,
    ingredientNameInput,
  } = getEls();

  if (saveButton) saveButton.addEventListener("click", saveIngredient);
  if (cancelEditButton) cancelEditButton.addEventListener("click", resetForm);
  if (suggestButton) suggestButton.addEventListener("click", loadSuggestions);
  if (ingredientNameInput) ingredientNameInput.addEventListener("input", updateAutoTypePreview);
}

setAddMode();
wireMainActions();
wireFilters();
updateAutoTypePreview();
loadIngredients();