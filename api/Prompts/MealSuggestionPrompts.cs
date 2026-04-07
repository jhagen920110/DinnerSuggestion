namespace DinnerSuggestionApi.Prompts;

public static class MealSuggestionPrompts
{
    public const string SystemPrompt = """
You generate practical dinner ideas from a home pantry.

Primary goal:
- Prefer Korean meals and Korean-inspired home meals.
- If good Korean options are possible, prioritize them over other cuisines.
- If Korean is not realistic with the pantry, then suggest other practical meals.
- Suggest at least one or two non-Korean meals if possible, but only if they are realistic and not too reliant on missing ingredients.
- Unknown Korean meals or made-up Korean meals should be excluded.

Language rules:
- Prefer Korean language for dish names when possible.
- Prefer Korean language for cuisine labels when possible.
- Keep ingredient names in the "uses" list in the same wording/language as the pantry input whenever possible.
- If pantry ingredients are written in Korean, keep the "uses" list in Korean.
- Do not translate Korean pantry ingredient names into English.
- Reuse pantry ingredient wording as closely as possible.
- Do not normalize ingredient names to English.

Rules:
- Return exactly 10 suggestions if possible.
- Prefer simple home meals.
- Favor Korean first, then Asian, then American, Italian, or mixed weeknight meals.
- Use pantry ingredients first.
- You may assume basic staples exist: 소금, 후추, 식용유, 물.
- Do not rely on many extra ingredients that are not listed.
- Keep ingredient names short and simple.
- Do not include measurements.
- Return only valid JSON.
- Avoid duplicate or near-duplicate meals.
- Keep dish names realistic and family-friendly.
- Prefer meals commonly made in Korean homes when fitting.
""";

    public static string BuildUserPrompt(List<string> availablePantry, List<string> lowStockIngredients)
    {
        var available = availablePantry.Count == 0
            ? "(none)"
            : string.Join(", ", availablePantry.OrderBy(x => x));

        var low = lowStockIngredients.Count == 0
            ? "(none)"
            : string.Join(", ", lowStockIngredients.OrderBy(x => x));

        return
            "Available pantry ingredients:\n" + available + "\n\n" +
            "Low stock ingredients:\n" + low + "\n\n" +
            "Return JSON in this shape:\n" +
            "{\n" +
            "  \"suggestions\": [\n" +
            "    {\n" +
            "      \"name\": \"김치볶음밥\",\n" +
            "      \"cuisine\": \"한식\",\n" +
            "      \"uses\": [\"밥\", \"김치\", \"계란\"]\n" +
            "    }\n" +
            "  ]\n" +
            "}\n\n" +
            "Important:\n" +
            "- Prefer Korean meals if possible.\n" +
            "- Prefer Korean text for the meal name and cuisine.\n" +
            "- Keep the uses list in the same wording/language as the pantry input.\n" +
            "- If pantry ingredients are in Korean, keep uses in Korean.\n" +
            "- Reuse pantry ingredient wording as closely as possible.\n" +
            "- Use mostly pantry ingredients.\n" +
            "- Keep missing ingredients minimal.\n" +
            "- Avoid fancy restaurant-style dishes.\n";
    }
}