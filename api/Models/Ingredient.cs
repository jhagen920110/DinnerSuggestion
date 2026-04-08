using System.Text.Json.Serialization;
using Newtonsoft.Json;

namespace DinnerSuggestionApi.Models;

public class Ingredient
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

    [JsonProperty("stockLevel")]
    [JsonPropertyName("stockLevel")]
    public string StockLevel { get; set; } = "Some";

    [JsonProperty("type")]
    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;
}