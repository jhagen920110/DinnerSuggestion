using System.Net;
using System.Text.Json;
using DinnerSuggestionApi.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace DinnerSuggestionApi.Functions;

public class ValidateNameFunction
{
    private readonly IngredientClassifierService _classifier;

    public ValidateNameFunction(IngredientClassifierService classifier)
    {
        _classifier = classifier;
    }

    [Function("ValidateName")]
    public async Task<HttpResponseData> ValidateName(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "validate-name")] HttpRequestData req)
    {
        var body = await JsonSerializer.DeserializeAsync<ValidateNameRequest>(
            req.Body,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (body is null || string.IsNullOrWhiteSpace(body.Name))
        {
            var bad = req.CreateResponse(HttpStatusCode.BadRequest);
            await bad.WriteStringAsync("name is required");
            return bad;
        }

        var kind = body.Kind ?? "ingredient";
        var result = await _classifier.ValidateNameAsync(body.Name.Trim(), kind);

        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(new
        {
            valid = result.IsValid,
            suggestion = result.Suggestion
        });
        return response;
    }

    private class ValidateNameRequest
    {
        public string? Name { get; set; }
        public string? Kind { get; set; }
    }
}
