using System.Text.Json.Serialization;

namespace DinnerSuggestionApi.Models;

public class AiQuestionResponse
{
    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("questions")]
    public List<AiQuestion> Questions { get; set; } = new();
}

public class AiQuestion
{
    [JsonPropertyName("category")]
    public string Category { get; set; } = string.Empty;

    [JsonPropertyName("text")]
    public string Text { get; set; } = string.Empty;

    [JsonPropertyName("options")]
    public List<string> Options { get; set; } = new();
}
