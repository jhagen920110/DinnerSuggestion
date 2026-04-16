using System.Collections.Frozen;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Middleware;
using Microsoft.Extensions.DependencyInjection;

namespace DinnerSuggestionApi.Middleware;

public class AuthMiddleware : IFunctionsWorkerMiddleware
{
    private static readonly FrozenDictionary<string, string> SharedAccounts =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["jhagen920110@gmail.com"] = "jonathanh",
            ["dee0624kim@gmail.com"] = "jonathanh",
        }.ToFrozenDictionary(StringComparer.OrdinalIgnoreCase);

    public async Task Invoke(FunctionContext context, FunctionExecutionDelegate next)
    {
        var httpReqData = await context.GetHttpRequestDataAsync();

        if (httpReqData is not null)
        {
            var email = httpReqData.Headers.TryGetValues("X-User-Email", out var values)
                ? values.First()
                : string.Empty;

            var userContext = context.InstanceServices.GetRequiredService<UserContext>();
            userContext.Email = email;
            userContext.UserId = MapEmailToUserId(email);
        }

        await next(context);
    }

    private static string MapEmailToUserId(string email)
    {
        if (string.IsNullOrWhiteSpace(email))
            return "anonymous";

        if (SharedAccounts.TryGetValue(email, out var sharedId))
            return sharedId;

        var atIndex = email.IndexOf('@');
        return atIndex > 0 ? email[..atIndex].ToLowerInvariant() : email.ToLowerInvariant();
    }
}
