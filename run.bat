@echo off
title Kopirovacka

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

:: Instalacia zavislosti (ak este nie su)
echo Kontrolujem zavislosti...
pip install -r requirements.txt -q
echo.

:: Spustenie programu na pozadí bez okna termianlu
echo Spustam Kopirovacku (na pozadi)...
start pythonw clipboard_manager.pyw
exit
