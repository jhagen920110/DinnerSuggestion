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
- Keep ingredient names in the "uses" list simple, normalized, and in English.
- Do not translate ingredient names in "uses" into Korean.

Rules:
- Return exactly 10 suggestions if possible.
- Prefer simple home meals.
- Favor Korean first, then Asian, then American, Italian, or mixed weeknight meals.
- Use pantry ingredients first.
- You may assume basic staples exist: salt, pepper, cooking oil, water.
- Do not rely on many extra ingredients that are not listed.
- Keep ingredient names short and simple.
- Do not include measurements.
- Return only valid JSON.
- Avoid duplicate or near-duplicate meals.
- Keep dish names realistic and family-friendly.
- Prefer meals commonly made in Korean homes when fitting.
""";

    public static string BuildUserPrompt(
        List<string> availablePantry,
        List<string> lowStockIngredients)
    {
        var available = availablePantry.Count == 0
            ? "(none)"
            : string.Join(", ", availablePantry.OrderBy(x => x));

        var low = lowStockIngredients.Count == 0
            ? "(none)"
            : string.Join(", ", lowStockIngredients.OrderBy(x => x));

        return
            "Available pantry ingredients:\n" +
            available +
            "\n\nLow stock ingredients:\n" +
            low +
            "\n\nReturn JSON in this shape:\n" +
            "{\n" +
            "  \"suggestions\": [\n" +
            "    {\n" +
            "      \"name\": \"김치볶음밥\",\n" +
            "      \"cuisine\": \"한식\",\n" +
            "      \"uses\": [\"rice\", \"kimchi\", \"egg\"]\n" +
            "    }\n" +
            "  ]\n" +
            "}\n\n" +
            "Important:\n" +
            "- Prefer Korean meals if possible.\n" +
            "- Prefer Korean text for the meal name and cuisine.\n" +
            "- Keep the uses list in English.\n" +
            "- Use mostly pantry ingredients.\n" +
            "- Keep missing ingredients minimal.\n" +
            "- Avoid fancy restaurant-style dishes.\n";
    }
}