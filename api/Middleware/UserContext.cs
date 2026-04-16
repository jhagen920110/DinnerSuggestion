namespace DinnerSuggestionApi.Middleware;

public class UserContext
{
    public string UserId { get; set; } = "anonymous";
    public string Email { get; set; } = string.Empty;
}
