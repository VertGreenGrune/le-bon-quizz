# Builds images/mosaique.jpg, the crowd picture of the two « point sur l'image » questions:
# the 20 avatar portraits of the app (apps/web/public/avatars, 192 px) in a 5 x 4 grid, in a
# fixed shuffled order, without names. Deterministic: same layout, same picture.
# Run with Windows PowerShell:  powershell -ExecutionPolicy Bypass -File make-mosaic.ps1
# If you change $layout, update the two PIN zones in quiz.json (see README.md).
Add-Type -AssemblyName System.Drawing

$layout = @(
  'joker',   'talia',   'bullock',   'catwoman', 'robin',
  'penguin', 'batgirl', 'hill',      'freeze',   'ivy',
  'alfred',  'montoya', 'scarecrow', 'harley',   'bane',
  'riddler', 'gordon',  'manbat',    'twoface',  'batman'
)
$cols = 5; $rows = 4; $tile = 192; $gap = 8
$width = $cols * $tile + ($cols + 1) * $gap   # 1008
$height = $rows * $tile + ($rows + 1) * $gap  # 808

$avatars = Join-Path $PSScriptRoot '..\..\..\..\apps\web\public\avatars'
$out = Join-Path $PSScriptRoot 'mosaique.jpg'

$bitmap = New-Object System.Drawing.Bitmap $width, $height
$g = [System.Drawing.Graphics]::FromImage($bitmap)
$g.Clear([System.Drawing.Color]::FromArgb(17, 17, 17))
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
for ($i = 0; $i -lt $layout.Count; $i++) {
  $col = $i % $cols; $row = [math]::Floor($i / $cols)
  $img = [System.Drawing.Image]::FromFile((Join-Path $avatars ($layout[$i] + '.jpg')))
  $g.DrawImage($img, $gap + $col * ($tile + $gap), $gap + $row * ($tile + $gap), $tile, $tile)
  $img.Dispose()
}
$g.Dispose()

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 90L
$bitmap.Save($out, $codec, $params)
$bitmap.Dispose()

# Zone centre of each portrait, in picture fractions (for quiz.json)
for ($i = 0; $i -lt $layout.Count; $i++) {
  $col = $i % $cols; $row = [math]::Floor($i / $cols)
  $x = ($gap + $col * ($tile + $gap) + $tile / 2) / $width
  $y = ($gap + $row * ($tile + $gap) + $tile / 2) / $height
  '{0,-10} x={1:0.000} y={2:0.000}' -f $layout[$i], $x, $y
}
"Wrote $out ($width x $height)"
