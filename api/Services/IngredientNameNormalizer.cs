using System.Collections.Generic;

namespace DinnerSuggestionApi.Services;

public static class IngredientNameNormalizer
{
    private static readonly Dictionary<string, string> AliasToCanonical = new(StringComparer.OrdinalIgnoreCase)
    {
        ["달걀"] = "계란",
        ["egg"] = "계란",
        ["eggs"] = "계란",

        ["진간장"] = "간장",
        ["국간장"] = "간장",
        ["soy sauce"] = "간장",

        ["들기름"] = "참기름",
        ["sesame oil"] = "참기름",

        ["onion"] = "양파",
        ["green onion"] = "대파",
        ["scallion"] = "대파",

        ["kimchi"] = "김치",
        ["rice"] = "밥",

        ["pork"] = "돼지고기",
        ["pork belly"] = "돼지고기",
        ["삼겹살"] = "돼지고기",
        ["목살"] = "돼지고기",

        ["chicken"] = "닭고기",
        ["닭"] = "닭고기",

        ["beef"] = "소고기",
    };

    public static string Normalize(string? value)
    {
        var raw = (value ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(raw))
            return string.Empty;

        return AliasToCanonical.TryGetValue(raw, out var canonical)
            ? canonical
            : raw;
    }
}