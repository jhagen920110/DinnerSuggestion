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
    private readonly IIngredientTypeClassifier _ingredientTypeClassifier;

    public IngredientsFunction(
        PantryStore pantryStore,
        IIngredientTypeClassifier ingredientTypeClassifier)
    {
        _pantryStore = pantryStore;
        _ingredientTypeClassifier = ingredientTypeClassifier;
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
        ingredient.Name = ingredient.Name.Trim();
        ingredient.Type = await ResolveIngredientTypeForSaveAsync(ingredient.Name, ingredient.Type);

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
        ingredient.Name = ingredient.Name.Trim();
        ingredient.Type = await ResolveIngredientTypeForSaveAsync(ingredient.Name, ingredient.Type);

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
        var type = await _ingredientTypeClassifier.ClassifyAsync(name);

        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(new ClassifyIngredientTypeResponse { Type = type });
        return response;
    }

    private async Task<string> ResolveIngredientTypeAsync(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return "기타";

        return await _ingredientTypeClassifier.ClassifyAsync(name);
    }

    private async Task<string> ResolveIngredientTypeForSaveAsync(string name, string? requestedType)
    {
        var normalizedRequestedType = NormalizeType(requestedType);

        if (!string.IsNullOrWhiteSpace(requestedType))
            return normalizedRequestedType;

        return await ResolveIngredientTypeAsync(name);
    }

    private static string NormalizeType(string? value)
    {
        var raw = (value ?? string.Empty).Trim();

        return raw switch
        {
            "야채" => "야채",
            "탄수화물" => "탄수화물",
            "고기/단백질" => "고기/단백질",
            "유제품" => "유제품",
            "과일" => "과일",
            "소스/조미료" => "소스/조미료",
            "냉동식품" => "냉동식품",
            "기타" => "기타",
            _ => "기타"
        };
    }

    private static string NormalizeStockLevel(string? value)
    {
        var raw = (value ?? string.Empty).Trim().ToLowerInvariant();

        return raw switch
        {
            "plenty" or "많음" => "Plenty",
            "some" or "보통" => "Some",
            "low" or "적음" => "Low",
            "out" or "없음" => "Out",
            _ => "Some"
        };
    }

    private sealed class ClassifyIngredientTypeRequest
    {
        public string? Name { get; set; }
    }

    private sealed class ClassifyIngredientTypeResponse
    {
        public string Type { get; set; } = "기타";
    }
}