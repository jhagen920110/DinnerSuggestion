using DinnerSuggestionApi.Middleware;
using DinnerSuggestionApi.Models;
using Microsoft.Azure.Cosmos;

namespace DinnerSuggestionApi.Services;

public class BlockedRecipeService
{
    private readonly Container _container;
    private readonly UserContext _userContext;

    public BlockedRecipeService(CosmosContainers containers, UserContext userContext)
    {
        _container = containers.BlockedRecipes;
        _userContext = userContext;
    }

    public async Task<List<BlockedRecipe>> GetAllAsync()
    {
        var query = new QueryDefinition(
            "SELECT * FROM c WHERE c.userId = @userId ORDER BY c.name")
            .WithParameter("@userId", _userContext.UserId);

        var iterator = _container.GetItemQueryIterator<BlockedRecipe>(
            queryDefinition: query,
            requestOptions: new QueryRequestOptions
            {
                PartitionKey = new PartitionKey(_userContext.UserId)
            });

        var results = new List<BlockedRecipe>();
        while (iterator.HasMoreResults)
        {
            var response = await iterator.ReadNextAsync();
            results.AddRange(response);
        }
        return results;
    }

    public async Task<BlockedRecipe> AddAsync(string name)
    {
        var item = new BlockedRecipe
        {
            Id = Guid.NewGuid().ToString(),
            UserId = _userContext.UserId,
            Name = name.Trim()
        };

        var response = await _container.CreateItemAsync(item, new PartitionKey(_userContext.UserId));
        return response.Resource;
    }

    public async Task<bool> DeleteAsync(string id)
    {
        try
        {
            await _container.DeleteItemAsync<BlockedRecipe>(id, new PartitionKey(_userContext.UserId));
            return true;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return false;
        }
    }
}
