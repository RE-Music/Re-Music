# RE:Music Release Preparation Script (PowerShell) - MANUAL SIGNING COMPATIBLE
$version = "1.1.6-0"
$releaseDir = "git-release"

Write-Host "--- Start Release Preparation v$version ---" -ForegroundColor Cyan

if (-not (Test-Path $releaseDir)) { New-Object -ItemType Directory -Path $releaseDir }

# Locate artifacts
$msi = Get-ChildItem "src-tauri\target\release\bundle\msi\*1.1.6-0*.msi" | Select-Object -First 1
$msiSig = Get-ChildItem "src-tauri\target\release\bundle\msi\*1.1.6-0*.msi.sig" | Select-Object -First 1

if (-not $msi -or -not $msiSig) {
    Write-Host "ERROR: MSI or .msi.sig files not found" -ForegroundColor Red
    exit
}

Write-Host "Found artifacts: $($msi.Name), $($msiSig.Name)" -ForegroundColor Green

# Copy to release folder
if (-not (Test-Path $releaseDir)) { mkdir $releaseDir }
Copy-Item $msi.FullName "$releaseDir/"
Copy-Item $msiSig.FullName "$releaseDir/"

# Generate update.json (Clean Base64 format for Tauri v2)
$sigBase64 = (Get-Content $msiSig.FullName -Raw).Trim()

$updateJson = @{
    version = $version
    notes = "Release v1.1.6-alpha: UI/UX polish across all themes, removed debug labels, and fixed vibeGifMode persistence issue."
    pub_date = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    platforms = @{
        "windows-x86_64" = @{
            signature = $sigBase64
            url = "https://github.com/RE-Music/Re-Music/releases/download/v$version/$($msi.Name)"
        }
    }
}

$json = $updateJson | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText("$releaseDir/update.json", $json, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "`nRelease folder '$releaseDir' is ready!" -ForegroundColor Green
