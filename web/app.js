const apiBase = "http://localhost:7071/api";

let editingIngredientId = null;
let currentIngredients = [];

function byId(id) {
  return document.getElementById(id);
}

function getEls() {
  return {
    ingredientNameInput: byId("ingredientName"),
    ingredientStockLevelInput: byId("ingredientStockLevel"),
    saveButton: byId("saveButton"),
    cancelEditButton: byId("cancelEditButton"),
    ingredientsList: byId("ingredientsList"),
    suggestButton: byId("suggestButton"),
    suggestionsDiv: byId("suggestions"),
    pantryCount: byId("pantryCount"),
    suggestionCount: byId("suggestionCount"),
    pantryStatus: byId("pantryStatus")
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

async function loadIngredients() {
  const { ingredientsList, pantryCount } = getEls();
  if (!ingredientsList) return;

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

    renderIngredients(currentIngredients);
  } catch (error) {
    console.error("loadIngredients failed:", error);
    ingredientsList.innerHTML = `<li>Failed to load ingredients.</li>`;

    if (pantryCount) {
      pantryCount.textContent = "0";
    }
  }
}

function renderIngredients(items) {
  const { ingredientsList } = getEls();
  if (!ingredientsList) return;

  ingredientsList.innerHTML = "";

  if (!items.length) {
    ingredientsList.innerHTML = `<li>No ingredients yet.</li>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const item of items) {
    const id = item.id ?? item.Id;
    const name = item.name ?? item.Name ?? "";
    const stockLevel = item.stockLevel ?? item.StockLevel ?? "Some";

    const li = document.createElement("li");

    const mainDiv = document.createElement("div");
    mainDiv.className = "item-main";

    const nameDiv = document.createElement("div");
    nameDiv.className = "item-name";
    nameDiv.textContent = name;

    const metaDiv = document.createElement("div");
    metaDiv.className = "item-meta";

    const badge = document.createElement("span");
    const normalized = String(stockLevel).toLowerCase();

    badge.className =
      normalized === "plenty"
        ? "badge plenty"
        : normalized === "some"
        ? "badge some"
        : normalized === "low"
        ? "badge low"
        : normalized === "out"
        ? "badge out"
        : "badge";

badge.textContent = stockLevel;

    metaDiv.appendChild(badge);
    mainDiv.appendChild(nameDiv);
    mainDiv.appendChild(metaDiv);

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "item-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "edit";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => startEditIngredient(id));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", async () => {
      await deleteIngredient(id);
    });

    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);

    li.appendChild(mainDiv);
    li.appendChild(actionsDiv);
    fragment.appendChild(li);
  }

  ingredientsList.appendChild(fragment);
}

async function saveIngredient() {
  const {
    ingredientNameInput,
    ingredientStockLevelInput,
    saveButton
  } = getEls();

  if (!ingredientNameInput || !ingredientStockLevelInput) {
    console.error("Missing pantry form elements.");
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
        body: JSON.stringify(payload)
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
  const {
    ingredientNameInput,
    ingredientStockLevelInput,
    saveButton,
    cancelEditButton
  } = getEls();

  const item = currentIngredients.find((x) => (x.id ?? x.Id) === id);
  if (!item || !ingredientNameInput || !ingredientStockLevelInput) return;

  editingIngredientId = id;
  ingredientNameInput.value = item.name ?? item.Name ?? "";
  ingredientStockLevelInput.value = item.stockLevel ?? item.StockLevel ?? "Some";

  if (saveButton) saveButton.textContent = "Save Changes";
  if (cancelEditButton) cancelEditButton.classList.remove("hidden");

  ingredientNameInput.focus();
}

function resetForm() {
  const {
    ingredientNameInput,
    ingredientStockLevelInput,
    saveButton,
    cancelEditButton
  } = getEls();

  editingIngredientId = null;

  if (ingredientNameInput) ingredientNameInput.value = "";
  if (ingredientStockLevelInput) ingredientStockLevelInput.value = "Some";
  if (saveButton) saveButton.textContent = "Add Ingredient";
  if (cancelEditButton) cancelEditButton.classList.add("hidden");
}

async function deleteIngredient(id) {
  try {
    const response = await fetch(`${apiBase}/ingredients/${id}`, {
      method: "DELETE"
    });

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

    const response = await fetch(`${apiBase}/suggestions`, {
      method: "POST"
    });

    if (!response.ok) {
      throw new Error(`Failed to load suggestions: ${response.status}`);
    }

    const items = await response.json();
    renderSuggestions(Array.isArray(items) ? items : []);
  } catch (error) {
    console.error("loadSuggestions failed:", error);
    suggestionsDiv.innerHTML = `<p class="empty-state">Failed to load suggestions.</p>`;
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
    suggestionsDiv.innerHTML = `<p class="empty-state">No suggestions available.</p>`;
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
      metaRow.innerHTML += `<span class="badge cuisine">${escapeHtml(cuisine)}</span>`;
    }

    if (canMakeNow) {
      metaRow.innerHTML += `<span class="badge good">Can make now</span>`;
    } else if (missingIngredients.length > 0) {
      metaRow.innerHTML += `<span class="badge warn">Missing ${missingIngredients.length}</span>`;
    }

    if (lowStockIngredients.length > 0) {
      metaRow.innerHTML += `<span class="badge low">Low stock ${lowStockIngredients.length}</span>`;
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
      missing.innerHTML = `<span class="detail-label missing-label">Missing</span>${escapeHtml(missingIngredients.join(", "))}`;
      details.appendChild(missing);
    }

    if (lowStockIngredients.length > 0) {
      const low = document.createElement("p");
      low.className = "detail-line low-line";
      low.innerHTML = `<span class="detail-label low-label">Low stock</span>${escapeHtml(lowStockIngredients.join(", "))}`;
      details.appendChild(low);
    }

    const recipeCard = document.createElement("a");
    recipeCard.className = "recipe-preview";
    recipeCard.href = recipeUrl;
    recipeCard.target = "_blank";
    recipeCard.rel = "noreferrer";

    recipeCard.innerHTML = `
      <div class="recipe-preview-body no-thumb">
        <div class="recipe-preview-top">
          <span class="recipe-site">${escapeHtml(recipeSource)}</span>
        </div>
        <div class="recipe-preview-title">Recipe link</div>
        <div class="recipe-preview-url">${escapeHtml(recipeUrl)}</div>
      </div>
    `;

    div.appendChild(header);
    div.appendChild(usesBlock);
    div.appendChild(details);
    div.appendChild(recipeCard);

    suggestionsDiv.appendChild(div);
  }
}

function wireUp() {
  const {
    ingredientNameInput,
    saveButton,
    cancelEditButton,
    suggestButton
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

  loadIngredients();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wireUp);
} else {
  wireUp();
}