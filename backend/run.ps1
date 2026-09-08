[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

Set-Location "$PSScriptRoot"

Write-Host "`n[1/4] Compiling..." -ForegroundColor Cyan
& mvn compile -q
if ($LASTEXITCODE -ne 0) { Write-Host "Compilation failed" -ForegroundColor Red; exit 1 }

Write-Host "[2/4] Building classpath..." -ForegroundColor Cyan
$jars = Get-ChildItem -Path "$env:USERPROFILE\.m2\repository" -Filter "*.jar" -Recurse -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
$cp = "target\classes;" + ($jars -join ";")
$cpFile = Join-Path $env:TEMP "sl3d-classpath.txt"
Set-Content -Path $cpFile -Value $cp -NoNewline
Write-Host "Found $($jars.Count) JARs" -ForegroundColor Green

Write-Host "[3/4] Verifying Java..." -ForegroundColor Cyan
& java -version | Out-Null

Write-Host "[4/4] Starting application on http://localhost:8080`n" -ForegroundColor Cyan
& java -cp "@$cpFile" com.arena.snakesladders.SnakesLaddersApplication
