using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using DinnerSuggestionApi.Models;
using DinnerSuggestionApi.Prompts;
using Microsoft.Extensions.Options;

namespace DinnerSuggestionApi.Services;

public class SuggestionService
{
    private readonly HttpClient _httpClient;
    private readonly AzureOpenAiOptions _openAiOptions;

    public SuggestionService(
        HttpClient httpClient,
        IOptions<AzureOpenAiOptions> openAiOptions)
    {
        _httpClient = httpClient;
        _openAiOptions = openAiOptions.Value;
    }

    public async Task<List<Suggestion>> GetSuggestionsAsync(
        List<string> availablePantry,
        List<string> lowStockIngredients,
        List<string> canonicalIngredientNames)
    {
        if (!IsAiConfigured())
        {
            return BuildFallbackSuggestions(availablePantry, lowStockIngredients);
        }

        try
        {
            var aiSuggestions = await GetAiSuggestionsAsync(
                availablePantry,
                lowStockIngredients,
                canonicalIngredientNames);

            var mapped = MapSuggestions(aiSuggestions, availablePantry, lowStockIngredients);

            return mapped.Count > 0
                ? mapped
                : BuildFallbackSuggestions(availablePantry, lowStockIngredients);
        }
        catch
        {
            return BuildFallbackSuggestions(availablePantry, lowStockIngredients);
        }
    }

    private bool IsAiConfigured()
    {
        return !string.IsNullOrWhiteSpace(_openAiOptions.Endpoint)
            && !string.IsNullOrWhiteSpace(_openAiOptions.ApiKey)
            && !string.IsNullOrWhiteSpace(_openAiOptions.DeploymentName);
    }

