using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using DinnerSuggestionApi.Models;
using Microsoft.Extensions.Options;

namespace DinnerSuggestionApi.Services;

public class IngredientClassifierService
{
    private static readonly HashSet<string> AllowedTypes =
    [
        "야채",
        "탄수화물",
        "고기/단백질",
        "유제품",
        "과일",
        "소스/조미료",
        "냉동식품",
        "기타"
    ];

    private readonly HttpClient _httpClient;
    private readonly AzureOpenAiOptions _openAiOptions;

    public IngredientClassifierService(
        HttpClient httpClient,
        IOptions<AzureOpenAiOptions> openAiOptions)
    {
        _httpClient = httpClient;
        _openAiOptions = openAiOptions.Value;
    }

    public async Task<string> ClassifyAsync(string ingredientName)
    {
        if (string.IsNullOrWhiteSpace(ingredientName))
            return "기타";

        if (!IsAiConfigured())
            return FallbackTypeRules(ingredientName);

        try
        {
            var endpoint = _openAiOptions.Endpoint.TrimEnd('/');
            var url = $"{endpoint}/openai/v1/chat/completions";

            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Headers.Add("api-key", _openAiOptions.ApiKey);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            var systemPrompt = """
You classify one Korean ingredient into exactly one pantry category.

Allowed categories:
- 야채 (vegetables, roots, tubers, mushrooms, herbs)
- 탄수화물 (rice, noodles, bread, flour, grains, cereals)
- 고기/단백질 (meat, poultry, fish, seafood, tofu)
- 유제품 (dairy AND eggs: milk, cheese, butter, yogurt, eggs)
- 과일 (fruits)
- 소스/조미료 (sauces, seasonings, pastes, powders, oils, vinegar, dressings, broth bases, condiments)
- 냉동식품 (frozen ready-made items: frozen dumplings, frozen pizza, etc.)
- 기타 (anything that doesn't fit above, including seaweed/해조류)

Key classification rules:
- 김치, 깍두기 → 야채 (fermented vegetables are still vegetables, NOT sauces)
- 계란, 달걀, 메추리알 → 유제품 (eggs belong with dairy)
- 미역, 다시마, 김, 해조류 → 기타 (seaweed = 기타)
- 감자, 고구마, 양파, 당근, 무 → 야채 (root vegetables and tubers = vegetable)
- 두부, 어묵, 생선, 새우 → 고기/단백질
- 간장, 된장, 고추장, 참기름, 고춧가루, 소금, 설탕, 식초, 마늘 → 소스/조미료
- 쌀, 국수, 라면(건면), 빵, 밀가루 → 탄수화물

Rules:
- Return exactly one category name from the allowed list.
- Do not explain.
- Focus on how a Korean home cook would organize their pantry.
- If uncertain, choose the most practical pantry category.
""";

            var userPrompt =
                "Ingredient name:\n" + ingredientName.Trim() + "\n\n" +
                "Return exactly one category name from this list only:\n" +
                "야채, 탄수화물, 고기/단백질, 유제품, 과일, 소스/조미료, 냉동식품, 기타";

            var payload = new
            {
                model = _openAiOptions.DeploymentName,
                messages = new object[]
                {
                    new { role = "system", content = systemPrompt },
                    new { role = "user", content = userPrompt }
                },
                max_completion_tokens = 20
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
                .GetString()
                ?.Trim();

            if (!string.IsNullOrWhiteSpace(content) && AllowedTypes.Contains(content))
                return content;

            return FallbackTypeRules(ingredientName);
        }
        catch
        {
            return FallbackTypeRules(ingredientName);
        }
    }

    private bool IsAiConfigured()
    {
        return !string.IsNullOrWhiteSpace(_openAiOptions.Endpoint)
            && !string.IsNullOrWhiteSpace(_openAiOptions.ApiKey)
            && !string.IsNullOrWhiteSpace(_openAiOptions.DeploymentName);
    }

    private static string FallbackTypeRules(string name)
    {
        var n = name.Trim();

        // Exact matches for common ingredients
        var veggies = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "김치", "깍두기", "미역", "다시마", "김", "감자", "고구마", "양파", "당근",
            "무", "대파", "쪽파", "시금치", "배추", "콩나물", "숙주", "부추", "상추",
            "오이", "호박", "애호박", "가지", "피망", "파프리카", "브로콜리", "양배추",
            "깻잎", "고추", "청양고추", "풋고추", "마늘쫑", "셀러리", "팽이버섯",
            "새송이버섯", "표고버섯", "느타리버섯", "버섯", "토마토"
        };
        if (veggies.Contains(n)) return "야채";

        var dairy = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "계란", "달걀", "메추리알", "우유", "버터", "치즈", "요거트", "생크림", "크림치즈"
        };
        if (dairy.Contains(n)) return "유제품";

