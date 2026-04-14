using System.Net;
using DinnerSuggestionApi.Models;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Options;

namespace DinnerSuggestionApi.Services;

public class TagService
{
    private readonly Container _container;
    private readonly string _userId;

    private static readonly List<string> DefaultTags = new()
    {
        "시원", "뜨끈", "국물", "매운맛", "간단", "든든", "밑반찬", "볶음", "건강", "야식"
    };

    public TagService(CosmosClient cosmosClient, IOptions<CosmosDbOptions> options)
    {
        var database = cosmosClient.GetDatabase(options.Value.DatabaseName);
        database.CreateContainerIfNotExistsAsync("tags", "/userId").GetAwaiter().GetResult();
        _container = database.GetContainer("tags");
        _userId = options.Value.UserId;

        SeedDefaultTagsAsync().GetAwaiter().GetResult();
    }

    private async Task SeedDefaultTagsAsync()
    {
        var existing = await GetAllAsync();
        if (existing.Count > 0) return;

        foreach (var name in DefaultTags)
        {
            var tag = new Tag { Name = name, UserId = _userId };
            await _container.CreateItemAsync(tag, new PartitionKey(_userId));
        }
    }

    public async Task<List<Tag>> GetAllAsync()
    {
        var query = new QueryDefinition("SELECT * FROM c WHERE c.userId = @userId ORDER BY c.name")
            .WithParameter("@userId", _userId);

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
        tag.UserId = _userId;
        tag.Name = tag.Name.Trim();
        var response = await _container.CreateItemAsync(tag, new PartitionKey(_userId));
        return response.Resource;
    }

    public async Task<bool> DeleteAsync(string id)
    {
        try
        {
            await _container.DeleteItemAsync<Tag>(id, new PartitionKey(_userId));
            return true;
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return false;
        }
    }
}
