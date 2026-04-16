using DinnerSuggestionApi.Middleware;
using DinnerSuggestionApi.Models;
using Microsoft.Azure.Cosmos;

namespace DinnerSuggestionApi.Services;

public class PantryService
{
    private readonly Container _container;
    private readonly UserContext _userContext;

    public PantryService(CosmosContainers containers, UserContext userContext)
    {
        _container = containers.Ingredients;
        _userContext = userContext;
    }

    public async Task<List<Ingredient>> GetAllAsync()
    {
        var query = new QueryDefinition(
            "SELECT * FROM c WHERE c.userId = @userId ORDER BY c.name")
            .WithParameter("@userId", _userContext.UserId);

        var iterator = _container.GetItemQueryIterator<Ingredient>(
            queryDefinition: query,
            requestOptions: new QueryRequestOptions
            {
                PartitionKey = new PartitionKey(_userContext.UserId)
            });

        var results = new List<Ingredient>();

        while (iterator.HasMoreResults)
        {
            var response = await iterator.ReadNextAsync();
            results.AddRange(response);
        }

        return results;
    }

    public async Task<Ingredient> AddAsync(Ingredient ingredient)
    {
        ingredient.Id = Guid.NewGuid().ToString();
        ingredient.UserId = _userContext.UserId;

        var response = await _container.CreateItemAsync(
            ingredient,
            new PartitionKey(_userContext.UserId));

        return response.Resource;
    }

    public async Task<Ingredient?> UpdateAsync(string id, Ingredient updatedIngredient)
    {
        try
        {
            var existingResponse = await _container.ReadItemAsync<Ingredient>(
                id,
                new PartitionKey(_userContext.UserId));

            var existing = existingResponse.Resource;
            existing.Name = updatedIngredient.Name;
            existing.Type = updatedIngredient.Type;
            existing.UserId = _userContext.UserId;

            var response = await _container.ReplaceItemAsync(
                existing,
                existing.Id,
                new PartitionKey(_userContext.UserId));

            return response.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<bool> DeleteAsync(string id)
    {
        try
        {
            await _container.DeleteItemAsync<Ingredient>(id, new PartitionKey(_userContext.UserId));
            return true;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    public async Task<string?> GetTypeByExactIngredientNameAsync(string ingredientName)
    {
        var normalized = (ingredientName ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            return null;

        var query = new QueryDefinition(
            "SELECT TOP 1 c.type FROM c WHERE c.userId = @userId AND LOWER(c.name) = LOWER(@name)")
            .WithParameter("@userId", _userContext.UserId)
            .WithParameter("@name", normalized);

        var iterator = _container.GetItemQueryIterator<TypeLookupResult>(
            queryDefinition: query,
            requestOptions: new QueryRequestOptions
            {
                PartitionKey = new PartitionKey(_userContext.UserId)
            });

        while (iterator.HasMoreResults)
        {
            var response = await iterator.ReadNextAsync();
            var match = response.FirstOrDefault();

            if (match is not null && !string.IsNullOrWhiteSpace(match.Type))
                return match.Type.Trim();
        }

        return null;
    }

    public async Task<List<string>> GetAvailableIngredientNamesAsync()
    {
        var items = await GetAllAsync();

        return items
            .Select(x => x.Name.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(x => x, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private sealed class TypeLookupResult
    {
        public string Type { get; set; } = string.Empty;
    }
}
