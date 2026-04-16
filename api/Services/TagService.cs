using System.Collections.Concurrent;
using System.Net;
using DinnerSuggestionApi.Middleware;
using DinnerSuggestionApi.Models;
using Microsoft.Azure.Cosmos;

namespace DinnerSuggestionApi.Services;

public class TagService
{
    private readonly Container _container;
    private readonly UserContext _userContext;

    private static readonly ConcurrentDictionary<string, bool> SeededUsers = new(StringComparer.OrdinalIgnoreCase);

    private static readonly List<string> DefaultTags = new()
    {
        "시원", "뜨끈", "국물", "매운맛", "간단", "든든", "밑반찬", "볶음", "건강", "야식"
    };

    public TagService(CosmosContainers containers, UserContext userContext)
    {
        _container = containers.Tags;
        _userContext = userContext;
    }

    private async Task SeedDefaultTagsIfNeededAsync()
    {
        var userId = _userContext.UserId;
        if (SeededUsers.ContainsKey(userId)) return;

        var query = new QueryDefinition("SELECT VALUE COUNT(1) FROM c WHERE c.userId = @userId")
            .WithParameter("@userId", userId);
        var iterator = _container.GetItemQueryIterator<int>(query);
        var response = await iterator.ReadNextAsync();

        if (response.First() == 0)
        {
            foreach (var name in DefaultTags)
            {
                var tag = new Tag { Name = name, UserId = userId };
                await _container.CreateItemAsync(tag, new PartitionKey(userId));
            }
        }

        SeededUsers.TryAdd(userId, true);
    }

    public async Task<List<Tag>> GetAllAsync()
    {
        await SeedDefaultTagsIfNeededAsync();

        var query = new QueryDefinition("SELECT * FROM c WHERE c.userId = @userId ORDER BY c.name")
            .WithParameter("@userId", _userContext.UserId);

        var iterator = _container.GetItemQueryIterator<Tag>(query);
        var results = new List<Tag>();
        while (iterator.HasMoreResults)
        {
            var batch = await iterator.ReadNextAsync();
            results.AddRange(batch);
        }
        return results;
    }

    public async Task<Tag> AddAsync(Tag tag)
    {
        tag.UserId = _userContext.UserId;
        tag.Name = tag.Name.Trim();
        var response = await _container.CreateItemAsync(tag, new PartitionKey(_userContext.UserId));
        return response.Resource;
    }

    public async Task<bool> DeleteAsync(string id)
    {
        try
        {
            await _container.DeleteItemAsync<Tag>(id, new PartitionKey(_userContext.UserId));
            return true;
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return false;
        }
    }
}
