using DinnerSuggestionApi.Models;
using DinnerSuggestionApi.Services;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = FunctionsApplication.CreateBuilder(args);

builder.ConfigureFunctionsWebApplication();

builder.Services.Configure<CosmosDbOptions>(
    builder.Configuration.GetSection("CosmosDb"));

builder.Services.Configure<AzureOpenAiOptions>(
    builder.Configuration.GetSection("AzureOpenAi"));

builder.Services.AddSingleton(sp =>
{
    var config = builder.Configuration;
    var endpoint = config["CosmosDb:Endpoint"]
        ?? throw new InvalidOperationException("CosmosDb:Endpoint is missing.");
    var key = config["CosmosDb:Key"]
        ?? throw new InvalidOperationException("CosmosDb:Key is missing.");

    return new CosmosClient(endpoint, key, new CosmosClientOptions
    {
        ApplicationName = "DinnerSuggestionApp"
    });
});

builder.Services.AddSingleton<PantryService>();
builder.Services.AddSingleton<RecipeService>();
builder.Services.AddHttpClient();
builder.Services.AddSingleton<SuggestionService>();
builder.Services.AddSingleton<IngredientClassifierService>();

builder.Build().Run();