using System.Text.Json.Serialization;

namespace DinnerSuggestionApi.Models;

public class AiMealResponse
{
    [JsonPropertyName("suggestions")]
    public List<AiMealSuggestion> Suggestions { get; set; } = new();
}

public class AiMealSuggestion
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("cuisine")]
    public string Cuisine { get; set; } = "General";

    [JsonPropertyName("uses")]
    public List<string> Uses { get; set; } = new();

    [JsonPropertyName("reason")]
    public string Reason { get; set; } = string.Empty;

    [JsonPropertyName("recipeSearchQuery")]
    public string RecipeSearchQuery { get; set; } = string.Empty;

    [JsonPropertyName("recipeUrl")]
    public string RecipeUrl { get; set; } = string.Empty;

    [JsonPropertyName("recipeSource")]
    public string RecipeSource { get; set; } = string.Empty;
}