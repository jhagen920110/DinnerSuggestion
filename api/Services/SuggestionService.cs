using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using DinnerSuggestionApi.Models;
using Microsoft.Extensions.Options;
using DinnerSuggestionApi.Prompts;

namespace DinnerSuggestionApi.Services;

public class SuggestionService
{
    private readonly HttpClient _httpClient;
    private readonly AzureOpenAiOptions _openAiOptions;

    public SuggestionService(HttpClient httpClient, IOptions<AzureOpenAiOptions> openAiOptions)
    {
        _httpClient = httpClient;
        _openAiOptions = openAiOptions.Value;
    }

    public async Task<List<Suggestion>> GetSuggestionsAsync(
        List<string> availablePantry,
        List<string> lowStockIngredients)
    {
        if (!IsAiConfigured())
        {
            return BuildFallbackSuggestions(availablePantry, lowStockIngredients);
        }

        try
        {
            var aiSuggestions = await GetAiSuggestionsAsync(availablePantry, lowStockIngredients);
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
        List<string> lowStockIngredients)
    {
        var endpoint = _openAiOptions.Endpoint.TrimEnd('/');
        var url = $"{endpoint}/openai/v1/chat/completions";

        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.Add("api-key", _openAiOptions.ApiKey);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        var systemPrompt = MealSuggestionPrompts.SystemPrompt;
        var userPrompt = MealSuggestionPrompts.BuildUserPrompt(availablePantry, lowStockIngredients);

        var payload = new
        {
            model = _openAiOptions.DeploymentName,
            messages = new object[]
            {
                new { role = "system", content = systemPrompt },
                new { role = "user", content = userPrompt }
            },
            max_completion_tokens = 600,
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
                                        }
                                    },
                                    required = new[] { "name", "cuisine", "uses" },
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
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

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
                .Select(NormalizeIngredient),
            StringComparer.OrdinalIgnoreCase);

        var lowSet = new HashSet<string>(
            lowStockIngredients
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(NormalizeIngredient),
            StringComparer.OrdinalIgnoreCase);

        return aiSuggestions
            .Where(x => !string.IsNullOrWhiteSpace(x.Name))
            .Select(ai =>
            {
                var uses = ai.Uses
                    .Where(x => !string.IsNullOrWhiteSpace(x))
                    .Select(NormalizeIngredient)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

                var missing = uses.Where(x => !availableSet.Contains(x)).ToList();
                var low = uses.Where(x => lowSet.Contains(x)).ToList();

                return new Suggestion
                {
                    Name = ai.Name.Trim(),
                    Cuisine = string.IsNullOrWhiteSpace(ai.Cuisine) ? "General" : ai.Cuisine.Trim(),
                    Uses = uses,
                    MissingIngredients = missing,
                    LowStockIngredients = low,
                    CanMakeNow = missing.Count == 0,
                    RecipeUrl = "",
                    RecipeSource = ""
                };
            })
            .GroupBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .OrderByDescending(x => x.CanMakeNow)
            .ThenBy(x => x.MissingIngredients.Count)
            .ThenBy(x => x.Name)
            .ToList();
    }

    private static string NormalizeIngredient(string value)
    {
        return value.Trim().ToLowerInvariant();
    }

    private static List<Suggestion> BuildFallbackSuggestions(
        List<string> availablePantry,
        List<string> lowStockIngredients)
    {
        var ideas = new List<Suggestion>
        {
            new()
            {
                Name = "Kimchi Fried Rice",
                Cuisine = "Korean",
                Uses = ["rice", "kimchi", "egg", "spam", "onion"]
            },
            new()
            {
                Name = "Gyeran Bap",
                Cuisine = "Korean",
                Uses = ["rice", "egg", "soy sauce", "sesame oil"]
            },
            new()
            {
                Name = "Garlic Butter Pasta",
                Cuisine = "Italian",
                Uses = ["pasta", "garlic", "butter"]
            }
        };

        foreach (var idea in ideas)
        {
            idea.MissingIngredients = idea.Uses
                .Where(x => !availablePantry.Contains(x, StringComparer.OrdinalIgnoreCase))
                .ToList();

            idea.LowStockIngredients = idea.Uses
                .Where(x => lowStockIngredients.Contains(x, StringComparer.OrdinalIgnoreCase))
                .ToList();

            idea.CanMakeNow = idea.MissingIngredients.Count == 0;
            idea.RecipeUrl = "";
            idea.RecipeSource = "";
        }

        return ideas
            .OrderByDescending(x => x.CanMakeNow)
            .ThenBy(x => x.MissingIngredients.Count)
            .ThenBy(x => x.Name)
            .ToList();
    }
}