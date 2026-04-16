using DinnerSuggestionApi.Middleware;
using DinnerSuggestionApi.Models;
using DinnerSuggestionApi.Services;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = FunctionsApplication.CreateBuilder(args);

builder.ConfigureFunctionsWebApplication();
builder.UseMiddleware<AuthMiddleware>();

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

builder.Services.AddScoped<UserContext>();
builder.Services.AddSingleton<CosmosContainers>();
builder.Services.AddScoped<PantryService>();
builder.Services.AddScoped<RecipeService>();
builder.Services.AddScoped<TagService>();
builder.Services.AddScoped<MealLogService>();
builder.Services.AddHttpClient();
builder.Services.AddSingleton<SuggestionService>();
builder.Services.AddSingleton<IngredientClassifierService>();

builder.Build().Run();