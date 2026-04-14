using DinnerSuggestionApi.Models;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Options;

namespace DinnerSuggestionApi.Services;

public class RecipeService
{
    private readonly Container _container;
    private readonly string _userId;

    public RecipeService(CosmosClient cosmosClient, IOptions<CosmosDbOptions> options)
    {
        var settings = options.Value;
        _userId = string.IsNullOrWhiteSpace(settings.UserId) ? "jonathan" : settings.UserId;
        _container = cosmosClient.GetContainer(settings.DatabaseName, "recipes");
    }

    public async Task<List<Recipe>> GetAllAsync()
    {
        var query = new QueryDefinition(
            "SELECT * FROM c WHERE c.userId = @userId ORDER BY c.name")
            .WithParameter("@userId", _userId);

        var iterator = _container.GetItemQueryIterator<Recipe>(
            queryDefinition: query,
            requestOptions: new QueryRequestOptions
            {
                PartitionKey = new PartitionKey(_userId)
            });

        var results = new List<Recipe>();
        while (iterator.HasMoreResults)
        {
            var response = await iterator.ReadNextAsync();
            results.AddRange(response);
        }
        return results;
    }

    public async Task<Recipe> AddAsync(Recipe recipe)
    {
        recipe.Id = Guid.NewGuid().ToString();
        recipe.UserId = _userId;

        var response = await _container.CreateItemAsync(recipe, new PartitionKey(_userId));
        return response.Resource;
    }

    public async Task<Recipe?> UpdateAsync(string id, Recipe updatedRecipe)
    {
        try
        {
            var existingResponse = await _container.ReadItemAsync<Recipe>(id, new PartitionKey(_userId));
            var existing = existingResponse.Resource;

            existing.Name = updatedRecipe.Name;
            existing.Ingredients = updatedRecipe.Ingredients;
            existing.Difficulty = updatedRecipe.Difficulty;
            existing.CookTime = updatedRecipe.CookTime;
            existing.Cuisine = updatedRecipe.Cuisine;
            existing.Tags = updatedRecipe.Tags;
            existing.Notes = updatedRecipe.Notes;
            existing.RecipeUrl = updatedRecipe.RecipeUrl;
            existing.LastMade = updatedRecipe.LastMade;

            var response = await _container.ReplaceItemAsync(existing, existing.Id, new PartitionKey(_userId));
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
            await _container.DeleteItemAsync<Recipe>(id, new PartitionKey(_userId));
            return true;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    public async Task<List<Recipe>> FindByIngredientsAsync(List<string> availableIngredients)
    {
        var all = await GetAllAsync();
        var availableSet = new HashSet<string>(
            availableIngredients.Select(x => x.Trim().ToLowerInvariant()),
            StringComparer.OrdinalIgnoreCase);

        return all
            .Select(recipe => new
            {
                Recipe = recipe,
                MatchCount = recipe.Ingredients.Count(i => availableSet.Contains(i.Trim().ToLowerInvariant())),
                MissingCount = recipe.Ingredients.Count(i => !availableSet.Contains(i.Trim().ToLowerInvariant()))
            })
            .Where(x => x.MatchCount > 0)
            .OrderBy(x => x.MissingCount)
            .ThenByDescending(x => x.MatchCount)
            .Select(x => x.Recipe)
            .ToList();
    }
}
