namespace DinnerSuggestionApi.Models;

public class Suggestion
{
    public string Name { get; set; } = string.Empty;
    public bool CanMakeNow { get; set; }
    public List<string> MissingIngredients { get; set; } = new();
    public List<string> LowStockIngredients { get; set; } = new();
    public string Cuisine { get; set; } = "Korean";
    public List<string> Uses { get; set; } = new();
    public string RecipeUrl { get; set; } = string.Empty;
    public string RecipeSource { get; set; } = string.Empty;
    public string Difficulty { get; set; } = string.Empty;
    public string CookTime { get; set; } = string.Empty;
    public string Source { get; set; } = "ai";
}