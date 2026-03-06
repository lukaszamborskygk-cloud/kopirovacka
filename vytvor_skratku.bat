@echo off
title Kopirovacka - Vytvorenie skratky

:: Kontrola ci je Python nainstalovany
python --version >nul 2>&1
if errorlevel 1 (
    echo =======================================
    echo   CHYBA: Python nie je nainstalovany!
    echo   Stiahni ho z https://www.python.org
    echo =======================================
    pause
    exit /b 1
)

:: Instalacia zavislosti
echo Kontrolujem zavislosti...
pip install -r requirements.txt -q
echo.

:: Vytvorenie skratky na plochu
echo Vytvarim skratku na plochu...
powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$desktop = $ws.SpecialFolders('Desktop'); " ^
  "$sc = $ws.CreateShortcut(\"$desktop\Kopirovacka.lnk\"); " ^
  "$sc.TargetPath = (Get-Command pythonw).Source; " ^
  "$sc.Arguments = '\"' + '%~dp0clipboard_manager.pyw' + '\"'; " ^
  "$sc.WorkingDirectory = '%~dp0'; " ^
  "$sc.Description = 'Kopirovacka - Multi-Clipboard Manager'; " ^
  "$sc.Save(); " ^
  "Write-Host 'Skratka bola uspesne vytvorena na ploche!'"

echo.
echo =========================================
echo   Hotovo! Na ploche mas skratku
echo   "Kopirovacka" - mozes ju pripnut
echo   na panel uloh (pravy klik na nu
echo   a zvolit "Pripnut na panel uloh")
echo =========================================
pause
