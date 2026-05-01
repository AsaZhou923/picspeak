param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)

Add-Type -AssemblyName System.Drawing

$width = 1200
$height = 630
$outputPath = Join-Path $RepoRoot 'frontend\public\og-product.png'

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function Draw-CoverImage($graphics, [string]$path, [System.Drawing.RectangleF]$rect, [float]$radius) {
  $image = [System.Drawing.Image]::FromFile($path)
  try {
    $scale = [Math]::Max($rect.Width / $image.Width, $rect.Height / $image.Height)
    $drawW = $image.Width * $scale
    $drawH = $image.Height * $scale
    $drawX = $rect.X + ($rect.Width - $drawW) / 2
    $drawY = $rect.Y + ($rect.Height - $drawH) / 2
    $clip = New-RoundedRectPath $rect.X $rect.Y $rect.Width $rect.Height $radius
    $state = $graphics.Save()
    $graphics.SetClip($clip)
    $graphics.DrawImage($image, [System.Drawing.RectangleF]::new($drawX, $drawY, $drawW, $drawH))
    $graphics.Restore($state)
    $clip.Dispose()
  } finally {
    $image.Dispose()
  }
}

function Draw-ContainImage($graphics, [string]$path, [System.Drawing.RectangleF]$rect) {
  $image = [System.Drawing.Image]::FromFile($path)
  try {
    $scale = [Math]::Min($rect.Width / $image.Width, $rect.Height / $image.Height)
    $drawW = $image.Width * $scale
    $drawH = $image.Height * $scale
    $drawX = $rect.X + ($rect.Width - $drawW) / 2
    $drawY = $rect.Y + ($rect.Height - $drawH) / 2
    $graphics.DrawImage($image, [System.Drawing.RectangleF]::new($drawX, $drawY, $drawW, $drawH))
  } finally {
    $image.Dispose()
  }
}

function Draw-Card($graphics, [float]$x, [float]$y, [float]$w, [float]$h, [string]$imagePath, [string]$label, [string]$caption) {
  $shadowPath = New-RoundedRectPath ($x + 10) ($y + 14) $w $h 24
  $shadow = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(90, 0, 0, 0))
  $graphics.FillPath($shadow, $shadowPath)
  $shadow.Dispose()
  $shadowPath.Dispose()

  $cardPath = New-RoundedRectPath $x $y $w $h 24
  $cardBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(238, 28, 24, 20))
  $borderPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(120, 207, 174, 112), 2)
  $graphics.FillPath($cardBrush, $cardPath)
  $graphics.DrawPath($borderPen, $cardPath)
  $cardBrush.Dispose()
  $borderPen.Dispose()
  $cardPath.Dispose()

  $imageRect = [System.Drawing.RectangleF]::new($x + 12, $y + 12, $w - 24, $h - 72)
  Draw-CoverImage $graphics $imagePath $imageRect 16

  $labelFont = [System.Drawing.Font]::new('Segoe UI', 13, [System.Drawing.FontStyle]::Bold)
  $captionFont = [System.Drawing.Font]::new('Segoe UI', 11, [System.Drawing.FontStyle]::Regular)
  $gold = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 215, 178, 105))
  $muted = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 184, 178, 165))
  $graphics.DrawString($label, $labelFont, $gold, [System.Drawing.PointF]::new($x + 18, $y + $h - 52))
  $graphics.DrawString($caption, $captionFont, $muted, [System.Drawing.PointF]::new($x + 18, $y + $h - 29))
  $labelFont.Dispose()
  $captionFont.Dispose()
  $gold.Dispose()
  $muted.Dispose()
}

