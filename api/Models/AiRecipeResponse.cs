using System.Text.Json.Serialization;

namespace DinnerSuggestionApi.Models;

public class AiRecipeResponse
{
    [JsonPropertyName("suggestions")]
    public List<AiRecipeSuggestion> Suggestions { get; set; } = new();
}

public class AiRecipeSuggestion
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("cuisine")]
    public string Cuisine { get; set; } = "한식";

    [JsonPropertyName("uses")]
    public List<string> Uses { get; set; } = new();

    [JsonPropertyName("recipeSearchQuery")]
    public string RecipeSearchQuery { get; set; } = string.Empty;

    [JsonPropertyName("difficulty")]
    public string Difficulty { get; set; } = string.Empty;

    [JsonPropertyName("cookTime")]
    public string CookTime { get; set; } = string.Empty;
}