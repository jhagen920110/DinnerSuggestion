using System.Net;
using System.Text.Json;
using DinnerSuggestionApi.Models;
using DinnerSuggestionApi.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace DinnerSuggestionApi.Functions;

public class TagsFunction
{
    private readonly TagService _tagService;

    public TagsFunction(TagService tagService)
    {
        _tagService = tagService;
    }

    [Function("GetTags")]
    public async Task<HttpResponseData> GetTags(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "tags")] HttpRequestData req)
    {
        var items = await _tagService.GetAllAsync();
        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(items);
        return response;
    }

    [Function("CreateTag")]
    public async Task<HttpResponseData> CreateTag(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "tags")] HttpRequestData req)
    {
        var tag = await JsonSerializer.DeserializeAsync<Tag>(
            req.Body,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (tag is null || string.IsNullOrWhiteSpace(tag.Name))
        {
            var bad = req.CreateResponse(HttpStatusCode.BadRequest);
            await bad.WriteStringAsync("name is required");
            return bad;
        }

        // Check for duplicate
        var existing = await _tagService.GetAllAsync();
        if (existing.Any(t => string.Equals(t.Name.Trim(), tag.Name.Trim(), StringComparison.OrdinalIgnoreCase)))
        {
            var conflict = req.CreateResponse(HttpStatusCode.Conflict);
            await conflict.WriteStringAsync($"'{tag.Name}' 태그가 이미 있습니다.");
            return conflict;
        }

        var created = await _tagService.AddAsync(tag);
        var response = req.CreateResponse(HttpStatusCode.Created);
        await response.WriteAsJsonAsync(created);
        return response;
    }

    [Function("DeleteTag")]
    public async Task<HttpResponseData> DeleteTag(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "tags/{id}")] HttpRequestData req,
        string id)
    {
        var deleted = await _tagService.DeleteAsync(id);
        return req.CreateResponse(deleted ? HttpStatusCode.NoContent : HttpStatusCode.NotFound);
    }
}
