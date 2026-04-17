using System.Net;
using DinnerSuggestionApi.Models;
using DinnerSuggestionApi.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace DinnerSuggestionApi.Functions;

public class MealLogFunction
{
    private readonly MealLogService _service;
    private readonly ILogger<MealLogFunction> _logger;

    public MealLogFunction(MealLogService service, ILogger<MealLogFunction> logger)
    {
        _service = service;
        _logger = logger;
    }

    [Function("GetMealLogs")]
    public async Task<HttpResponseData> GetMealLogs(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "meal-logs")] HttpRequestData req)
    {
        var startDate = req.Query["startDate"] ?? DateTime.UtcNow.ToString("yyyy-MM-dd");
        var endDate = req.Query["endDate"] ?? startDate;

        var logs = await _service.GetByDateRangeAsync(startDate, endDate);

        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(logs);
        return response;
    }

    [Function("CreateMealLog")]
    public async Task<HttpResponseData> CreateMealLog(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "meal-logs")] HttpRequestData req)
    {
        var log = await req.ReadFromJsonAsync<MealLog>();
        if (log == null || string.IsNullOrWhiteSpace(log.Name) || string.IsNullOrWhiteSpace(log.Date))
        {
            var bad = req.CreateResponse(HttpStatusCode.BadRequest);
            await bad.WriteStringAsync("name and date are required.");
            return bad;
        }

        var created = await _service.AddAsync(log);

        var response = req.CreateResponse(HttpStatusCode.Created);
        await response.WriteAsJsonAsync(created);
        return response;
    }

    [Function("UpdateMealLog")]
    public async Task<HttpResponseData> UpdateMealLog(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "meal-logs/{id}")] HttpRequestData req,
        string id)
    {
        var updated = await req.ReadFromJsonAsync<MealLog>();
        if (updated == null)
        {
            var bad = req.CreateResponse(HttpStatusCode.BadRequest);
            return bad;
        }

        var result = await _service.UpdateAsync(id, updated);
        if (result == null)
        {
            return req.CreateResponse(HttpStatusCode.NotFound);
        }

        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(result);
        return response;
    }

    [Function("DeleteMealLog")]
    public async Task<HttpResponseData> DeleteMealLog(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "meal-logs/{id}")] HttpRequestData req,
        string id)
    {
        var deleted = await _service.DeleteAsync(id);
        return req.CreateResponse(deleted ? HttpStatusCode.NoContent : HttpStatusCode.NotFound);
    }

    [Function("GetMealLogStampCount")]
    public async Task<HttpResponseData> GetStampCount(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "stamp-count")] HttpRequestData req)
    {
        var count = await _service.GetTotalStampCountAsync();
        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(new { total = count });
        return response;
    }
}
