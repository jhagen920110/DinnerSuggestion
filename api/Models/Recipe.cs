using System.Text.Json.Serialization;
using Newtonsoft.Json;

namespace DinnerSuggestionApi.Models;

public class Recipe
{
    [JsonProperty("id")]
    [JsonPropertyName("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [JsonProperty("userId")]
    [JsonPropertyName("userId")]
    public string UserId { get; set; } = "jonathan";

    [JsonProperty("name")]
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonProperty("ingredients")]
    [JsonPropertyName("ingredients")]
    public List<string> Ingredients { get; set; } = new();

    [JsonProperty("difficulty")]
    [JsonPropertyName("difficulty")]
    public string Difficulty { get; set; } = "보통";

    [JsonProperty("cookTime")]
    [JsonPropertyName("cookTime")]
    public string CookTime { get; set; } = string.Empty;

    [JsonProperty("cuisine")]
    [JsonPropertyName("cuisine")]
    public string Cuisine { get; set; } = "한식";

    [JsonProperty("tags")]
    [JsonPropertyName("tags")]
    public List<string> Tags { get; set; } = new();

    [JsonProperty("notes")]
    [JsonPropertyName("notes")]
    public string Notes { get; set; } = string.Empty;

    [JsonProperty("recipeUrl")]
    [JsonPropertyName("recipeUrl")]
    public string RecipeUrl { get; set; } = string.Empty;

    [JsonProperty("lastMade")]
    [JsonPropertyName("lastMade")]
    public DateTime? LastMade { get; set; }
}
