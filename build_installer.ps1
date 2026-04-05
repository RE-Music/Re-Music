# RE-Music Automated Build & Deploy Script (v1.1.3)
# This script ensures MSVC environment is ready and signing keys are loaded.

$productVersion = "1.1.3"
Write-Host "--------------------------------------------------" -ForegroundColor Cyan
Write-Host "    RE-Music Build System v1.1.3                 " -ForegroundColor White -BackgroundColor Blue
Write-Host "--------------------------------------------------" -ForegroundColor Cyan

# 0. Initialize MSVC Environment (Crucial for Windows Rust builds)
if ($env:NMIS_MSVC_READY -ne "1") {
    Write-Host "[0/4] Initializing MSVC environment..." -ForegroundColor Yellow
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vswhere) {
        $vsPath = & $vswhere -latest -property installationPath
        if ($vsPath) {
            $vcvars = Join-Path $vsPath "VC\Auxiliary\Build\vcvars64.bat"
            if (Test-Path $vcvars) {
                $tempFile = [System.IO.Path]::GetTempFileName()
                cmd /c "`"$vcvars`" && set > `"$tempFile`""
                Get-Content $tempFile | ForEach-Object {
                    if ($_ -match "^(.*?)=(.*)$") {
                        $name = $matches[1]; $value = $matches[2]
                        if ($name -eq "PATH") { $env:Path = $value } else { Set-Item "env:$name" $value }
                    }
                }
                Remove-Item $tempFile
                $env:NMIS_MSVC_READY = "1"
                Write-Host "      MSVC environment ready." -ForegroundColor Gray
            }
        }
    }
}

# 1. Load Signing Keys
Write-Host "[1/4] Loading signing keys from src-tauri/.env..." -ForegroundColor Yellow
if (Test-Path "src-tauri/.env") {
    Get-Content "src-tauri/.env" | Where-Object { $_ -match "=" -and $_ -notmatch "^#" } | ForEach-Object {
        $name, $value = $_.Split("=", 2)
        $name = $name.Trim()
        $value = $value.Trim()
        Set-Item "env:$name" $value
        [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

if ($env:TAURI_SIGNING_PRIVATE_KEY) {
    Write-Host "      DEBUG: TAURI_SIGNING_PRIVATE_KEY is set (starts with $($env:TAURI_SIGNING_PRIVATE_KEY.Substring(0,10))...)" -ForegroundColor Gray
} else {
    Write-Host "      DEBUG: TAURI_SIGNING_PRIVATE_KEY is NOT set!" -ForegroundColor Red
}

# 2. Start Tauri Build
Write-Host "[2/4] Building frontend and Rust backend with signing (verbose)..." -ForegroundColor Yellow
npx tauri build --verbose

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed! Please check the logs above." -ForegroundColor Red
    exit $LASTEXITCODE
}

# 3. Locate the MSI installer and SIG file
Write-Host "[3/4] Locating installer bundle and signature..." -ForegroundColor Yellow
$searchPath = "src-tauri/target/release/bundle/msi"
if (-Not (Test-Path $searchPath)) {
    $searchPath = "src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi"
}

$msi = Get-ChildItem -Path "$searchPath/*.msi" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$sig = Get-ChildItem -Path "$searchPath/*.msi.sig" | Where-Object { $_.BaseName -like "$($msi.BaseName)*" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if ($msi -and (-Not $sig -or $sig.BaseName -notlike "*$($productVersion)*")) {
    Write-Host "      Signature for $productVersion missing or outdated. Attempting manual signing..." -ForegroundColor Cyan
    npx tauri signer sign "$($msi.FullName)"
    $sig = Get-ChildItem -Path "$searchPath/*.msi.sig" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

if ($msi) {
    # 4. Copy to git-release
    $releaseDir = "./git-release"
    if (-Not (Test-Path $releaseDir)) { New-Item -ItemType Directory -Path $releaseDir }
    
    Write-Host "[4/4] Copying artifacts to $releaseDir..." -ForegroundColor Yellow
    Copy-Item $msi.FullName -Destination "$releaseDir/" -Force
    if ($sig) {
        Copy-Item $sig.FullName -Destination "$releaseDir/" -Force
        Write-Host "      Copied signature: $($sig.Name)" -ForegroundColor Gray
    } else {
        Write-Host "      WARNING: Signature file NOT found!" -ForegroundColor Red
    }
    
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host "   SUCCESS! Installer is ready in git-release.   " -ForegroundColor Green
    Write-Host "   File: $($msi.Name)" -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Green
} else {
    Write-Host "FAILURE: MSI file not found in $searchPath" -ForegroundColor Red
}
