# RE:Music Release Preparation Script (PowerShell) - MANUAL SIGNING COMPATIBLE

$version = "1.1.1"
$releaseDir = "git-release"

Write-Host "--- Start Release Preparation v$version ---" -ForegroundColor Cyan

if (-not (Test-Path $releaseDir)) { New-Item -ItemType Directory -Path $releaseDir }

# Locate artifacts
$msi = Get-ChildItem "src-tauri/target/release/bundle/msi/*.msi" | Select-Object -First 1
$msiSig = Get-ChildItem "src-tauri/target/release/bundle/msi/*.msi.sig" | Select-Object -First 1

if (-not $msi -or -not $msiSig) {
    Write-Host "ERROR: MSI or .msi.sig files not found in src-tauri/target/release/bundle/msi" -ForegroundColor Red
    Write-Host "Make sure you ran ./build-and-sign.ps1 successfully."
    exit
}

Write-Host "Found artifacts: $($msi.Name), $($msiSig.Name)" -ForegroundColor Green

# Copy to release folder
Copy-Item $msi.FullName "$releaseDir/"
Copy-Item $msiSig.FullName "$releaseDir/"

# Generate update.json
$sigContent = Get-Content $msiSig.FullName -Raw
$updateJson = @{
    version = $version
    notes = "Release v$($version): Фикс авторизации Яндекс/YouTube и улучшение инициализации."
    pub_date = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    platforms = @{
        "windows-x86_64" = @{
            signature = $sigContent.Trim()
            url = "https://github.com/RE-Music/Re-Music/releases/download/v$($version)/$($msi.Name)"
        }
    }
}

$json = $updateJson | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText("$releaseDir/update.json", $json, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "`nRelease folder '$releaseDir' is ready!" -ForegroundColor Green
Write-Host "Next steps:"
Write-Host "1. Create draft release 'v$version' on GitHub"
Write-Host "2. Upload all files from '$releaseDir' folder"
Write-Host "3. Publish the release"
