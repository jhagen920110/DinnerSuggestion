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
    suggestionsDiv: byId("suggestions")
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

async function loadIngredients() {
  const { ingredientsList } = getEls();
  if (!ingredientsList) return;

  try {
    const response = await fetch(`${apiBase}/ingredients`);
    if (!response.ok) {
      throw new Error(`Failed to load ingredients: ${response.status}`);
    }

    const items = await response.json();
    currentIngredients = Array.isArray(items) ? items : [];
    renderIngredients(currentIngredients);
  } catch (error) {
    console.error("loadIngredients failed:", error);
    ingredientsList.innerHTML = `<li>Failed to load ingredients.</li>`;
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
      normalized === "low"
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

  const name = ingredientNameInput.value.trim();
  const stockLevel = ingredientStockLevelInput.value || "Some";

  if (!name) {
    alert("Ingredient name is required.");
    ingredientNameInput.focus();
    return;
  }

  const payload = { name, stockLevel };

  try {
    setBusy(saveButton, true, editingIngredientId ? "Saving..." : "Adding...");

    const response = await fetch(
      editingIngredientId
        ? `${apiBase}/ingredients/${editingIngredientId}`
        : `${apiBase}/ingredients`,
      {
        method: editingIngredientId ? "PUT" : "POST",
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

  const item = currentIngredients.find(x => (x.id ?? x.Id) === id);
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
  } catch (error) {
    console.error("deleteIngredient failed:", error);
    alert("Failed to delete ingredient.");
  }
}

async function loadSuggestions() {
  const { suggestionsDiv, suggestButton } = getEls();
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
    suggestionsDiv.innerHTML = `<p>Failed to load suggestions.</p>`;
  } finally {
    setBusy(suggestButton, false);
  }
}

function renderSuggestions(items) {
  const { suggestionsDiv } = getEls();
  if (!suggestionsDiv) return;

  suggestionsDiv.innerHTML = "";

  if (!items.length) {
    suggestionsDiv.innerHTML = `<p>No suggestions available.</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const item of items) {
    const name = item.name ?? item.Name ?? "";
    const cuisine = item.cuisine ?? item.Cuisine ?? "";
    const canMakeNow = item.canMakeNow ?? item.CanMakeNow ?? false;
    const missingIngredients = item.missingIngredients ?? item.MissingIngredients ?? [];
    const lowStockIngredients = item.lowStockIngredients ?? item.LowStockIngredients ?? [];
    const uses = item.uses ?? item.Uses ?? [];
    const recipeUrl = item.recipeUrl ?? item.RecipeUrl ?? "";
    const recipeSource = item.recipeSource ?? item.RecipeSource ?? "";

    const div = document.createElement("div");
    div.className = "suggestion";

    const title = document.createElement("h3");
    title.textContent = name;

    const info = document.createElement("p");
    let infoHtml = cuisine ? `${escapeHtml(cuisine)}<br>` : "";
    infoHtml += canMakeNow
      ? "Can make now"
      : `Missing: ${escapeHtml(missingIngredients.join(", "))}`;
    if (lowStockIngredients.length > 0) {
      infoHtml += `<br>Low stock: ${escapeHtml(lowStockIngredients.join(", "))}`;
    }
    info.innerHTML = infoHtml;

    const usesP = document.createElement("p");
    usesP.innerHTML = `Uses: ${escapeHtml(uses.join(", "))}`;

    const recipeLink = document.createElement("a");
    recipeLink.className = recipeUrl ? "recipe-link" : "recipe-link disabled";
    recipeLink.textContent = recipeUrl
      ? `Open recipe${recipeSource ? ` (${recipeSource})` : ""}`
      : "Recipe link coming later";
    recipeLink.href = recipeUrl || "#";
    recipeLink.target = "_blank";
    recipeLink.rel = "noreferrer";

    if (!recipeUrl) {
      recipeLink.addEventListener("click", e => e.preventDefault());
    }

    div.appendChild(title);
    div.appendChild(info);
    div.appendChild(usesP);
    div.appendChild(recipeLink);
    fragment.appendChild(div);
  }

  suggestionsDiv.appendChild(fragment);
}

function wireUp() {
  const { saveButton, cancelEditButton, suggestButton } = getEls();

  if (saveButton) saveButton.addEventListener("click", saveIngredient);
  if (cancelEditButton) cancelEditButton.addEventListener("click", resetForm);
  if (suggestButton) suggestButton.addEventListener("click", loadSuggestions);

  loadIngredients();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wireUp);
} else {
  wireUp();
}