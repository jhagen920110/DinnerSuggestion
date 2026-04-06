using System.Net;
using System.Text.Json;
using DinnerSuggestionApi.Models;
using DinnerSuggestionApi.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace DinnerSuggestionApi.Functions;

public class IngredientsFunctions
{
    private readonly PantryStore _pantryStore;

    public IngredientsFunctions(PantryStore pantryStore)
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

    [Function("AddIngredient")]
    public async Task<HttpResponseData> AddIngredient(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "ingredients")] HttpRequestData req)
    {
        var request = await JsonSerializer.DeserializeAsync<Ingredient>(req.Body, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        if (request is null || string.IsNullOrWhiteSpace(request.Name))
        {
            var badResponse = req.CreateResponse(HttpStatusCode.BadRequest);
            await badResponse.WriteStringAsync("Ingredient name is required.");
            return badResponse;
        }

        var added = await _pantryStore.AddAsync(new Ingredient
        {
            Name = request.Name,
            StockLevel = request.StockLevel
        });

        var response = req.CreateResponse(HttpStatusCode.Created);
        await response.WriteAsJsonAsync(added);
        return response;
    }

    [Function("UpdateIngredient")]
    public async Task<HttpResponseData> UpdateIngredient(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "ingredients/{id}")] HttpRequestData req,
        string id)
    {
        var request = await JsonSerializer.DeserializeAsync<Ingredient>(req.Body, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        if (request is null || string.IsNullOrWhiteSpace(request.Name))
        {
            var badResponse = req.CreateResponse(HttpStatusCode.BadRequest);
            await badResponse.WriteStringAsync("Ingredient name is required.");
            return badResponse;
        }

        var updated = await _pantryStore.UpdateAsync(id, request);

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
}