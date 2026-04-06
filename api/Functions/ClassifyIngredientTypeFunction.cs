using System.Net;
using System.Text.Json;
using DinnerSuggestionApi.Helpers;
using DinnerSuggestionApi.Models;
using DinnerSuggestionApi.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace DinnerSuggestionApi.Functions;

public class ClassifyIngredientTypeFunction
{
    private readonly IIngredientTypeClassifier _classifier;

    public ClassifyIngredientTypeFunction(IIngredientTypeClassifier classifier)
    {
        _classifier = classifier;
    }

    [Function("ClassifyIngredientType")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "ingredients/classify-type")] HttpRequestData req)
    {
        var body = await JsonSerializer.DeserializeAsync<IngredientTypeClassificationRequest>(
            req.Body,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        var name = body?.Name?.Trim();

        if (string.IsNullOrWhiteSpace(name))
        {
            var bad = req.CreateResponse(HttpStatusCode.BadRequest);
            await bad.WriteStringAsync("Ingredient name is required.");
            return bad;
        }

        string type;
        string source;

        if (IngredientTypeHelper.TryGetKnownType(name, out var knownType))
        {
            type = knownType;
            source = "predefined";
        }
        else
        {
            var aiType = await _classifier.ClassifyAsync(name);
            type = IngredientTypeHelper.NormalizeType(aiType);
            source = "ai";
        }

        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(new IngredientTypeClassificationResponse
        {
            Name = name,
            Type = type,
            Source = source
        });

        return response;
    }
}