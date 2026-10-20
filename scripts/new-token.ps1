# Prints a random 64-character hex token (32 random bytes) for the Jarvis webhook.
# Works in Windows PowerShell 5.1 and PowerShell 7.
#
#   .\scripts\new-token.ps1 | Set-Clipboard     # copies it without leaving it in the window
#
# Never commit the token. See docs/api.md for where it goes and how to rotate it.

$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $rng.GetBytes($bytes)
}
finally {
    $rng.Dispose()
}
($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
