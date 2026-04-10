using System.Net;
using System.Text.Json;
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
        var mustInclude = new List<string>();

        try
        {
            var body = await JsonSerializer.DeserializeAsync<SuggestionsRequest>(
                req.Body,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (body?.MustInclude is not null)
            {
                mustInclude = body.MustInclude
                    .Where(x => !string.IsNullOrWhiteSpace(x))
                    .Select(x => x.Trim())
                    .ToList();
            }
        }
        catch { /* empty body is fine */ }

        var availablePantry = await _pantryStore.GetAvailableIngredientNamesAsync();
        var lowStockIngredients = await _pantryStore.GetLowStockIngredientNamesAsync();
        var plentyIngredients = await _pantryStore.GetPlentyIngredientNamesAsync();

        var suggestions = await _suggestionService.GetSuggestionsAsync(
            availablePantry,
            lowStockIngredients,
            plentyIngredients,
            mustInclude);

        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(suggestions);
        return response;
    }

    private class SuggestionsRequest
    {
        public List<string>? MustInclude { get; set; }
    }
}