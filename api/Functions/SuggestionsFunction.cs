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
    private readonly MealLogService _mealLogService;
    private readonly BlockedRecipeService _blockedRecipeService;

    public SuggestionsFunction(PantryService pantryStore, RecipeService recipeService, SuggestionService suggestionService, MealLogService mealLogService, BlockedRecipeService blockedRecipeService)
    {
        _pantryStore = pantryStore;
        _recipeService = recipeService;
        _suggestionService = suggestionService;
        _mealLogService = mealLogService;
        _blockedRecipeService = blockedRecipeService;
    }

    [Function("GetSuggestionQuestions")]
    public async Task<HttpResponseData> GetSuggestionQuestions(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "suggestions/questions")] HttpRequestData req)
    {
        var availablePantry = await _pantryStore.GetAvailableIngredientNamesAsync();

        var today = DateTime.UtcNow;
        var thirtyDaysAgo = today.AddDays(-30);
        var recentLogs = await _mealLogService.GetByDateRangeAsync(
            thirtyDaysAgo.ToString("yyyy-MM-dd"),
            today.ToString("yyyy-MM-dd"));
        var recentMealNames = recentLogs
            .OrderByDescending(l => l.Date)
            .Select(l => l.Name)
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Distinct()
            .ToList();

        var mealHistoryForAi = recentMealNames.Count >= 2 ? recentMealNames : null;

        var (message, questions) = await _suggestionService.GetQuestionsAsync(
            availablePantry,
            mealHistoryForAi);

        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(new { message, questions });
        return response;
    }

    [Function("GetSuggestions")]
    public async Task<HttpResponseData> GetSuggestions(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "suggestions")] HttpRequestData req)
    {
        var mustInclude = new List<string>();
        var exclude = new List<string>();
        List<AnswerEntry>? answers = null;

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

            if (body?.Answers is not null)
            {
                answers = body.Answers
                    .Where(a => !string.IsNullOrWhiteSpace(a.Category) && !string.IsNullOrWhiteSpace(a.Answer))
                    .ToList();
            }
        }
        catch { /* empty body is fine */ }

        var availablePantry = await _pantryStore.GetAvailableIngredientNamesAsync();

        // Fetch recent meal logs (last 30 days)
        var today = DateTime.UtcNow;
        var thirtyDaysAgo = today.AddDays(-30);
        var recentLogs = await _mealLogService.GetByDateRangeAsync(
            thirtyDaysAgo.ToString("yyyy-MM-dd"),
            today.ToString("yyyy-MM-dd"));
        var recentMealNames = recentLogs
            .OrderByDescending(l => l.Date)
            .Select(l => l.Name)
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Distinct()
            .ToList();

        // Only pass meal history if there are enough entries to be meaningful
        var mealHistoryForAi = recentMealNames.Count >= 2 ? recentMealNames : null;

        // Fetch blocked recipes
        var blockedRecipes = await _blockedRecipeService.GetAllAsync();
        var blockedNames = new HashSet<string>(
            blockedRecipes.Select(b => ToComparisonKey(b.Name)),
            StringComparer.OrdinalIgnoreCase);

        // Add blocked recipe names to the exclude list so AI won't suggest them
        exclude = exclude.Concat(blockedRecipes.Select(b => b.Name)).Distinct().ToList();

        // 1. DB recipes first (exclude already-shown)
        var allRecipes = await _recipeService.GetAllAsync();
        var allRecipeNames = new HashSet<string>(
            allRecipes.Select(r => ToComparisonKey(r.Name)),
            StringComparer.OrdinalIgnoreCase);

        var dbSuggestions = BuildDbSuggestions(allRecipes, availablePantry, mustInclude);

        // Filter saved recipes by user preferences (all answer categories)
        var preferences = answers?
            .Select(a => new KeyValuePair<string, string>(a.Category, a.Answer))
            .ToList();

        if (answers is { Count: > 0 })
        {
            foreach (var ans in answers)
            {
                if (IsCatchAllAnswer(ans.Answer)) continue;

                var category = ans.Category.ToLowerInvariant();
                var answer = ans.Answer;

                if (category == "cuisine")
                {
                    dbSuggestions = dbSuggestions
                        .Where(s => IsCuisineMatch(s.Cuisine, answer))
                        .ToList();
                }
                else if (category == "style")
                {
                    dbSuggestions = dbSuggestions
                        .Where(s => IsStyleMatch(s.Name, answer))
                        .ToList();
                }
                // Other categories (mood, ingredient, seasonal, adventure, effort, spice)
                // are too nuanced for simple string matching on DB recipes — let AI handle those.
                // But we still pass all preferences to the AI prompt.
            }
        }

        if (exclude.Count > 0)
        {
            var excludeKeys = new HashSet<string>(
                exclude.Select(ToComparisonKey),
                StringComparer.OrdinalIgnoreCase);

            dbSuggestions = dbSuggestions
                .Where(s => !excludeKeys.Contains(ToComparisonKey(s.Name)))
                .ToList();
        }

        // 2. AI suggestions (also exclude all saved recipe names)
        var aiExclude = exclude.Concat(allRecipes.Select(r => r.Name)).Distinct().ToList();
        var knownRecipeNames = allRecipes.Select(r => r.Name).Distinct().ToList();
        var savedSuggestionNames = dbSuggestions.Select(s => s.Name).ToList();
        var (aiMessage, aiSuggestions) = await _suggestionService.GetSuggestionsAsync(
            availablePantry,
            mustInclude,
            aiExclude,
            mealHistoryForAi,
            knownRecipeNames,
            savedSuggestionNames,
            preferences);

        // Deduplicate: remove AI suggestions that match any saved recipe name
        var uniqueAi = aiSuggestions
            .Where(s => !allRecipeNames.Contains(ToComparisonKey(s.Name)))
            .ToList();

        // Mix: limit saved recipes to max 2, interleave with AI results
        // Also filter out any blocked recipes as a safety net
        var limitedDb = dbSuggestions
            .Where(s => !blockedNames.Contains(ToComparisonKey(s.Name)))
            .Take(2)
            .ToList();
        var filteredAi = uniqueAi
            .Where(s => !blockedNames.Contains(ToComparisonKey(s.Name)))
            .OrderBy(_ => Random.Shared.Next())
            .ToList();

        // Interleave: AI, AI, saved, AI, AI, saved, ...
        var combined = new List<Suggestion>();
        int aiIdx = 0, dbIdx = 0;
        while (aiIdx < filteredAi.Count || dbIdx < limitedDb.Count)
        {
            // Add 2 AI suggestions
            for (int i = 0; i < 2 && aiIdx < filteredAi.Count; i++)
                combined.Add(filteredAi[aiIdx++]);
            // Add 1 saved recipe
            if (dbIdx < limitedDb.Count)
                combined.Add(limitedDb[dbIdx++]);
        }

        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(new { message = aiMessage, suggestions = combined });
        return response;
    }

    private List<Suggestion> BuildDbSuggestions(
        List<Recipe> recipes,
        List<string> availablePantry,
        List<string> mustInclude)
    {

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
        }).Where(s => s.MissingIngredients.Count <= 2).ToList();
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
            .ThenBy(_ => Random.Shared.Next())
            .ToList();
    }

    private static string ToComparisonKey(string value)
    {
        return (value ?? string.Empty).Trim().Replace(" ", string.Empty).ToLowerInvariant();
    }

    private static bool IsCatchAllAnswer(string answer)
    {
        var lower = answer.Trim().ToLowerInvariant();
        return lower.Contains("아무") || lower.Contains("상관없") || lower.Contains("다 좋") || lower.Contains("뭐든");
    }

    private static bool IsCuisineMatch(string recipeCuisine, string userChoice)
    {
        if (string.IsNullOrWhiteSpace(recipeCuisine) || string.IsNullOrWhiteSpace(userChoice))
            return false;

        var rc = recipeCuisine.Trim().ToLowerInvariant();
        var uc = userChoice.Trim().ToLowerInvariant();

        // Direct contains match
        if (rc.Contains(uc) || uc.Contains(rc))
            return true;

        // Map common labels
        return (uc, rc) switch
        {
            ("한식", "korean") or ("korean", "한식") => true,
            ("양식", "western") or ("western", "양식") => true,
            ("중식", "chinese") or ("chinese", "중식") => true,
            ("일식", "japanese") or ("japanese", "일식") => true,
            _ => false
        };
    }

    private static bool IsStyleMatch(string dishName, string styleAnswer)
    {
        if (string.IsNullOrWhiteSpace(dishName) || string.IsNullOrWhiteSpace(styleAnswer))
            return false;

        var name = dishName.Trim().ToLowerInvariant();
        var style = styleAnswer.Trim().ToLowerInvariant();

        // Map style keywords to dish name patterns
        var styleKeywords = new Dictionary<string, string[]>
        {
            { "국물", new[] { "국", "찌개", "탕", "전골" } },
            { "볶음", new[] { "볶음", "볶", "구이" } },
            { "구이", new[] { "구이", "볶음", "전" } },
            { "면", new[] { "면", "국수", "파스타", "라면", "냉면", "우동", "소바" } },
            { "밥", new[] { "밥", "덮밥", "볶음밥", "비빔밥", "리조또" } },
            { "비빔", new[] { "비빔", "무침", "샐러드" } },
            { "찜", new[] { "찜", "조림" } },
            { "튀김", new[] { "튀김", "까스", "커틀릿", "프라이" } },
        };

        // Check direct match
        if (name.Contains(style))
            return true;

        // Check mapped keywords
        foreach (var (key, patterns) in styleKeywords)
        {
            if (style.Contains(key))
            {
                return patterns.Any(p => name.Contains(p));
            }
        }

        return false;
    }

    private class SuggestionsRequest
    {
        public List<string>? MustInclude { get; set; }
        public List<string>? Exclude { get; set; }
        public List<AnswerEntry>? Answers { get; set; }
    }

    private class AnswerEntry
    {
        public string Category { get; set; } = string.Empty;
        public string Answer { get; set; } = string.Empty;
    }
}