$bitmap = [System.Drawing.Bitmap]::new($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

try {
  $bgRect = [System.Drawing.Rectangle]::new(0, 0, $width, $height)
  $bg = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $bgRect,
    [System.Drawing.Color]::FromArgb(255, 18, 16, 14),
    [System.Drawing.Color]::FromArgb(255, 55, 42, 31),
    15
  )
  $graphics.FillRectangle($bg, $bgRect)
  $bg.Dispose()

  $goldWash = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $goldWash.AddEllipse(620, -210, 620, 520)
  $goldBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(38, 218, 177, 95))
  $graphics.FillPath($goldBrush, $goldWash)
  $goldBrush.Dispose()
  $goldWash.Dispose()

  $logoPath = Join-Path $RepoRoot 'frontend\public\logo.png'
  Draw-ContainImage $graphics $logoPath ([System.Drawing.RectangleF]::new(72, 64, 54, 54))

  $brandFont = [System.Drawing.Font]::new('Segoe UI', 22, [System.Drawing.FontStyle]::Bold)
  $headlineFont = [System.Drawing.Font]::new('Georgia', 46, [System.Drawing.FontStyle]::Regular)
  $bodyFont = [System.Drawing.Font]::new('Segoe UI', 18, [System.Drawing.FontStyle]::Regular)
  $chipFont = [System.Drawing.Font]::new('Segoe UI', 15, [System.Drawing.FontStyle]::Bold)
  $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 246, 241, 229))
  $muted = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 203, 195, 178))
  $goldText = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 220, 181, 105))

  $graphics.DrawString('PicSpeak', $brandFont, $white, [System.Drawing.PointF]::new(140, 78))
  $graphics.DrawString('AI photo critique', $headlineFont, $white, [System.Drawing.PointF]::new(72, 156))
  $graphics.DrawString('meets GPT Image 2', $headlineFont, $goldText, [System.Drawing.PointF]::new(72, 218))
  $graphics.DrawString('Score photos, generate visual references, and study real gallery examples in one photography workflow.', $bodyFont, $muted, [System.Drawing.RectangleF]::new(76, 324, 470, 105))

  $chips = @(
    @{ Text = 'Critique scorecards'; X = 76; Y = 464 },
    @{ Text = 'AI Create prompts'; X = 312; Y = 464 },
    @{ Text = 'Gallery examples'; X = 76; Y = 518 }
  )
  foreach ($chipItem in $chips) {
    $chip = $chipItem.Text
    $size = $graphics.MeasureString($chip, $chipFont)
    $chipX = [float]$chipItem.X
    $chipY = [float]$chipItem.Y
    $rect = [System.Drawing.RectangleF]::new($chipX, $chipY, $size.Width + 30, 42)
    $path = New-RoundedRectPath $rect.X $rect.Y $rect.Width $rect.Height 15
    $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(40, 226, 184, 102))
    $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(95, 226, 184, 102), 1)
    $graphics.FillPath($brush, $path)
    $graphics.DrawPath($pen, $path)
    $graphics.DrawString($chip, $chipFont, $goldText, [System.Drawing.PointF]::new($chipX + 15, $chipY + 11))
    $brush.Dispose()
    $pen.Dispose()
    $path.Dispose()
  }

  $reviewPath = Join-Path $RepoRoot 'docs\assets\screenshots\review.jpg'
  $galleryPath = Join-Path $RepoRoot 'docs\assets\screenshots\gallery.jpg'
  $createPath = Join-Path $RepoRoot 'frontend\public\generation-prompt-examples\photo-bodega-night-musician.jpg'

  Draw-Card $graphics 626 58 256 330 $reviewPath 'AI critique' 'Scores + next steps'
  Draw-Card $graphics 892 98 236 282 $createPath 'AI Create' 'GPT Image 2 prompts'
  Draw-Card $graphics 700 398 398 160 $galleryPath 'Gallery' 'Public examples'

  $brandFont.Dispose()
  $headlineFont.Dispose()
  $bodyFont.Dispose()
  $chipFont.Dispose()
  $white.Dispose()
  $muted.Dispose()
  $goldText.Dispose()

  $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}

Write-Output $outputPath
