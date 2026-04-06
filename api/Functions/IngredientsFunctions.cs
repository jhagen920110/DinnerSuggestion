using System.Net;
using System.Text.Json;
using DinnerSuggestionApi.Models;
using DinnerSuggestionApi.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace DinnerSuggestionApi.Functions;

public class IngredientsFunction
{
    private readonly PantryStore _pantryStore;

    private static readonly Dictionary<string, string[]> IngredientTypeKeywords = new(StringComparer.OrdinalIgnoreCase)
    {
        ["vegetable"] =
        [
            "onion", "green onion", "scallion", "garlic", "ginger", "potato", "sweet potato",
            "carrot", "cucumber", "zucchini", "broccoli", "cabbage", "lettuce", "spinach",
            "pepper", "paprika", "tomato", "mushroom", "corn", "radish",
            "양파", "대파", "쪽파", "마늘", "생강", "감자", "고구마", "당근", "오이", "호박",
            "애호박", "브로콜리", "양배추", "배추", "상추", "시금치", "고추", "파프리카",
            "토마토", "버섯", "옥수수", "무", "콩나물", "숙주", "깻잎", "부추"
        ],
        ["carb"] =
        [
            "rice", "bread", "pasta", "noodle", "ramen", "udon", "tortilla", "oats", "cereal",
            "떡", "쌀", "밥", "식빵", "빵", "파스타", "국수", "소면", "라면", "우동", "또띠아",
            "오트밀", "시리얼", "당면", "떡국떡", "떡볶이떡"
        ],
        ["protein"] =
        [
            "egg", "chicken", "beef", "pork", "ham", "bacon", "sausage", "tuna", "salmon",
            "shrimp", "tofu", "bean", "lentil",
            "계란", "달걀", "닭", "닭가슴살", "소고기", "돼지고기", "삼겹살", "목살", "햄",
            "베이컨", "소시지", "참치", "연어", "새우", "두부", "순두부", "콩", "병아리콩"
        ],
        ["dairy"] =
        [
            "milk", "cheese", "butter", "cream", "yogurt",
            "우유", "치즈", "버터", "생크림", "휘핑크림", "요거트", "요구르트"
        ],
        ["fruit"] =
        [
            "apple", "banana", "grape", "strawberry", "blueberry", "lemon", "orange", "pear",
            "mango", "pineapple", "avocado", "kiwi",
            "사과", "바나나", "포도", "딸기", "블루베리", "레몬", "오렌지", "배", "망고",
            "파인애플", "아보카도", "키위", "귤", "복숭아"
        ],
        ["sauce"] =
        [
            "salt", "pepper", "sugar", "soy sauce", "gochujang", "doenjang", "vinegar",
            "sesame oil", "olive oil", "mayo", "mayonnaise", "ketchup", "mustard", "oyster sauce",
            "hot sauce", "pasta sauce", "curry", "stock",
            "소금", "후추", "설탕", "간장", "고추장", "된장", "식초", "참기름", "들기름",
            "올리브오일", "마요네즈", "케첩", "머스타드", "굴소스", "핫소스", "토마토소스",
            "파스타소스", "카레", "다시다", "치킨스톡", "액젓", "쌈장", "맛술"
        ],
        ["frozen"] =
        [
            "frozen dumpling", "frozen pizza", "frozen rice", "frozen shrimp", "ice cream",
            "냉동만두", "냉동피자", "냉동볶음밥", "냉동새우", "냉동치킨", "냉동감자", "아이스크림"
        ]
    };

    public IngredientsFunction(PantryStore pantryStore)
    {
        _pantryStore = pantryStore;
    }

