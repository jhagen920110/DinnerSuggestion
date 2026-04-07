$ErrorActionPreference = "Stop"

Write-Host "Cleaning project..."
dotnet clean

if (Test-Path ".\bin") {
    Remove-Item -Recurse -Force ".\bin"
}

if (Test-Path ".\obj") {
    Remove-Item -Recurse -Force ".\obj"
}

Write-Host "Publishing Azure Function App..."
func azure functionapp publish func-dinnersuggestion-dev

Write-Host "Done."