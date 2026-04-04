# Initialize MSVC environment and run tauri build
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (!(Test-Path $vswhere)) {
    Write-Error "Visual Studio Installer (vswhere.exe) not found!"
    exit 1
}

$vsPath = & $vswhere -latest -property installationPath
if (!$vsPath) {
    Write-Error "No Visual Studio installation found!"
    exit 1
}

$vcvars = Join-Path $vsPath "VC\Auxiliary\Build\vcvars64.bat"
if (!(Test-Path $vcvars)) {
    Write-Error "vcvars64.bat not found at $vcvars"
    exit 1
}

Write-Host "Initializing MSVC environment for Build..." -ForegroundColor Cyan
$tempFile = [System.IO.Path]::GetTempFileName()
cmd /c " `"$vcvars`" && set > `"$tempFile`" "

Get-Content $tempFile | ForEach-Object {
    if ($_ -match "^(.*?)=(.*)$") {
        $name = $matches[1]
        $value = $matches[2]
        if ($name -eq "PATH") {
            $env:Path = $value
        } else {
            Set-Item "env:$name" $value
        }
    }
}
Remove-Item $tempFile

# Step 0: Automagically switch URL to index.html for Production Build
$tauriConfig = "src-tauri/tauri.conf.json"
Write-Host "Preparing tauri.conf.json for production..." -ForegroundColor Yellow
$configContent = Get-Content $tauriConfig -Raw
$prodConfig = $configContent -replace '"url":\s*".*?"', '"url": "index.html"'
$prodConfig | Set-Content $tauriConfig

try {
    Write-Host "Environment ready! Starting Tauri build..." -ForegroundColor Green
    npx tauri build
}
finally {
    # Step 4: Restore dev URL regardless of build success/failure
    Write-Host "Restoring dev URL in tauri.conf.json..." -ForegroundColor Yellow
    $configContent | Set-Content $tauriConfig
}
