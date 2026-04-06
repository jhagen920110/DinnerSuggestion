using System.Net;
using System.Text.Json;
using DinnerSuggestionApi.Models;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace DinnerSuggestionApi.Functions;

public class IngredientsFunction
{
    [Function("GetIngredients")]
    public async Task<HttpResponseData> GetIngredients(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "ingredients")] HttpRequestData req)
    {
        throw new NotImplementedException();
    }

    [Function("CreateIngredient")]
    public async Task<HttpResponseData> CreateIngredient(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "ingredients")] HttpRequestData req)
    {
        var ingredient = await JsonSerializer.DeserializeAsync<Ingredient>(req.Body, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        if (ingredient is null || string.IsNullOrWhiteSpace(ingredient.Name))
        {
            var bad = req.CreateResponse(HttpStatusCode.BadRequest);
            await bad.WriteStringAsync("name is required");
            return bad;
        }

        ingredient.Id ??= Guid.NewGuid().ToString();
        ingredient.StockLevel = NormalizeStockLevel(ingredient.StockLevel);
        ingredient.Type = NormalizeType(ingredient.Type);

        // await _ingredientService.CreateAsync(ingredient);

        var response = req.CreateResponse(HttpStatusCode.Created);
        await response.WriteAsJsonAsync(ingredient);
        return response;
    }

    [Function("UpdateIngredient")]
    public async Task<HttpResponseData> UpdateIngredient(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "ingredients/{id}")] HttpRequestData req,
        string id)
    {
        var ingredient = await JsonSerializer.DeserializeAsync<Ingredient>(req.Body, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        if (ingredient is null || string.IsNullOrWhiteSpace(ingredient.Name))
        {
            var bad = req.CreateResponse(HttpStatusCode.BadRequest);
            await bad.WriteStringAsync("name is required");
            return bad;
        }

        ingredient.Id = id;
        ingredient.StockLevel = NormalizeStockLevel(ingredient.StockLevel);
        ingredient.Type = NormalizeType(ingredient.Type);

        // await _ingredientService.UpdateAsync(id, ingredient);

        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(ingredient);
        return response;
    }

    private static string NormalizeStockLevel(string? value)
    {
        return value switch
        {
            "많음" => "많음",
            "적음" => "적음",
            "없음" => "없음",
            _ => "보통"
        };
    }

    private static string NormalizeType(string? value)
    {
        return value switch
        {
            "야채" => "야채",
            "탄수화물" => "탄수화물",
            "고기/단백질" => "고기/단백질",
            "유제품" => "유제품",
            "과일" => "과일",
            "소스/조미료" => "소스/조미료",
            "냉동식품" => "냉동식품",
            _ => "기타"
        };
    }
}