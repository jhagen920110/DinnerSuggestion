using System.Net;
using DinnerSuggestionApi.Middleware;
using DinnerSuggestionApi.Models;
using Microsoft.Azure.Cosmos;

namespace DinnerSuggestionApi.Services;

public class MealLogService
{
    private readonly Container _container;
    private readonly UserContext _userContext;

    public MealLogService(CosmosContainers containers, UserContext userContext)
    {
        _container = containers.MealLogs;
        _userContext = userContext;
    }

    public async Task<List<MealLog>> GetByDateRangeAsync(string startDate, string endDate)
    {
        var query = new QueryDefinition(
            "SELECT * FROM c WHERE c.userId = @userId AND c.date >= @start AND c.date <= @end ORDER BY c.date")
            .WithParameter("@userId", _userContext.UserId)
            .WithParameter("@start", startDate)
            .WithParameter("@end", endDate);

        var iterator = _container.GetItemQueryIterator<MealLog>(query);
        var results = new List<MealLog>();
        while (iterator.HasMoreResults)
        {
            var batch = await iterator.ReadNextAsync();
            results.AddRange(batch);
        }
        return results;
    }

    public async Task<List<MealLog>> GetByDateAsync(string date)
    {
        return await GetByDateRangeAsync(date, date);
    }

    public async Task<MealLog> AddAsync(MealLog log)
    {
        log.UserId = _userContext.UserId;

        // Check for duplicate (same date + name)
        var query = new QueryDefinition(
            "SELECT * FROM c WHERE c.userId = @userId AND c.date = @date AND c.name = @name")
            .WithParameter("@userId", _userContext.UserId)
            .WithParameter("@date", log.Date)
            .WithParameter("@name", log.Name);

        var iterator = _container.GetItemQueryIterator<MealLog>(query);
        if (iterator.HasMoreResults)
        {
            var batch = await iterator.ReadNextAsync();
            if (batch.Count > 0)
                return batch.First(); // Return existing instead of creating duplicate
        }

        var response = await _container.CreateItemAsync(log, new PartitionKey(_userContext.UserId));
        return response.Resource;
    }

    public async Task<MealLog?> UpdateAsync(string id, MealLog updated)
    {
        try
        {
            var existingResponse = await _container.ReadItemAsync<MealLog>(id, new PartitionKey(_userContext.UserId));
            var existing = existingResponse.Resource;

            existing.Date = updated.Date;
            existing.Name = updated.Name;
            existing.ImageUrl = updated.ImageUrl;
            existing.RecipeId = updated.RecipeId;
            existing.Source = updated.Source;

            var response = await _container.ReplaceItemAsync(existing, existing.Id, new PartitionKey(_userContext.UserId));
            return response.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<bool> DeleteAsync(string id)
    {
        try
        {
            await _container.DeleteItemAsync<MealLog>(id, new PartitionKey(_userContext.UserId));
            return true;
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    public async Task<int> GetTotalStampCountAsync()
    {
        var query = new QueryDefinition(
            "SELECT DISTINCT VALUE c.date FROM c WHERE c.userId = @userId")
            .WithParameter("@userId", _userContext.UserId);

        var iterator = _container.GetItemQueryIterator<string>(query);
        var count = 0;
        while (iterator.HasMoreResults)
        {
            var batch = await iterator.ReadNextAsync();
            count += batch.Count;
        }
        return count;
    }
}
