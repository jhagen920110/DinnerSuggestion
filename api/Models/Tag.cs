using System.Text.Json.Serialization;
using Newtonsoft.Json;

namespace DinnerSuggestionApi.Models;

public class Tag
{
    [JsonProperty("id")]
    [JsonPropertyName("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [JsonProperty("userId")]
    [JsonPropertyName("userId")]
    public string UserId { get; set; } = string.Empty;

    [JsonProperty("name")]
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
}
