const apiBase = "http://localhost:7071/api";

const ingredientNameInput = document.getElementById("ingredientName");
const ingredientStockLevelInput = document.getElementById("ingredientStockLevel");
const saveButton = document.getElementById("saveButton");
const cancelEditButton = document.getElementById("cancelEditButton");
const ingredientsList = document.getElementById("ingredientsList");
const suggestButton = document.getElementById("suggestButton");
const suggestionsDiv = document.getElementById("suggestions");

let editingIngredientId = null;
let currentIngredients = [];

console.log("app.js loaded", {
  ingredientNameInput,
  ingredientStockLevelInput,
  saveButton,
  cancelEditButton,
  ingredientsList,
  suggestButton,
  suggestionsDiv
});

async function loadIngredients() {
  try {
    console.log("Loading ingredients...");
    const response = await fetch(`${apiBase}/ingredients`);

    if (!response.ok) {
      throw new Error(`Failed to load ingredients: ${response.status}`);
    }

    const items = await response.json();
    console.log("Ingredients loaded:", items);

    currentIngredients = items;
    renderIngredients(items);
  } catch (error) {
    console.error("loadIngredients failed:", error);
    ingredientsList.innerHTML = `<li class="empty-state">Failed to load ingredients.</li>`;
  }
}

function renderIngredients(items) {
  ingredientsList.innerHTML = "";

  if (!items.length) {
    ingredientsList.innerHTML = `<li class="empty-state">No ingredients yet.</li>`;
    return;
  }

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

    const badgeClass =
      stockLevel.toLowerCase() === "low"
        ? "badge low"
        : stockLevel.toLowerCase() === "out"
          ? "badge out"
          : "badge";

    metaDiv.innerHTML = `<span class="${badgeClass}">${escapeHtml(stockLevel)}</span>`;

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

    ingredientsList.appendChild(li);
  }
}

async function saveIngredient() {
  console.log("saveIngredient clicked");

  const name = ingredientNameInput?.value?.trim() ?? "";
  const stockLevel = ingredientStockLevelInput?.value ?? "Some";

  console.log("saveIngredient payload preview:", { name, stockLevel, editingIngredientId });

  if (!name) {
    alert("Ingredient name is required.");
    return;
  }

  const payload = { name, stockLevel };

  try {
    let response;

    if (editingIngredientId) {
      response = await fetch(`${apiBase}/ingredients/${editingIngredientId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      response = await fetch(`${apiBase}/ingredients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }

    console.log("saveIngredient response status:", response.status);

    if (!response.ok) {
      const text = await response.text();
      console.error("saveIngredient failed response:", text);
      throw new Error(`Failed to save ingredient: ${response.status} ${text}`);
    }

    resetForm();
    await loadIngredients();
  } catch (error) {
    console.error("saveIngredient failed:", error);
    alert(`Failed to save ingredient. Check browser console.`);
  }
}

function startEditIngredient(id) {
  const item = currentIngredients.find(x => (x.id ?? x.Id) === id);
  if (!item) return;

  const name = item.name ?? item.Name ?? "";
  const stockLevel = item.stockLevel ?? item.StockLevel ?? "Some";

  editingIngredientId = id;
  ingredientNameInput.value = name;
  ingredientStockLevelInput.value = stockLevel;
  saveButton.textContent = "Save Changes";
  cancelEditButton.classList.remove("hidden");
  ingredientNameInput.focus();
}

function resetForm() {
  editingIngredientId = null;
  ingredientNameInput.value = "";
  ingredientStockLevelInput.value = "Some";
  saveButton.textContent = "Add Ingredient";
  cancelEditButton.classList.add("hidden");
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
  try {
    const response = await fetch(`${apiBase}/suggestions`, {
      method: "POST"
    });

    if (!response.ok) {
      throw new Error(`Failed to load suggestions: ${response.status}`);
    }

    const items = await response.json();
    renderSuggestions(items);
  } catch (error) {
    console.error("loadSuggestions failed:", error);
    suggestionsDiv.innerHTML = `<p class="empty-state">Failed to load suggestions.</p>`;
  }
}

function renderSuggestions(items) {
  suggestionsDiv.innerHTML = "";

  if (!items.length) {
    suggestionsDiv.innerHTML = `<p class="empty-state">No suggestions available.</p>`;
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

    const div = document.createElement("div");
    div.className = "suggestion";

    const title = document.createElement("h3");
    title.textContent = name;

    const info = document.createElement("p");
    let infoHtml = `<span class="badge">${escapeHtml(cuisine)}</span>`;

    if (canMakeNow) {
      infoHtml += `<span class="badge good">Can make now</span>`;
    } else {
      infoHtml += `<span class="badge warn">Missing: ${escapeHtml(missingIngredients.join(", "))}</span>`;
    }

    if (lowStockIngredients.length > 0) {
      infoHtml += `<span class="badge low">Low stock: ${escapeHtml(lowStockIngredients.join(", "))}</span>`;
    }

    info.innerHTML = infoHtml;

    const usesP = document.createElement("p");
    usesP.innerHTML = `<strong>Uses:</strong> ${escapeHtml(uses.join(", "))}`;

    const recipeLink = document.createElement("a");
    recipeLink.className = recipeUrl ? "recipe-link" : "recipe-link disabled";
    recipeLink.textContent = recipeUrl
      ? `Open recipe${recipeSource ? ` (${recipeSource})` : ""}`
      : "Recipe link coming later";
    recipeLink.href = recipeUrl || "#";
    recipeLink.target = "_blank";
    recipeLink.rel = "noreferrer";

    div.appendChild(title);
    div.appendChild(info);
    div.appendChild(usesP);
    div.appendChild(recipeLink);

    suggestionsDiv.appendChild(div);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

saveButton.addEventListener("click", saveIngredient);
cancelEditButton.addEventListener("click", resetForm);
suggestButton.addEventListener("click", loadSuggestions);

loadIngredients();