using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using DinnerSuggestionApi.Models;
using Microsoft.Extensions.Options;

namespace DinnerSuggestionApi.Services;

public class IngredientTypeClassifierService : IIngredientTypeClassifier
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

    public IngredientTypeClassifierService(
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
You classify one ingredient into exactly one pantry category.

Allowed categories:
- 야채
- 탄수화물
- 고기/단백질
- 유제품
- 과일
- 소스/조미료
- 냉동식품
- 기타

Rules:
- Return exactly one category name from the allowed list.
- Do not explain.
- If the item is mainly a sauce, seasoning, paste, powder, oil, dressing, broth base, or condiment, choose 소스/조미료.
- Focus on the ingredient's most common real kitchen usage.
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
}