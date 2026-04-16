import json
import requests

API_BASE = "https://func-dinnersuggestion-dev-dhdtcphpgthxanc4.centralus-01.azurewebsites.net/api"

with open("recipes.json", "r", encoding="utf-8") as f:
    recipes = json.load(f)

print(f"Found {len(recipes)} recipes to import.\n")

imported = 0
skipped = 0

for i, recipe in enumerate(recipes, 1):
    print(f"--- [{i}/{len(recipes)}] {recipe['name']} ---")
    print(f"  Ingredients: {', '.join(recipe.get('ingredients', []))}")
    print(f"  Difficulty: {recipe.get('difficulty', '보통')}")
    print(f"  Cook time: {recipe.get('cookTime', '')}")
    print(f"  Cuisine: {recipe.get('cuisine', '한식')}")
    print(f"  Tags: {', '.join(recipe.get('tags', []))}")
    if recipe.get('imageUrl'):
        print(f"  Image: {recipe['imageUrl']}")
    if recipe.get('recipeUrl'):
        print(f"  Recipe URL: {recipe['recipeUrl']}")
    if recipe.get('notes'):
        print(f"  Notes: {recipe['notes']}")

    choice = input("\n  Import this recipe? (y/n/q to quit): ").strip().lower()
    if choice == 'q':
        print("Stopped.")
        break
    if choice != 'y':
        skipped += 1
        print("  Skipped.\n")
        continue

    resp = requests.post(f"{API_BASE}/meals", json=recipe)
    if resp.status_code == 201:
        print(f"  Imported!\n")
        imported += 1
    elif resp.status_code == 409:
        print(f"  Already exists, skipped.\n")
        skipped += 1
    else:
        print(f"  Error {resp.status_code}: {resp.text}\n")
        skipped += 1

print(f"\nDone! Imported: {imported}, Skipped: {skipped}")