    private async Task<List<AiMealSuggestion>> GetAiSuggestionsAsync(
        List<string> availablePantry,
        List<string> lowStockIngredients,
        List<string> canonicalIngredientNames)
    {
        var endpoint = _openAiOptions.Endpoint.TrimEnd('/');
        var url = $"{endpoint}/openai/v1/chat/completions";

        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.Add("api-key", _openAiOptions.ApiKey);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        var systemPrompt = MealSuggestionPrompts.SystemPrompt;
        var userPrompt = MealSuggestionPrompts.BuildUserPrompt(
            availablePantry,
            lowStockIngredients,
            canonicalIngredientNames);

        var payload = new
        {
            model = _openAiOptions.DeploymentName,
            messages = new object[]
            {
                new { role = "system", content = systemPrompt },
                new { role = "user", content = userPrompt }
            },
            max_completion_tokens = 1100,
            response_format = new
            {
                type = "json_schema",
                json_schema = new
                {
                    name = "meal_suggestions",
                    strict = true,
                    schema = new
                    {
                        type = "object",
                        properties = new
                        {
                            suggestions = new
                            {
                                type = "array",
                                items = new
                                {
                                    type = "object",
                                    properties = new
                                    {
                                        name = new { type = "string" },
                                        cuisine = new { type = "string" },
                                        uses = new
                                        {
                                            type = "array",
                                            items = new { type = "string" }
                                        },
                                        reason = new { type = "string" },
                                        recipeSearchQuery = new { type = "string" },
                                        recipeUrl = new { type = "string" },
                                        recipeSource = new { type = "string" }
                                    },
                                    required = new[]
                                    {
                                        "name",
                                        "cuisine",
                                        "uses",
                                        "reason",
                                        "recipeSearchQuery",
                                        "recipeUrl",
                                        "recipeSource"
                                    },
                                    additionalProperties = false
                                }
                            }
                        },
                        required = new[] { "suggestions" },
                        additionalProperties = false
                    }
                }
            }
        };

        request.Content = new StringContent(
            JsonSerializer.Serialize(payload),
            Encoding.UTF8,
            "application/json");

        using var response = await _httpClient.SendAsync(request);
        var responseText = await response.Content.ReadAsStringAsync();

        response.EnsureSuccessStatusCode();

        using var doc = JsonDocument.Parse(responseText);
        var content = doc.RootElement
            .GetProperty("choices")[0]
            .GetProperty("message")
            .GetProperty("content")
            .GetString();

        if (string.IsNullOrWhiteSpace(content))
        {
            return new List<AiMealSuggestion>();
        }

        var structured = JsonSerializer.Deserialize<AiMealResponse>(
            content,
            new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

        return structured?.Suggestions ?? new List<AiMealSuggestion>();
    }

    private static List<Suggestion> MapSuggestions(
        List<AiMealSuggestion> aiSuggestions,
        List<string> availablePantry,
        List<string> lowStockIngredients)
    {
        var availableSet = new HashSet<string>(
            availablePantry
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(ToComparisonKey),
            StringComparer.OrdinalIgnoreCase);

        var lowSet = new HashSet<string>(
            lowStockIngredients
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(ToComparisonKey),
            StringComparer.OrdinalIgnoreCase);

        return aiSuggestions
            .Where(x => !string.IsNullOrWhiteSpace(x.Name))
            .Where(x => x.Uses is not null && x.Uses.Count > 0)
            .Where(x => x.Uses.All(y => !ContainsEnglishLetters(y)))
            .Select(ai =>
            {
                var uses = ai.Uses
                    .Where(x => !string.IsNullOrWhiteSpace(x))
                    .Select(CleanIngredientForDisplay)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

                var missing = uses
                    .Where(x => !availableSet.Contains(ToComparisonKey(x)))
                    .ToList();

                var low = uses
                    .Where(x => lowSet.Contains(ToComparisonKey(x)))
                    .ToList();

                var safeRecipeUrl = CleanRecipeUrl(ai.RecipeUrl);
                var safeRecipeSource = string.IsNullOrWhiteSpace(ai.RecipeSource)
                    ? ""
                    : ai.RecipeSource.Trim();

                return new Suggestion
                {
                    Name = ai.Name.Trim(),
                    Cuisine = string.IsNullOrWhiteSpace(ai.Cuisine) ? "기타" : ai.Cuisine.Trim(),
                    Uses = uses,
                    MissingIngredients = missing,
                    LowStockIngredients = low,
                    CanMakeNow = missing.Count == 0,
                    RecipeUrl = safeRecipeUrl,
                    RecipeSource = safeRecipeSource
                };
            })
            .Where(x => !string.IsNullOrWhiteSpace(x.RecipeUrl))
            .GroupBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .OrderByDescending(x => x.CanMakeNow)
            .ThenBy(x => x.MissingIngredients.Count)
            .ThenBy(x => x.Name)
            .ToList();
    }

    private static List<Suggestion> BuildFallbackSuggestions(
        List<string> availablePantry,
        List<string> lowStockIngredients)
    {
        var availableSet = new HashSet<string>(
            availablePantry
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(ToComparisonKey),
            StringComparer.OrdinalIgnoreCase);

        var lowSet = new HashSet<string>(
            lowStockIngredients
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(ToComparisonKey),
            StringComparer.OrdinalIgnoreCase);

        var ideas = new List<Suggestion>
        {
            new()
            {
                Name = "김치볶음밥",
                Cuisine = "한식",
                Uses = ["밥", "김치", "계란", "양파"],
                RecipeUrl = "",
                RecipeSource = ""
            },
            new()
            {
                Name = "계란간장밥",
                Cuisine = "한식",
                Uses = ["밥", "계란", "간장", "참기름"],
                RecipeUrl = "",
                RecipeSource = ""
            },
            new()
            {
                Name = "양파간장볶음",
                Cuisine = "한식",
                Uses = ["양파", "간장"],
                RecipeUrl = "",
                RecipeSource = ""
            },
            new()
            {
                Name = "김치볶음",
                Cuisine = "한식",
                Uses = ["김치", "양파", "간장"],
                RecipeUrl = "",
                RecipeSource = ""
            },
            new()
            {
                Name = "돼지고기 양파볶음",
                Cuisine = "한식",
                Uses = ["돼지고기", "양파", "간장"],
                RecipeUrl = "",
                RecipeSource = ""
            }
        };

        foreach (var idea in ideas)
        {
            idea.Uses = idea.Uses
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(CleanIngredientForDisplay)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            idea.MissingIngredients = idea.Uses
                .Where(x => !availableSet.Contains(ToComparisonKey(x)))
                .ToList();

            idea.LowStockIngredients = idea.Uses
                .Where(x => lowSet.Contains(ToComparisonKey(x)))
                .ToList();

            idea.CanMakeNow = idea.MissingIngredients.Count == 0;
        }

        return ideas
            .OrderByDescending(x => x.CanMakeNow)
            .ThenBy(x => x.MissingIngredients.Count)
            .ThenBy(x => x.Name)
            .ToList();
    }

    private static string CleanRecipeUrl(string? value)
    {
        var url = (value ?? string.Empty).Trim();

        if (string.IsNullOrWhiteSpace(url))
        {
            return string.Empty;
        }

        if (!Uri.TryCreate(url, UriKind.Absolute, out var parsed))
        {
            return string.Empty;
        }

        if (parsed.Scheme != Uri.UriSchemeHttp && parsed.Scheme != Uri.UriSchemeHttps)
        {
            return string.Empty;
        }

        return parsed.ToString();
    }

    private static bool ContainsEnglishLetters(string value)
    {
        return !string.IsNullOrWhiteSpace(value)
            && value.Any(c => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'));
    }

    private static string CleanIngredientForDisplay(string value)
    {
        return (value ?? string.Empty).Trim();
    }

    private static string ToComparisonKey(string value)
    {
        return (value ?? string.Empty)
            .Trim()
            .Replace(" ", string.Empty)
            .ToLowerInvariant();
    }
}