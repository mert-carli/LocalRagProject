$WScriptShell = New-Object -ComObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path -Path $DesktopPath -ChildPath "Local RAG Assistant.lnk"
$TargetBatch = Join-Path -Path $PSScriptRoot -ChildPath "Baslat.bat"
$WorkingDir = $PSScriptRoot

$Shortcut = $WScriptShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $TargetBatch
$Shortcut.WorkingDirectory = $WorkingDir
$Shortcut.WindowStyle = 1
$Shortcut.Description = "Local RAG Assistant - Yerel Yapay Zeka Asistani"
$Shortcut.Save()

Write-Host "Masaustu kisayolu basariyla olusturuldu: $ShortcutPath"
