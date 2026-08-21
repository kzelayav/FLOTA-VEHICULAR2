$src = 'C:\Users\kzelaya2\.gemini\antigravity-ide\scratch\fleet-management'
$replacements = @{
    'Ã³' = 'ó'
    'Ã©' = 'é'
    'Ã¡' = 'á'
    'Ã­' = 'í'
    'Ãº' = 'ú'
    'Ã±' = 'ñ'
    'Ã" = 'Ó'
    'Ã‰' = 'É'
    'Ã' = 'Á'
    'Ã' = 'Í'
    'Ãš' = 'Ú'
    'Ã' = 'Ñ'
    'Ã¼' = 'ü'
    'Ãœ' = 'Ü'
    'Â¿' = '¿'
    'Â¡' = '¡'
    'â€œ' = '"'
    'â€\x9d' = '"'
    'â€\x98' = "'"
    'â€\x99' = "'"
    'â€"' = '—'
    'â€\x9c' = '€'
    'â€˜' = ''''
    'â€™' = ''''
}
$files = (Get-ChildItem -LiteralPath "$src\js" -File -Include *.js).FullName + (Get-ChildItem -LiteralPath "$src\css" -File -Include *.css).FullName + "$src\index.html"
foreach ($f in $files) {
    $c = Get-Content -LiteralPath $f -Raw -Encoding UTF8
    $orig = $c
    foreach ($kv in $replacements.GetEnumerator()) {
        $c = $c -replace [Regex]::Escape($kv.Key), $kv.Value
    }
    if ($c -ne $orig) {
        Set-Content -LiteralPath $f -Value $c -Encoding UTF8 -NoNewline
        Write-Host "CORREGIDO: $($f.Substring($src.Length+1))"
    } else {
        Write-Host "OK: $($f.Substring($src.Length+1))"
    }
}