using DinnerSuggestionApi.Models;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Options;

namespace DinnerSuggestionApi.Services;

public class PantryStore
{
    private static readonly HashSet<string> ValidStockLevels =
    [
        "많음", "보통", "적음", "없음"
    ];

    private static readonly HashSet<string> ValidTypes =
    [
        "야채", "탄수화물", "고기/단백질", "유제품", "과일", "소스/조미료", "냉동식품", "기타"
    ];

    private readonly Container _container;
    private readonly string _userId;

    public PantryStore(CosmosClient cosmosClient, IOptions<CosmosDbOptions> options)
    {
        var settings = options.Value;
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
            await _container.DeleteItemAsync(id, new PartitionKey(_userId));
            return true;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    private static string NormalizeStockLevel(string? stockLevel)
    {
        if (string.IsNullOrWhiteSpace(stockLevel))
            return "보통";

        var match = ValidStockLevels.FirstOrDefault(x =>
            string.Equals(x, stockLevel.Trim(), StringComparison.OrdinalIgnoreCase));

        return match ?? "보통";
    }

    private static string NormalizeType(string? type)
    {
        if (string.IsNullOrWhiteSpace(type))
            return "기타";

        var match = ValidTypes.FirstOrDefault(x =>
            string.Equals(x, type.Trim(), StringComparison.OrdinalIgnoreCase));

        return match ?? "기타";
    }
}