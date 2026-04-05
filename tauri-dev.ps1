# Avoid infinite loop: if we're already in the initialized environment, just run tauri
if ($env:NMIS_MSVC_READY -eq "1") {
    Write-Host "MSVC already initialized. Running Tauri dev..." -ForegroundColor Gray
    npx tauri dev
    exit
}

$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (!(Test-Path $vswhere)) {
    Write-Error "Visual Studio Installer (vswhere.exe) not found!"
    exit 1
}

Write-Host "Searching for Visual Studio..." -ForegroundColor Cyan
$vsPath = & $vswhere -latest -property installationPath
if (!$vsPath) {
    Write-Error "No Visual Studio installation found!"
    exit 1
}

Write-Host "Found Visual Studio at: $vsPath" -ForegroundColor Green

$vcvars = Join-Path $vsPath "VC\Auxiliary\Build\vcvars64.bat"
if (!(Test-Path $vcvars)) {
    Write-Error "vcvars64.bat not found at $vcvars"
    exit 1
}

Write-Host "Initializing MSVC environment..." -ForegroundColor Cyan
# Run vcvars64.bat and capture environment variables
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

# Mark environment as ready to prevent infinite recursion
$env:NMIS_MSVC_READY = "1"

# Avoid infinite loop: call tauri cli directly, not npm run tauri:dev
Write-Host "Environment ready! Starting Tauri dev..." -ForegroundColor Green
npx tauri dev
