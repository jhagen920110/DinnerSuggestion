# Dinner Suggestion App

A phone-friendly web app for tracking pantry ingredients and getting dinner suggestions.

This project currently uses:

- **Frontend:** static web app (`web`)
- **Backend:** Azure Functions (`api`)
- **Database:** Azure Cosmos DB for NoSQL
- **AI:** Azure OpenAI / Foundry

---

## Current Environment Setup

### Dev resources

- **Resource Group:** `rg-dinner-suggestion-dev`
- **Function App:** `func-dinnersuggestion-dev`
- **Static Web App:** `swa-dinnersuggestion-dev`
- **Static Web App URL:** `https://purple-beach-0dfd78510.1.azurestaticapps.net`
- **Cosmos DB Database:** `DinnerSuggestionDb`
- **Cosmos DB Container:** `Ingredients`
- **Cosmos DB Partition Key:** `/userId`

### Environment split

- **Local frontend + local API** -> uses local config
- **Local frontend + Azure API** -> uses Azure Function App settings
- **Deployed frontend + Azure API** -> uses Azure Function App settings

---

## Repo Structure

```text
DinnerSuggestionApp/
├─ api/     # Azure Functions backend
└─ web/     # Static frontend
```

---

## Local Development

### Frontend

Serve the `web` folder locally using your preferred static server.

Example:

```bash
cd web
# use Live Server, python -m http.server, or another local server
```

### Backend

Run Azure Functions locally from the `api` folder:

```bash
cd api
func start
```

Default local API URL:

```text
http://localhost:7071/api
```

---

## Frontend API Configuration

The frontend uses a runtime config file:

### `web/config.js`

```js
window.APP_CONFIG = {
  apiBase: "https://func-dinnersuggestion-dev-dhdtcphpgthxanc4.centralus-01.azurewebsites.net/api"
};
```

### `web/index.html`

Make sure `config.js` loads before `app.js`:

```html
<script src="config.js"></script>
<script src="app.js"></script>
```

### `web/app.js`

```js
const apiBase = window.APP_CONFIG.apiBase;
```

---

## Azure Function App Configuration

Azure Function App settings should contain the backend configuration.

### Required Cosmos settings

```text
CosmosDb__Endpoint
CosmosDb__Key
CosmosDb__DatabaseName
CosmosDb__ContainerName
CosmosDb__UserId
```

### Current expected values

```text
CosmosDb__DatabaseName = DinnerSuggestionDb
CosmosDb__ContainerName = Ingredients
CosmosDb__UserId = jonathan
```

### AI / Foundry settings

Use the same names your backend reads in `Program.cs` / service registration.

Examples:

```text
AZURE_OPENAI_ENDPOINT
AZURE_OPENAI_API_KEY
AZURE_OPENAI_DEPLOYMENT_NAME
```

> Do not commit secrets to the repository.

---

## Cosmos DB Setup

Create the following in Azure Cosmos DB:

- **Database:** `DinnerSuggestionDb`
- **Container:** `Ingredients`
- **Partition key:** `/userId`

This must match the backend code.

---

## Deployments

## Frontend deployment

The frontend is deployed with **Azure Static Web Apps** from GitHub.

### Current setup

- **Repo:** `jhagen920110/DinnerSuggestion`
- **Branch:** `main`
- **App location:** `web`
- **API location:** blank
- **Output location:** blank

### Behavior

- Pushing frontend changes to `main` triggers **automatic deployment**.
- Deployment is handled by the GitHub Actions workflow created by Azure Static Web Apps.

---

## Backend deployment

The backend is currently deployed manually.

### Publish command

Run from the `api` folder:

```bash
cd C:\Users\jhage\OneDrive\바탕 화면\Files\VSCode\DinnerSuggestionApp\api
func azure functionapp publish func-dinnersuggestion-dev
```

### Important note

Pushing backend code to GitHub does **not** automatically redeploy the Function App in the current setup.

If backend code changes, publish again manually.

---

## CORS

The Function App must allow requests from both local dev and the deployed frontend.

### Current origins to allow

```text
http://localhost:5500
http://127.0.0.1:5500
https://purple-beach-0dfd78510.1.azurestaticapps.net
```

### Example CLI command

```bash
az functionapp cors add \
  --name func-dinnersuggestion-dev \
  --resource-group rg-dinner-suggestion-dev \
  --allowed-origins https://purple-beach-0dfd78510.1.azurestaticapps.net
```

---

## Common Commands

### Azure login

```bash
az config set core.login_experience_v2=off
az login --tenant 656825c8-ec7c-4a89-9e94-c89e9b230ea2
```

### Check active subscription

```bash
az account list --output table
az account show --output table
```

### Publish backend

```bash
cd api
func azure functionapp publish func-dinnersuggestion-dev
```

### Check deployed functions

```bash
func azure functionapp list-functions func-dinnersuggestion-dev
```

### Show Function App hostname

```bash
az functionapp show \
  --name func-dinnersuggestion-dev \
  --resource-group rg-dinner-suggestion-dev \
  --query defaultHostName \
  -o tsv
```

---

## Deployment Workflow Summary

### When changing frontend files

Examples:

- `web/app.js`
- `web/index.html`
- `web/style.css`
- `web/config.js`

Do this:

```bash
git add .
git commit -m "Update frontend"
git push origin main
```

This should trigger automatic frontend deployment.

### When changing backend files

Examples:

- `api/*.cs`
- `Program.cs`
- functions
- services

Do this:

```bash
git add .
git commit -m "Update backend"
git push origin main
cd api
func azure functionapp publish func-dinnersuggestion-dev
```

---

## Troubleshooting

### Frontend still calls localhost

Check:

- `web/config.js` exists
- `index.html` loads `config.js` before `app.js`
- `app.js` uses `window.APP_CONFIG.apiBase`
- Static Web App deployment completed successfully
- browser cache is cleared

### CORS error

If you see a browser CORS error:

- add the frontend origin to Function App CORS
- make sure you are testing the correct deployed site URL

### 500 error from API

Check:

- Function App settings are present
- Cosmos DB database and container names are correct
- partition key is `/userId`
- Application Insights logs for the real exception

### `ERR_NAME_NOT_RESOLVED`

Usually means the Function App hostname in the frontend config is wrong.

Get the exact hostname from the Azure portal or with CLI.

---

## Next Planned Improvements

- Add better API logging with `ILogger`
- Improve error handling for suggestions and Cosmos calls
- Add production environment later
- Create separate prod Cosmos DB
- Create separate prod Foundry / Azure OpenAI resource
- Optionally set up CI/CD for backend deployment

---

## Notes

Add your own notes here.

### Deployment notes

- 
- 
- 

### Azure notes

- 
- 
- 

### Product ideas

- 
- 
- 

### Bugs / follow-ups

- 
- 
- 

---

## Production Plan Later

When ready for production, create separate resources:

- **Function App (prod)**
- **Cosmos DB (prod)**
- **Foundry / Azure OpenAI (prod)**
- **frontend prod configuration**

Do not reuse dev database/resources for production.
