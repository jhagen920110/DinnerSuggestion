using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using DinnerSuggestionApi.Models;
using Microsoft.Extensions.Options;
using DinnerSuggestionApi.Prompts;
using System.Linq;

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
        return IngredientNameNormalizer.Normalize(value);
    }

    private static List<Suggestion> BuildFallbackSuggestions(
        List<string> availablePantry,
        List<string> lowStockIngredients)
    {
        var availableSet = new HashSet<string>(
            availablePantry
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(IngredientNameNormalizer.Normalize),
            StringComparer.OrdinalIgnoreCase);

        var lowSet = new HashSet<string>(
            lowStockIngredients
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(IngredientNameNormalizer.Normalize),
            StringComparer.OrdinalIgnoreCase);

        var ideas = new List<Suggestion>
        {
            new() { Name = "김치볶음밥", Cuisine = "한식", Uses = ["밥", "김치", "계란", "양파"] },
            new() { Name = "계란간장밥", Cuisine = "한식", Uses = ["밥", "계란", "간장", "참기름"] },
            new() { Name = "양파간장볶음", Cuisine = "한식", Uses = ["양파", "간장"] },
            new() { Name = "김치볶음", Cuisine = "한식", Uses = ["김치", "양파", "간장"] },
            new() { Name = "돼지고기 양파볶음", Cuisine = "한식", Uses = ["돼지고기", "양파", "간장"] }
        };

        foreach (var idea in ideas)
        {
            var normalizedUses = idea.Uses
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(IngredientNameNormalizer.Normalize)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            idea.Uses = normalizedUses;
            idea.MissingIngredients = normalizedUses.Where(x => !availableSet.Contains(x)).ToList();
            idea.LowStockIngredients = normalizedUses.Where(x => lowSet.Contains(x)).ToList();
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

    private static string NormalizeIngredientName(string value)
    {
        var v = (value ?? string.Empty).Trim().ToLowerInvariant();

        return v switch
        {
            "달걀" => "계란",
            "계란" => "계란",
            "양파" => "양파",
            "대파" => "대파",
            "쪽파" => "대파",
            "간장" => "간장",
            "진간장" => "간장",
            "국간장" => "간장",
            "김치" => "김치",
            "참기름" => "참기름",
            "들기름" => "참기름",
            "돼지고기" => "돼지고기",
            "삼겹살" => "돼지고기",
            "목살" => "돼지고기",
            "소고기" => "소고기",
            "닭고기" => "닭고기",
            "닭" => "닭고기",
            "밥" => "밥",
            "쌀밥" => "밥",
            _ => v
        };
    }
}