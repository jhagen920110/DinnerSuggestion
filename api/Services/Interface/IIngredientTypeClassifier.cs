using System.Threading.Tasks;

namespace DinnerSuggestionApi.Services;

public interface IIngredientTypeClassifier
{
    Task<string> ClassifyAsync(string ingredientName);
}