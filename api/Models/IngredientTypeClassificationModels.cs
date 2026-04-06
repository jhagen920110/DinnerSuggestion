namespace DinnerSuggestionApi.Models;

public class IngredientTypeClassificationRequest
{
    public string Name { get; set; } = string.Empty;
}

public class IngredientTypeClassificationResponse
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = "기타";
    public string Source { get; set; } = "default";
}