        var protein = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "두부", "어묵", "소고기", "돼지고기", "닭고기", "삼겹살", "목살", "갈비",
            "새우", "오징어", "참치", "고등어", "연어", "멸치", "조개", "꽃게", "생선",
            "햄", "스팸", "소시지", "베이컨", "닭가슴살"
        };
        if (protein.Contains(n)) return "고기/단백질";

        var carbs = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "쌀", "밥", "국수", "라면", "당면", "빵", "밀가루", "떡", "우동면",
            "파스타", "스파게티", "식빵", "찹쌀", "현미"
        };
        if (carbs.Contains(n)) return "탄수화물";

        // Suffix-based rules
        if (n.EndsWith("소스", StringComparison.OrdinalIgnoreCase) ||
            n.EndsWith("가루", StringComparison.OrdinalIgnoreCase) ||
            n.EndsWith("오일", StringComparison.OrdinalIgnoreCase) ||
            n.EndsWith("드레싱", StringComparison.OrdinalIgnoreCase) ||
            n.EndsWith("장", StringComparison.OrdinalIgnoreCase))
            return "소스/조미료";

        if (n.EndsWith("치즈", StringComparison.OrdinalIgnoreCase) ||
            n.EndsWith("우유", StringComparison.OrdinalIgnoreCase) ||
            n.EndsWith("버터", StringComparison.OrdinalIgnoreCase) ||
            n.EndsWith("요거트", StringComparison.OrdinalIgnoreCase))
            return "유제품";

        return "기타";
    }

    /// <summary>
    /// Uses AI to check if a name is a real ingredient or dish (vs typo/nonsense).
    /// Returns null if valid, or a suggested correction if it looks like a typo.
    /// </summary>
    public async Task<NameValidationResult> ValidateNameAsync(string name, string kind)
    {
        if (string.IsNullOrWhiteSpace(name))
            return new NameValidationResult { IsValid = false, Suggestion = null };

        if (!IsAiConfigured())
            return new NameValidationResult { IsValid = true };

        try
        {
            var endpoint = _openAiOptions.Endpoint.TrimEnd('/');
            var url = $"{endpoint}/openai/v1/chat/completions";

            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Headers.Add("api-key", _openAiOptions.ApiKey);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            var kindLabel = kind == "recipe" ? "요리/음식 이름" : "식재료 이름";

            var systemPrompt = $"""
You validate whether a user-typed name is a real, commonly known {kindLabel} (Korean or international).
- If the name is a real {kindLabel} (even if informal, abbreviated, or brand name), return valid=true.
- If the name is clearly a typo or nonsense, return valid=false and suggest the most likely correction.
- Be lenient: accept brand names (스팸, 초코파이), informal names (계란 for 달걀), slang, and regional variants.
- Only flag things that are genuinely not food items or are obvious misspellings.
Respond in JSON only.
""";

            var payload = new
            {
                model = _openAiOptions.DeploymentName,
                messages = new object[]
                {
                    new { role = "system", content = systemPrompt },
                    new { role = "user", content = $"이름: {name.Trim()}" }
                },
                max_completion_tokens = 80,
                temperature = 0.1,
                response_format = new
                {
                    type = "json_schema",
                    json_schema = new
                    {
                        name = "name_validation",
                        strict = true,
                        schema = new
                        {
                            type = "object",
                            properties = new
                            {
                                valid = new { type = "boolean", description = "true if the name is a real food item" },
                                suggestion = new
                                {
                                    type = new[] { "string", "null" },
                                    description = "Suggested correction if typo, null otherwise"
                                }
                            },
                            required = new[] { "valid", "suggestion" },
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

            if (content is not null)
            {
                var result = JsonSerializer.Deserialize<NameValidationResult>(content,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                if (result is not null) return result;
            }

            return new NameValidationResult { IsValid = true };
        }
        catch
        {
            // If AI fails, don't block the user
            return new NameValidationResult { IsValid = true };
        }
    }
}

public class NameValidationResult
{
    public bool IsValid { get; set; } = true;

    [System.Text.Json.Serialization.JsonPropertyName("valid")]
    public bool Valid { get => IsValid; set => IsValid = value; }

    public string? Suggestion { get; set; }
}