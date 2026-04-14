using System.Net;
using System.Text.Json;
using DinnerSuggestionApi.Models;
using DinnerSuggestionApi.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace DinnerSuggestionApi.Functions;

public class RecipesFunction
{
    private readonly RecipeService _recipeService;

    public RecipesFunction(RecipeService recipeService)
    {
        _recipeService = recipeService;
    }

    [Function("GetRecipes")]
    public async Task<HttpResponseData> GetRecipes(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "meals")] HttpRequestData req)
    {
        var items = await _recipeService.GetAllAsync();
        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(items);
        return response;
    }

    [Function("CreateRecipe")]
    public async Task<HttpResponseData> CreateRecipe(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "meals")] HttpRequestData req)
    {
        var recipe = await JsonSerializer.DeserializeAsync<Recipe>(
            req.Body,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (recipe is null || string.IsNullOrWhiteSpace(recipe.Name))
        {
            var bad = req.CreateResponse(HttpStatusCode.BadRequest);
            await bad.WriteStringAsync("name is required");
            return bad;
        }

        recipe.Name = recipe.Name.Trim();
        recipe.Ingredients = recipe.Ingredients
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        recipe.Tags = recipe.Tags
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim())
            .ToList();
        recipe.Difficulty = NormalizeDifficulty(recipe.Difficulty);

        // Check for duplicate recipe name
        var existing = await _recipeService.GetAllAsync();
        if (existing.Any(e => string.Equals(e.Name.Trim(), recipe.Name, StringComparison.OrdinalIgnoreCase)))
        {
            var conflict = req.CreateResponse(HttpStatusCode.Conflict);
            await conflict.WriteStringAsync($"'{recipe.Name}' 레시피가 이미 등록되어 있습니다.");
            return conflict;
        }

        var created = await _recipeService.AddAsync(recipe);

        var response = req.CreateResponse(HttpStatusCode.Created);
        await response.WriteAsJsonAsync(created);
        return response;
    }

    [Function("UpdateRecipe")]
    public async Task<HttpResponseData> UpdateRecipe(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "meals/{id}")] HttpRequestData req,
        string id)
    {
        var recipe = await JsonSerializer.DeserializeAsync<Recipe>(
            req.Body,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (recipe is null || string.IsNullOrWhiteSpace(recipe.Name))
        {
            var bad = req.CreateResponse(HttpStatusCode.BadRequest);
            await bad.WriteStringAsync("name is required");
            return bad;
        }

        recipe.Name = recipe.Name.Trim();
        recipe.Ingredients = recipe.Ingredients
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        recipe.Tags = recipe.Tags
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim())
            .ToList();
        recipe.Difficulty = NormalizeDifficulty(recipe.Difficulty);

        var updated = await _recipeService.UpdateAsync(id, recipe);

        if (updated is null)
        {
            var notFound = req.CreateResponse(HttpStatusCode.NotFound);
            await notFound.WriteStringAsync("Recipe not found.");
            return notFound;
        }

        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(updated);
        return response;
    }

    [Function("DeleteRecipe")]
    public async Task<HttpResponseData> DeleteRecipe(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "meals/{id}")] HttpRequestData req,
        string id)
    {
        var deleted = await _recipeService.DeleteAsync(id);

        if (!deleted)
        {
            var notFound = req.CreateResponse(HttpStatusCode.NotFound);
            await notFound.WriteStringAsync("Recipe not found.");
            return notFound;
        }

        return req.CreateResponse(HttpStatusCode.NoContent);
    }

    private static string NormalizeDifficulty(string? value)
    {
        var raw = (value ?? string.Empty).Trim();
        return raw switch
        {
            "쉬움" => "쉬움",
            "보통" => "보통",
            "어려움" => "어려움",
            _ => "보통"
        };
    }
}
