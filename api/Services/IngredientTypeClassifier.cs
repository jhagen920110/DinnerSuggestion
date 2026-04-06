using System.Threading.Tasks;
using DinnerSuggestionApi.Helpers;

namespace DinnerSuggestionApi.Services;

public class IngredientTypeClassifier : IIngredientTypeClassifier
{
    public Task<string> ClassifyAsync(string ingredientName)
    {
        // Temporary safe fallback until AI is wired in.
        // Replace this method with real AI call later.
        return Task.FromResult("기타");
    }
}