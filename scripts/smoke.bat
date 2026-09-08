@echo off
echo Checking backend health ...
curl -sSf http://localhost:8080/actuator/health >nul 2>&1
if errorlevel 1 (
    echo Backend not reachable on :8080
    exit /b 1
)
echo Checking frontend ...
curl -sSf http://localhost:8000/index.html >nul 2>&1
if errorlevel 1 (
    echo Frontend not reachable on :8000
    exit /b 1
)
echo Smoke checks passed.
