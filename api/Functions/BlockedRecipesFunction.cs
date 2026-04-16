using System.Net;
using System.Text.Json;
using DinnerSuggestionApi.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace DinnerSuggestionApi.Functions;

public class BlockedRecipesFunction
{
    private readonly BlockedRecipeService _blockedRecipeService;

    public BlockedRecipesFunction(BlockedRecipeService blockedRecipeService)
    {
        _blockedRecipeService = blockedRecipeService;
    }

    [Function("GetBlockedRecipes")]
    public async Task<HttpResponseData> GetBlockedRecipes(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "blocked-recipes")] HttpRequestData req)
    {
        var items = await _blockedRecipeService.GetAllAsync();
        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(items);
        return response;
    }

    [Function("CreateBlockedRecipe")]
    public async Task<HttpResponseData> CreateBlockedRecipe(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "blocked-recipes")] HttpRequestData req)
    {
        var body = await req.ReadAsStringAsync();
        if (string.IsNullOrWhiteSpace(body))
        {
            var badReq = req.CreateResponse(HttpStatusCode.BadRequest);
            await badReq.WriteStringAsync("Body is required.");
            return badReq;
        }

        var input = JsonSerializer.Deserialize<BlockedRecipeInput>(body,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (input == null || string.IsNullOrWhiteSpace(input.Name))
        {
            var badReq = req.CreateResponse(HttpStatusCode.BadRequest);
            await badReq.WriteStringAsync("Name is required.");
            return badReq;
        }

        // Check for duplicate
        var existing = await _blockedRecipeService.GetAllAsync();
        if (existing.Any(b => string.Equals(b.Name.Trim(), input.Name.Trim(), StringComparison.OrdinalIgnoreCase)))
        {
            var conflict = req.CreateResponse(HttpStatusCode.Conflict);
            await conflict.WriteStringAsync("Already blocked.");
            return conflict;
        }

        var item = await _blockedRecipeService.AddAsync(input.Name);
        var response = req.CreateResponse(HttpStatusCode.Created);
        await response.WriteAsJsonAsync(item);
        return response;
    }

    [Function("DeleteBlockedRecipe")]
    public async Task<HttpResponseData> DeleteBlockedRecipe(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "blocked-recipes/{id}")] HttpRequestData req,
        string id)
    {
        var deleted = await _blockedRecipeService.DeleteAsync(id);
        if (!deleted)
        {
            return req.CreateResponse(HttpStatusCode.NotFound);
        }
        return req.CreateResponse(HttpStatusCode.NoContent);
    }

    private class BlockedRecipeInput
    {
        public string Name { get; set; } = string.Empty;
    }
}
