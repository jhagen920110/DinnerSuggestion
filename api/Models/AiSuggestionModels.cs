namespace DinnerSuggestionApi.Models;

public class AiSuggestionResponse
{
    public List<AiSuggestion> Suggestions { get; set; } = new();
}

public class AiSuggestion
{
    public string Name { get; set; } = string.Empty;
    public string Cuisine { get; set; } = string.Empty;
    public List<string> Uses { get; set; } = new();
}