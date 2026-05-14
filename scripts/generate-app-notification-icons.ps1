# Generates app icon + Android notification icon (white on transparent) using System.Drawing.
# Run: powershell -NoProfile -File scripts/generate-app-notification-icons.ps1
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

# --- App icon 1024: indigo #1E1B4B + white medical plus ---
$size = 1024
$app = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($app)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::FromArgb(255, 30, 27, 75))
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([single]($size * 0.09))
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$cx = $size / 2
$cy = $size / 2
$arm = $size * 0.22
$g.DrawLine($pen, [single]($cx - $arm), [single]$cy, [single]($cx + $arm), [single]$cy)
$g.DrawLine($pen, [single]$cx, [single]($cy - $arm), [single]$cx, [single]($cy + $arm))
$g.Dispose()
Save-Png $app (Join-Path $iconsDir "app_icon.png")

# --- Android notification: white bell silhouette on transparent (256) ---
$ns = 256
$n = New-Object System.Drawing.Bitmap $ns, $ns, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gn = [System.Drawing.Graphics]::FromImage($n)
$gn.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$gn.Clear([System.Drawing.Color]::Transparent)
$wbrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
# Bell body (rounded trapezoid approximated with filled path)
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
# Clapper (small circle)
$gn.FillEllipse($wbrush, ($ns / 2 - 12), ($by + $bellH - 8), 24, 24)
# Top knob
$gn.FillEllipse($wbrush, ($ns / 2 - 10), ($by - 18), 20, 20)
$gn.Dispose()
Save-Png $n (Join-Path $iconsDir "notification_icon.png")

Write-Output "Wrote app_icon.png and notification_icon.png to $iconsDir"
