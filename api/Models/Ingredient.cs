using System.Text.Json.Serialization;

namespace DinnerSuggestionApi.Models;

public class Ingredient
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("stockLevel")]
    public string StockLevel { get; set; } = "보통";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "기타";
}