    [Function("GetIngredients")]
    public async Task<HttpResponseData> GetIngredients(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "ingredients")] HttpRequestData req)
    {
        var items = await _pantryStore.GetAllAsync();
        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(items);
        return response;
    }

    [Function("CreateIngredient")]
    public async Task<HttpResponseData> CreateIngredient(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "ingredients")] HttpRequestData req)
    {
        var ingredient = await JsonSerializer.DeserializeAsync<Ingredient>(
            req.Body,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (ingredient is null || string.IsNullOrWhiteSpace(ingredient.Name))
        {
            var bad = req.CreateResponse(HttpStatusCode.BadRequest);
            await bad.WriteStringAsync("name is required");
            return bad;
        }

        ingredient.StockLevel = NormalizeStockLevel(ingredient.StockLevel);
        ingredient.Type = NormalizeType(ingredient.Type);

        var created = await _pantryStore.AddAsync(ingredient);

        var response = req.CreateResponse(HttpStatusCode.Created);
        await response.WriteAsJsonAsync(created);
        return response;
    }

    [Function("UpdateIngredient")]
    public async Task<HttpResponseData> UpdateIngredient(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "ingredients/{id}")] HttpRequestData req,
        string id)
    {
        var ingredient = await JsonSerializer.DeserializeAsync<Ingredient>(
            req.Body,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (ingredient is null || string.IsNullOrWhiteSpace(ingredient.Name))
        {
            var bad = req.CreateResponse(HttpStatusCode.BadRequest);
            await bad.WriteStringAsync("name is required");
            return bad;
        }

        ingredient.StockLevel = NormalizeStockLevel(ingredient.StockLevel);
        ingredient.Type = NormalizeType(ingredient.Type);

        var updated = await _pantryStore.UpdateAsync(id, ingredient);

        if (updated is null)
        {
            var notFound = req.CreateResponse(HttpStatusCode.NotFound);
            await notFound.WriteStringAsync("Ingredient not found.");
            return notFound;
        }

        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(updated);
        return response;
    }

    [Function("DeleteIngredient")]
    public async Task<HttpResponseData> DeleteIngredient(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "ingredients/{id}")] HttpRequestData req,
        string id)
    {
        var deleted = await _pantryStore.DeleteAsync(id);

        if (!deleted)
        {
            var notFound = req.CreateResponse(HttpStatusCode.NotFound);
            await notFound.WriteStringAsync("Ingredient not found.");
            return notFound;
        }

        return req.CreateResponse(HttpStatusCode.NoContent);
    }

    [Function("ClassifyIngredientType")]
    public async Task<HttpResponseData> ClassifyIngredientType(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "ingredients/classify-type")] HttpRequestData req)
    {
        var payload = await JsonSerializer.DeserializeAsync<ClassifyIngredientTypeRequest>(
            req.Body,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        var name = payload?.Name?.Trim() ?? string.Empty;
        var type = DetectIngredientType(name);

        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(new ClassifyIngredientTypeResponse
        {
            Type = type
        });

        return response;
    }

    private static string NormalizeStockLevel(string? value)
    {
        var raw = (value ?? string.Empty).Trim().ToLowerInvariant();

        return raw switch
        {
            "plenty" => "Plenty",
            "some" => "Some",
            "low" => "Low",
            "out" => "Out",
            _ => "Some"
        };
    }

    private static string NormalizeType(string? value)
    {
        var raw = (value ?? string.Empty).Trim().ToLowerInvariant();

        return raw switch
        {
            "vegetable" => "vegetable",
            "carb" => "carb",
            "protein" => "protein",
            "dairy" => "dairy",
            "fruit" => "fruit",
            "sauce" => "sauce",
            "frozen" => "frozen",
            _ => "other"
        };
    }

    private static string DetectIngredientType(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return "other";

        var normalized = name.Trim().ToLowerInvariant();

        foreach (var pair in IngredientTypeKeywords)
        {
            foreach (var keyword in pair.Value)
            {
                var k = keyword.ToLowerInvariant();

                if (normalized == k || normalized.Contains(k) || k.Contains(normalized))
                    return pair.Key;
            }
        }

        if (normalized.Contains("버섯") || normalized.Contains("파") || normalized.Contains("배추"))
            return "vegetable";

        if (normalized.Contains("닭") || normalized.Contains("돼지") || normalized.Contains("소고기") || normalized.Contains("계란") || normalized.Contains("두부"))
            return "protein";

        if (normalized.Contains("소스") || normalized.Contains("오일") || normalized.Contains("가루"))
            return "sauce";

        return "other";
    }

    private sealed class ClassifyIngredientTypeRequest
    {
        public string? Name { get; set; }
    }

    private sealed class ClassifyIngredientTypeResponse
    {
        public string Type { get; set; } = "other";
    }
}