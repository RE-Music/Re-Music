# RE:Music Build & Sign Script (PowerShell) - MANUAL SIGNING VERSION

$CLEAN_KEY_ONLY = 'dW50cnVzdGVkIGNvbW1lbnQ6IHJzaWduIGVuY3J5cHRlZCBzZWNyZXQga2V5ClJXUlRZMEl5dGRFWjhiRXd6Q1BYN0ZpakRPbUF2NzdXN0tta0dyTzFEU1o5T0N4MThzOEFBQkFBQUFBQUFBQUFBQUlBQUFBQStYaE1ZKzc3bHJNYUpHSG9kT1VhMWtmZk00MVUrRGRidXNOOUlzakc5b1VvaWpBVWI4Z2ZlZHNLOGxDaWJLRTVoMURHbm1qZ2p4OFQxSUtCN3QzM3ptL3BMTEgrbEhYRUJ6dzdFUnZWSkdjNnlMZHVOdmQ3Q0FxQ0Q0VDVkN3JmQXJXTGQyU1VmVTQ9Cg=='
$PASSWORD = 'Kiradown123321'

Write-Host "--- Cleaning up target bundles ---" -ForegroundColor Cyan
if (Test-Path "src-tauri/target/release/bundle") { Remove-Item -Recurse -Force "src-tauri/target/release/bundle" }

Write-Host "--- Setting environment variables ---" -ForegroundColor Cyan
$env:TAURI_SIGNING_PRIVATE_KEY = $CLEAN_KEY_ONLY
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $PASSWORD

Write-Host "Starting build via npx tauri..." -ForegroundColor Green
npx tauri build --verbose

Write-Host "`n--- Manual Signing Phase ---" -ForegroundColor Cyan
$msi = Get-ChildItem "src-tauri/target/release/bundle/msi/*.msi" | Select-Object -First 1

if ($msi) {
    Write-Host "Signing MSI: $($msi.FullName)" -ForegroundColor Green
    npx tauri signer sign "$($msi.FullName)"
} else {
    Write-Host "WARNING: MSI file not found for manual signing!" -ForegroundColor Yellow
}

$setup = Get-ChildItem "src-tauri/target/release/bundle/nsis/*.exe" | Select-Object -First 1
if ($setup) {
    Write-Host "Signing Setup EXE: $($setup.FullName)" -ForegroundColor Green
    npx tauri signer sign "$($setup.FullName)"
}

Write-Host "`nBuild and Manual Signing finished! Now run ./prepare-release.ps1" -ForegroundColor Yellow
