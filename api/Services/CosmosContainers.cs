using DinnerSuggestionApi.Models;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Options;

namespace DinnerSuggestionApi.Services;

public class CosmosContainers
{
    public Container Ingredients { get; }
    public Container Recipes { get; }
    public Container MealLogs { get; }
    public Container Tags { get; }
    public Container BlockedRecipes { get; }

    public CosmosContainers(CosmosClient client, IOptions<CosmosDbOptions> options)
    {
        var settings = options.Value;
        var database = client.GetDatabase(settings.DatabaseName);

        database.CreateContainerIfNotExistsAsync("meal-logs", "/userId").GetAwaiter().GetResult();
        database.CreateContainerIfNotExistsAsync("tags", "/userId").GetAwaiter().GetResult();
        database.CreateContainerIfNotExistsAsync("blocked-recipes", "/userId").GetAwaiter().GetResult();

        Ingredients = database.GetContainer(settings.ContainerName);
        Recipes = database.GetContainer("recipes");
        MealLogs = database.GetContainer("meal-logs");
        Tags = database.GetContainer("tags");
        BlockedRecipes = database.GetContainer("blocked-recipes");
    }
}
