using System.Net;
using System.Text.Json;
using DinnerSuggestionApi.Models;
using DinnerSuggestionApi.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace DinnerSuggestionApi.Functions;

public class SuggestionsFunction
{
    private readonly PantryService _pantryStore;
    private readonly RecipeService _recipeService;
    private readonly SuggestionService _suggestionService;

    public SuggestionsFunction(PantryService pantryStore, RecipeService recipeService, SuggestionService suggestionService)
    {
        _pantryStore = pantryStore;
        _recipeService = recipeService;
        _suggestionService = suggestionService;
    }

    [Function("GetSuggestions")]
    public async Task<HttpResponseData> GetSuggestions(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "suggestions")] HttpRequestData req)
    {
        var mustInclude = new List<string>();
        var exclude = new List<string>();

        try
        {
            var body = await JsonSerializer.DeserializeAsync<SuggestionsRequest>(
                req.Body,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (body?.MustInclude is not null)
            {
                mustInclude = body.MustInclude
                    .Where(x => !string.IsNullOrWhiteSpace(x))
                    .Select(x => x.Trim())
                    .ToList();
            }

            if (body?.Exclude is not null)
            {
                exclude = body.Exclude
                    .Where(x => !string.IsNullOrWhiteSpace(x))
                    .Select(x => x.Trim())
                    .ToList();
            }
        }
        catch { /* empty body is fine */ }

        var availablePantry = await _pantryStore.GetAvailableIngredientNamesAsync();

        // 1. DB recipes first (exclude already-shown)
        var dbSuggestions = await BuildDbSuggestions(availablePantry, mustInclude);

        if (exclude.Count > 0)
        {
            var excludeKeys = new HashSet<string>(
                exclude.Select(ToComparisonKey),
                StringComparer.OrdinalIgnoreCase);

            dbSuggestions = dbSuggestions
                .Where(s => !excludeKeys.Contains(ToComparisonKey(s.Name)))
                .ToList();
        }

        // 2. AI suggestions
        var aiSuggestions = await _suggestionService.GetSuggestionsAsync(
            availablePantry,
            mustInclude,
            exclude);

        // Deduplicate: remove AI suggestions that match a DB recipe name
        var dbNames = new HashSet<string>(
            dbSuggestions.Select(s => ToComparisonKey(s.Name)),
            StringComparer.OrdinalIgnoreCase);

        var uniqueAi = aiSuggestions
            .Where(s => !dbNames.Contains(ToComparisonKey(s.Name)))
            .ToList();

        var combined = dbSuggestions.Concat(uniqueAi).ToList();

        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(combined);
        return response;
    }

    private async Task<List<Suggestion>> BuildDbSuggestions(
        List<string> availablePantry,
        List<string> mustInclude)
    {
        var recipes = await _recipeService.FindByIngredientsAsync(availablePantry);

        var availableSet = new HashSet<string>(
            availablePantry.Select(ToComparisonKey),
            StringComparer.OrdinalIgnoreCase);

        var suggestions = recipes.Select(recipe =>
        {
            var missing = recipe.Ingredients
                .Where(i => !availableSet.Contains(ToComparisonKey(i)))
                .ToList();

            var recipeUrl = !string.IsNullOrWhiteSpace(recipe.RecipeUrl)
                ? recipe.RecipeUrl
                : $"https://www.10000recipe.com/recipe/list.html?q={Uri.EscapeDataString(recipe.Name)}";

            return new Suggestion
            {
                Name = recipe.Name,
                Cuisine = recipe.Cuisine,
                Uses = recipe.Ingredients,
                MissingIngredients = missing,
                CanMakeNow = missing.Count == 0,
                RecipeUrl = recipeUrl,
                RecipeSource = !string.IsNullOrWhiteSpace(recipe.RecipeUrl) ? "저장됨" : "만개의레시피",
                Difficulty = recipe.Difficulty,
                CookTime = recipe.CookTime,
                Source = "saved",
                ImageUrl = recipe.ImageUrl
            };
        }).Where(s => s.MissingIngredients.Count <= 1).ToList();
        if (mustInclude.Count > 0)
        {
            var mustIncludeKeys = new HashSet<string>(
                mustInclude.Select(ToComparisonKey),
                StringComparer.OrdinalIgnoreCase);

            suggestions = suggestions
                .Where(s => s.Uses.Any(u => mustIncludeKeys.Contains(ToComparisonKey(u))))
                .ToList();
        }

        return suggestions
            .OrderByDescending(s => s.CanMakeNow)
            .ThenBy(s => s.MissingIngredients.Count)
            .ToList();
    }

    private static string ToComparisonKey(string value)
    {
        return (value ?? string.Empty).Trim().Replace(" ", string.Empty).ToLowerInvariant();
    }

    private class SuggestionsRequest
    {
        public List<string>? MustInclude { get; set; }
        public List<string>? Exclude { get; set; }
    }
}