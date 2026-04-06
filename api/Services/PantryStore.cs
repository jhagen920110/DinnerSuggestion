using DinnerSuggestionApi.Models;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Options;

namespace DinnerSuggestionApi.Services;

public class PantryStore
{
    private static readonly HashSet<string> ValidStockLevels =
    [
        "Plenty", "Some", "Low", "Out"
    ];

    private static readonly HashSet<string> ValidTypes =
    [
        "vegetable", "carb", "protein", "dairy", "fruit", "sauce", "frozen", "other"
    ];

    private readonly Container _container;
    private readonly string _userId;

    public PantryStore(CosmosClient cosmosClient, IOptions<CosmosDbOptions> options)
    {
        var settings = options.Value;

        if (string.IsNullOrWhiteSpace(settings.DatabaseName))
            throw new InvalidOperationException("CosmosDb:DatabaseName is missing.");

        if (string.IsNullOrWhiteSpace(settings.ContainerName))
            throw new InvalidOperationException("CosmosDb:ContainerName is missing.");

        _userId = string.IsNullOrWhiteSpace(settings.UserId) ? "jonathan" : settings.UserId;
        _container = cosmosClient.GetContainer(settings.DatabaseName, settings.ContainerName);
    }

    public async Task<List<Ingredient>> GetAllAsync()
    {
        var query = new QueryDefinition(
            "SELECT * FROM c WHERE c.userId = @userId ORDER BY c.name")
            .WithParameter("@userId", _userId);

        var iterator = _container.GetItemQueryIterator<Ingredient>(
            queryDefinition: query,
            requestOptions: new QueryRequestOptions
            {
                PartitionKey = new PartitionKey(_userId)
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
        ingredient.UserId = _userId;
        ingredient.Name = ingredient.Name.Trim();
        ingredient.StockLevel = NormalizeStockLevel(ingredient.StockLevel);
        ingredient.Type = NormalizeType(ingredient.Type);

        var response = await _container.CreateItemAsync(
            ingredient,
            new PartitionKey(_userId));

        return response.Resource;
    }

    public async Task<Ingredient?> UpdateAsync(string id, Ingredient updatedIngredient)
    {
        try
        {
            var existingResponse = await _container.ReadItemAsync<Ingredient>(
                id,
                new PartitionKey(_userId));

            var existing = existingResponse.Resource;
            existing.Name = updatedIngredient.Name.Trim();
            existing.StockLevel = NormalizeStockLevel(updatedIngredient.StockLevel);
            existing.Type = NormalizeType(updatedIngredient.Type);
            existing.UserId = _userId;

            var response = await _container.ReplaceItemAsync(
                existing,
                existing.Id,
                new PartitionKey(_userId));

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
            await _container.DeleteItemAsync<Ingredient>(id, new PartitionKey(_userId));
            return true;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    public async Task<List<string>> GetAvailableIngredientNamesAsync()
    {
        var items = await GetAllAsync();

        return items
            .Where(x => !string.Equals(x.StockLevel, "Out", StringComparison.OrdinalIgnoreCase))
            .Select(x => x.Name.Trim().ToLowerInvariant())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct()
            .ToList();
    }

    public async Task<List<string>> GetLowStockIngredientNamesAsync()
    {
        var items = await GetAllAsync();

        return items
            .Where(x => string.Equals(x.StockLevel, "Low", StringComparison.OrdinalIgnoreCase))
            .Select(x => x.Name.Trim().ToLowerInvariant())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct()
            .ToList();
    }

    private static string NormalizeStockLevel(string? stockLevel)
    {
        if (string.IsNullOrWhiteSpace(stockLevel))
            return "Some";

        var match = ValidStockLevels.FirstOrDefault(x =>
            string.Equals(x, stockLevel.Trim(), StringComparison.OrdinalIgnoreCase));

        return match ?? "Some";
    }

    private static string NormalizeType(string? type)
    {
        if (string.IsNullOrWhiteSpace(type))
            return "other";

        var normalized = type.Trim().ToLowerInvariant();
        return ValidTypes.Contains(normalized) ? normalized : "other";
    }
}