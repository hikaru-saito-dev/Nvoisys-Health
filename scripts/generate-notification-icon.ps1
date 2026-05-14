# Regenerates Android notification small icon (white on transparent) for expo-notifications plugin.
# Run: powershell -NoProfile -File scripts/generate-notification-icon.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $root "app.json"))) {
  throw "Could not find app.json above scripts folder."
}

$iconsDir = Join-Path $root "assets/icons"
if (-not (Test-Path $iconsDir)) {
  New-Item -ItemType Directory -Path $iconsDir | Out-Null
}

function Save-Png([System.Drawing.Bitmap]$bitmap, [string]$path) {
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}

$ns = 256
$n = New-Object System.Drawing.Bitmap $ns, $ns, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gn = [System.Drawing.Graphics]::FromImage($n)
$gn.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$gn.Clear([System.Drawing.Color]::Transparent)
$wbrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$bellW = 140
$bellH = 100
$bx = ($ns - $bellW) / 2
$by = 45
$arc = New-Object System.Drawing.RectangleF ($bx), ($by), ($bellW), ($bellH * 0.75)
$path.AddArc($arc, 180, 180)
$path.AddLine([single]($bx + $bellW * 0.15), [single]($by + $bellH * 0.55), [single]($bx + $bellW * 0.35), [single]($by + $bellH))
$path.AddLine([single]($bx + $bellW * 0.65), [single]($by + $bellH), [single]($bx + $bellW * 0.85), [single]($by + $bellH * 0.55))
$gn.FillPath($wbrush, $path)
$gn.FillEllipse($wbrush, ($ns / 2 - 12), ($by + $bellH - 8), 24, 24)
$gn.FillEllipse($wbrush, ($ns / 2 - 10), ($by - 18), 20, 20)
$gn.Dispose()
Save-Png $n (Join-Path $iconsDir "notification_icon.png")

Write-Output "Wrote notification_icon.png to $iconsDir"
