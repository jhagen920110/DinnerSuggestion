using DinnerSuggestionApi.Models;

namespace DinnerSuggestionApi.Services;

public class SuggestionService
{
    public List<Suggestion> GetSuggestions(List<string> availablePantry, List<string> lowStockIngredients)
    {
        var ideas = new List<Suggestion>
        {
            new()
            {
                Name = "Kimchi Fried Rice",
                Cuisine = "Korean",
                Uses = ["rice", "kimchi", "egg", "spam", "onion"],
                RecipeUrl = "",
                RecipeSource = ""
            },
            new()
            {
                Name = "Gyeran Bap",
                Cuisine = "Korean",
                Uses = ["rice", "egg", "soy sauce", "sesame oil"],
                RecipeUrl = "",
                RecipeSource = ""
            },
            new()
            {
                Name = "Budae-jjigae",
                Cuisine = "Korean",
                Uses = ["kimchi", "spam", "onion", "tofu", "green onion"],
                RecipeUrl = "",
                RecipeSource = ""
            },
            new()
            {
                Name = "Simple Kimchi Omelet",
                Cuisine = "Korean",
                Uses = ["egg", "kimchi", "onion"],
                RecipeUrl = "",
                RecipeSource = ""
            },
            new()
            {
                Name = "Kimchi Spam Rice Bowl",
                Cuisine = "Korean",
                Uses = ["rice", "kimchi", "spam", "egg"],
                RecipeUrl = "",
                RecipeSource = ""
            },
            new()
            {
                Name = "Garlic Butter Pasta",
                Cuisine = "Italian",
                Uses = ["pasta", "garlic", "butter"],
                RecipeUrl = "",
                RecipeSource = ""
            }
        };

        foreach (var idea in ideas)
        {
            idea.MissingIngredients = idea.Uses
                .Where(x => !availablePantry.Contains(x))
                .ToList();

            idea.LowStockIngredients = idea.Uses
                .Where(x => lowStockIngredients.Contains(x))
                .ToList();

            idea.CanMakeNow = idea.MissingIngredients.Count == 0;
        }

        return ideas
            .OrderByDescending(x => x.CanMakeNow)
            .ThenBy(x => x.MissingIngredients.Count)
            .ThenBy(x => x.Name)
            .ToList();
    }
}