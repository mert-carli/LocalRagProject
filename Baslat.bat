@echo off
title Local-RAG-Assistant Yapay Zeka Asistani
cd /d "%~dp0"
echo ===================================================
echo     Local-RAG-Assistant Yapay Zeka Asistani
echo ===================================================
echo.

echo [1/2] Ollama Yapay Zeka Servisi Kontrol Ediliyor...
tasklist /FI "IMAGENAME eq ollama.exe" 2>NUL | find /I /N "ollama.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo Ollama servisi zaten calisiyor.
) else (
    echo Ollama servis arka planda baslatiliyor...
    start /b ollama serve >nul 2>&1
    timeout /t 3 /nobreak >nul
)

echo [2/2] Web Sunucusu Baslatiliyor...
echo Lutfen sunucunun hazir olmasini bekleyin. Tarayici otomatik acilacaktir...
echo.
node src/server.js
pause
