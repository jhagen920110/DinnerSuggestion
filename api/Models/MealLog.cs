using System.Text.Json.Serialization;
using Newtonsoft.Json;

namespace DinnerSuggestionApi.Models;

public class MealLog
{
    [JsonProperty("id")]
    [JsonPropertyName("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [JsonProperty("userId")]
    [JsonPropertyName("userId")]
    public string UserId { get; set; } = "jonathan";

    [JsonProperty("date")]
    [JsonPropertyName("date")]
    public string Date { get; set; } = string.Empty; // "YYYY-MM-DD"

    [JsonProperty("name")]
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonProperty("imageUrl")]
    [JsonPropertyName("imageUrl")]
    public string ImageUrl { get; set; } = string.Empty;

    [JsonProperty("recipeId")]
    [JsonPropertyName("recipeId")]
    public string RecipeId { get; set; } = string.Empty;

    [JsonProperty("source")]
    [JsonPropertyName("source")]
    public string Source { get; set; } = string.Empty; // "suggestion", "recipe", "manual"
}
