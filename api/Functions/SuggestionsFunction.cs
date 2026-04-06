using System.Net;
using DinnerSuggestionApi.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace DinnerSuggestionApi.Functions;

public class SuggestionsFunction
{
    private readonly PantryStore _pantryStore;
    private readonly SuggestionService _suggestionService;

    public SuggestionsFunction(PantryStore pantryStore, SuggestionService suggestionService)
    {
        _pantryStore = pantryStore;
        _suggestionService = suggestionService;
    }

    [Function("GetSuggestions")]
    public async Task<HttpResponseData> GetSuggestions(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "suggestions")] HttpRequestData req)
    {
        var availablePantry = await _pantryStore.GetAvailableIngredientNamesAsync();
        var lowStockIngredients = await _pantryStore.GetLowStockIngredientNamesAsync();

        var suggestions = _suggestionService.GetSuggestions(availablePantry, lowStockIngredients);

        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(suggestions);
        return response;
    }
}