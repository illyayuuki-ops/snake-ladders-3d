<#
.SYNOPSIS
Setup script for Snakes & Ladders 3D - downloads JDK and Maven, then runs the app.
#>

param(
    [switch]$SkipRun
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $ProjectRoot "backend"
$MavenDir = "$env:USERPROFILE\.maven\apache-maven-3.9.6"
$JdkDir = "$env:USERPROFILE\.jdk\jdk-11"

function Write-Step { param($msg) Write-Host "`n[STEP] $msg" -ForegroundColor Cyan }
function Write-Ok { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }

# ---------- 1. Ensure Maven ----------
if (-not (Test-Path "$MavenDir\bin\mvn.cmd")) {
    Write-Step "Downloading Apache Maven 3.9.6..."
    $mavenZip = "$env:TEMP\maven.zip"
    if (-not (Test-Path $mavenZip)) {
        Invoke-WebRequest -Uri "https://archive.apache.org/dist/maven/maven-3/3.9.6/binaries/apache-maven-3.9.6-bin.zip" -OutFile $mavenZip
    }
    Expand-Archive -Path $mavenZip -DestinationPath "$env:USERPROFILE\.maven" -Force
    Write-Ok "Maven installed to $MavenDir"
} else {
    Write-Ok "Maven already present"
}

# ---------- 2. Ensure JDK 11 ----------
if (-not (Test-Path "$JdkDir\bin\java.exe")) {
    Write-Step "Downloading OpenJDK 11 (Eclipse Temurin)..."
    $jdkZip = "$env:TEMP\jdk11.zip"
    
    # Try multiple sources
    $urls = @(
        "https://github.com/adoptium/temurin11-binaries/releases/latest/download/OpenJDK11U-jdk_x64_windows_hotspot.zip",
        "https://api.adoptium.net/v3/binary/latest/11/ga/windows/x64/jdk/hotspot/normal/eclipse"
    )
    
    $downloaded = $false
    foreach ($url in $urls) {
        try {
            Write-Host "  Trying: $url"
            Invoke-WebRequest -Uri $url -OutFile $jdkZip -MaximumRedirection 5
            if ((Get-Item $jdkZip).Length -gt 1MB) {
                $downloaded = $true
                break
            }
        } catch {
            Write-Warn "  Failed: $_"
        }
    }
    
    if (-not $downloaded) {
        Write-Error "Could not download JDK 11 automatically. Please install manually from https://adoptium.net/ and re-run this script."
    }
    
    Write-Step "Extracting JDK..."
    Expand-Archive -Path $jdkZip -DestinationPath "$env:USERPROFILE\.jdk" -Force
    
    # Find the extracted JDK folder (it usually has a long name)
    $extracted = Get-ChildItem "$env:USERPROFILE\.jdk" -Directory | Where-Object { $_.Name -like "*jdk*" -or $_.Name -like "*OpenJDK*" } | Select-Object -First 1
    if ($extracted) {
        if ($JdkDir -ne $extracted.FullName) {
            Rename-Item $extracted.FullName $JdkDir -Force
        }
        Write-Ok "JDK installed to $JdkDir"
    } else {
        Write-Error "Could not locate extracted JDK folder."
    }
} else {
    Write-Ok "JDK 11 already present"
}

# ---------- 3. Set environment for this session ----------
$env:JAVA_HOME = $JdkDir
$env:MAVEN_HOME = $MavenDir
$env:PATH = "$JdkDir\bin;$MavenDir\bin;$env:PATH"

Write-Step "Verifying Java and Maven..."
java -version 2>&1 | Write-Host
mvn --version | Write-Host

# ---------- 4. Build and run ----------
if (-not $SkipRun) {
    Write-Step "Starting Spring Boot application..."
    Set-Location $BackendDir
    mvn spring-boot:run
}
