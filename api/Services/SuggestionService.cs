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

    public async Task<(string Message, List<AiQuestion> Questions)> GetQuestionsAsync(
        List<string> availablePantry,
        List<string>? recentMeals = null)
    {
        if (!IsAiConfigured())
        {
            return ("오늘 저녁 뭐 드실지 골라볼까요?", GetFallbackQuestions());
        }

        try
        {
            var endpoint = _openAiOptions.Endpoint.TrimEnd('/');
            var url = $"{endpoint}/openai/v1/chat/completions";

            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Headers.Add("api-key", _openAiOptions.ApiKey);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            var season = GetCurrentSeason();
            var userPrompt = RecipeSuggestionPrompts.BuildQuestionUserPrompt(
                availablePantry, recentMeals, season);

            // Add randomization hint so the model picks different categories each time
            var randomSeed = Random.Shared.Next(1, 1001);
            var categoryPool = new[] { "cuisine", "style", "mood", "ingredient", "seasonal", "adventure", "effort", "spice" };
            var shuffled = categoryPool.OrderBy(_ => Random.Shared.Next()).ToArray();
            var questionCount = Random.Shared.Next(2, 4); // 2 or 3
            var suggestedCategories = string.Join(", ", shuffled.Take(questionCount));
            userPrompt += $"\n\n(Randomization seed: {randomSeed}. 이번에는 질문 {questionCount}개를 만들고, 다음 카테고리 조합을 사용해주세요: {suggestedCategories}. 질문 문구와 옵션도 매번 다르게 써주세요.)";

            var payload = new
            {
                model = _openAiOptions.DeploymentName,
                messages = new object[]
                {
                    new { role = "system", content = RecipeSuggestionPrompts.QuestionSystemPrompt },
                    new { role = "user", content = userPrompt }
                },
                max_completion_tokens = 500,
                temperature = 1.3,
                top_p = 0.95,
                response_format = new
                {
                    type = "json_schema",
                    json_schema = new
                    {
                        name = "dinner_questions",
                        strict = true,
                        schema = new
                        {
                            type = "object",
                            properties = new
                            {
                                message = new { type = "string" },
                                questions = new
                                {
                                    type = "array",
                                    items = new
                                    {
                                        type = "object",
                                        properties = new
                                        {
                                            category = new
                                            {
                                                type = "string",
                                                @enum = new[] { "cuisine", "style", "mood", "ingredient", "seasonal", "adventure", "effort", "spice" }
                                            },
                                            text = new { type = "string" },
                                            options = new
                                            {
                                                type = "array",
                                                items = new { type = "string" }
                                            }
                                        },
                                        required = new[] { "category", "text", "options" },
                                        additionalProperties = false
                                    }
                                }
                            },
                            required = new[] { "message", "questions" },
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
                return ("오늘 저녁 뭐 드실지 골라볼까요?", GetFallbackQuestions());

            var structured = JsonSerializer.Deserialize<AiQuestionResponse>(
                content,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            return (
                structured?.Message ?? "오늘 저녁 뭐 드실지 골라볼까요?",
                structured?.Questions ?? GetFallbackQuestions()
            );
        }
        catch
        {
            return ("오늘 저녁 뭐 드실지 골라볼까요?", GetFallbackQuestions());
        }
    }

    private static List<AiQuestion> GetFallbackQuestions()
    {
        return new List<AiQuestion>
        {
            new()
            {
                Category = "cuisine",
                Text = "어떤 종류의 음식이 끌리세요?",
                Options = ["한식", "양식", "중식", "아무거나 좋아요"]
            },
            new()
            {
                Category = "style",
                Text = "어떤 스타일의 요리가 좋을까요?",
                Options = ["국물 요리", "볶음/구이", "면 종류", "상관없어요"]
            }
        };
    }

    private static string GetCurrentSeason()
    {
        var month = DateTime.UtcNow.Month;
        return month switch
        {
            >= 3 and <= 4 => "봄 (Spring) - 따뜻한 날씨",
            >= 5 and <= 9 => "여름 (Summer) - 매우 덥고 습한 날씨",
            >= 10 and <= 11 => "가을 (Fall) - 선선한 날씨",
            _ => "겨울 (Winter) - 온화하지만 가끔 추운 날씨"
        };
    }

    public async Task<(string Message, List<Suggestion> Suggestions)> GetSuggestionsAsync(
        List<string> availablePantry,
        List<string> mustInclude,
        List<string> exclude,
        List<string>? recentMeals = null,
        List<string>? knownRecipes = null,
        List<string>? savedSuggestionNames = null,
        List<KeyValuePair<string, string>>? preferences = null)
    {
        if (!IsAiConfigured())
        {
            return ("", BuildFallbackSuggestions(availablePantry));
        }

        try
        {
            var (message, aiSuggestions) = await GetAiSuggestionsAsync(
                availablePantry,
                mustInclude,
                exclude,
                recentMeals,
                knownRecipes,
                savedSuggestionNames,
                preferences);

            var mapped = MapSuggestions(aiSuggestions, availablePantry);

            // Server-side enforcement: remove suggestions that don't use any must-include ingredient
            if (mustInclude.Count > 0)
            {
                var mustIncludeKeys = new HashSet<string>(
                    mustInclude.Select(ToComparisonKey),
                    StringComparer.OrdinalIgnoreCase);

                mapped = mapped
                    .Where(s => s.Uses.Any(u => mustIncludeKeys.Contains(ToComparisonKey(u))))
                    .ToList();
            }

            return mapped.Count > 0
                ? (message, mapped)
                : (message, BuildFallbackSuggestions(availablePantry));
        }
        catch
        {
            return ("", BuildFallbackSuggestions(availablePantry));
        }
    }

    private bool IsAiConfigured()
    {
        return !string.IsNullOrWhiteSpace(_openAiOptions.Endpoint)
            && !string.IsNullOrWhiteSpace(_openAiOptions.ApiKey)
            && !string.IsNullOrWhiteSpace(_openAiOptions.DeploymentName);
    }

    private async Task<(string Message, List<AiRecipeSuggestion> Suggestions)> GetAiSuggestionsAsync(
        List<string> availablePantry,
        List<string> mustInclude,
        List<string> exclude,
        List<string>? recentMeals,
        List<string>? knownRecipes,
        List<string>? savedSuggestionNames,
        List<KeyValuePair<string, string>>? preferences = null)
    {
        var endpoint = _openAiOptions.Endpoint.TrimEnd('/');
        var url = $"{endpoint}/openai/v1/chat/completions";

        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.Add("api-key", _openAiOptions.ApiKey);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        var systemPrompt = RecipeSuggestionPrompts.SystemPrompt;
        var season = GetCurrentSeason();

        var userPrompt = RecipeSuggestionPrompts.BuildUserPrompt(
            availablePantry,
            mustInclude,
            exclude,
            recentMeals,
            knownRecipes,
            season,
            savedSuggestionNames);

        // Append user preferences from question flow
        userPrompt += RecipeSuggestionPrompts.BuildPreferencesSection(preferences);

        var temp = exclude.Count > 0 ? 0.8 : mustInclude.Count > 0 ? 0.2 : 0.5;

        var payload = new
        {
            model = _openAiOptions.DeploymentName,
            messages = new object[]
            {
                new { role = "system", content = systemPrompt },
                new { role = "user", content = userPrompt }
            },
            max_completion_tokens = 1500,
            temperature = temp,
            response_format = new
            {
                type = "json_schema",
                json_schema = new
                {
                    name = "recipe_suggestions",
                    strict = true,
                    schema = new
                    {
                        type = "object",
                        properties = new
                        {
                            message = new { type = "string" },
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
                                        recipeSearchQuery = new { type = "string" },
                                        difficulty = new
                                        {
                                            type = "string",
                                            @enum = new[] { "쉬움", "보통", "어려움" }
                                        },
                                        cookTime = new { type = "string" }
                                    },
                                    required = new[]
                                    {
                                        "name",
                                        "cuisine",
                                        "uses",
                                        "recipeSearchQuery",
                                        "difficulty",
                                        "cookTime"
                                    },
                                    additionalProperties = false
                                }
                            }
                        },
                        required = new[] { "message", "suggestions" },
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
            return ("", new List<AiRecipeSuggestion>());
        }

        var structured = JsonSerializer.Deserialize<AiRecipeResponse>(
            content,
            new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

        return (structured?.Message ?? "", structured?.Suggestions ?? new List<AiRecipeSuggestion>());
    }

    private static List<Suggestion> MapSuggestions(
        List<AiRecipeSuggestion> aiSuggestions,
        List<string> availablePantry)
    {
        var availableSet = new HashSet<string>(
            availablePantry
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

                var recipeQuery = string.IsNullOrWhiteSpace(ai.RecipeSearchQuery)
                    ? ai.Name.Trim()
                    : ai.RecipeSearchQuery.Trim();

                return new Suggestion
                {
                    Name = ai.Name.Trim(),
                    Cuisine = string.IsNullOrWhiteSpace(ai.Cuisine) ? "한식" : ai.Cuisine.Trim(),
                    Uses = uses,
                    MissingIngredients = missing,
                    CanMakeNow = missing.Count == 0,
                    RecipeUrl = Build10000RecipeSearchUrl(recipeQuery),
                    RecipeSource = "만개의레시피",
                    Difficulty = string.IsNullOrWhiteSpace(ai.Difficulty) ? "보통" : ai.Difficulty.Trim(),
                    CookTime = ai.CookTime?.Trim() ?? string.Empty
                };
            })
            .GroupBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .OrderByDescending(x => x.CanMakeNow)
            .ThenBy(x => x.MissingIngredients.Count)
            .ThenBy(x => x.Name)
            .ToList();
    }

    private static List<Suggestion> BuildFallbackSuggestions(
        List<string> availablePantry)
    {
        var availableSet = new HashSet<string>(
            availablePantry
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(ToComparisonKey),
            StringComparer.OrdinalIgnoreCase);

        var ideas = new List<Suggestion>
        {
            new()
            {
                Name = "김치볶음밥",
                Cuisine = "한식",
                Uses = ["김치", "밥", "양파", "대파", "간장", "참기름"],
                RecipeUrl = Build10000RecipeSearchUrl("김치볶음밥"),
                RecipeSource = "만개의레시피"
            },
            new()
            {
                Name = "계란간장밥",
                Cuisine = "한식",
                Uses = ["밥", "계란", "간장", "참기름"],
                RecipeUrl = Build10000RecipeSearchUrl("계란간장밥"),
                RecipeSource = "만개의레시피"
            },
            new()
            {
                Name = "된장찌개",
                Cuisine = "한식",
                Uses = ["된장", "두부", "양파", "대파"],
                RecipeUrl = Build10000RecipeSearchUrl("된장찌개"),
                RecipeSource = "만개의레시피"
            },
            new()
            {
                Name = "김치찌개",
                Cuisine = "한식",
                Uses = ["김치", "돼지고기", "두부", "양파", "대파"],
                RecipeUrl = Build10000RecipeSearchUrl("김치찌개"),
                RecipeSource = "만개의레시피"
            },
            new()
            {
                Name = "제육볶음",
                Cuisine = "한식",
                Uses = ["돼지고기", "양파", "고추장", "간장", "다진마늘"],
                RecipeUrl = Build10000RecipeSearchUrl("제육볶음"),
                RecipeSource = "만개의레시피"
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

            idea.CanMakeNow = idea.MissingIngredients.Count == 0;
        }

        return ideas
            .OrderByDescending(x => x.CanMakeNow)
            .ThenBy(x => x.MissingIngredients.Count)
            .ThenBy(x => x.Name)
            .ToList();
    }

    private static string Build10000RecipeSearchUrl(string query)
    {
        var encoded = Uri.EscapeDataString(query ?? string.Empty);
        return $"https://www.10000recipe.com/recipe/list.html?q={encoded}";
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