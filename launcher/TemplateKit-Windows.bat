@echo off
rem TemplateKit launcher (Windows): double-click to open the app in its own window.
rem Tip: installing the app (Settings > Install) also creates a desktop icon.
set "URL=https://tlsgusdlf33.github.io/A13/"

set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --app="%URL%"
  exit /b
)

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" (
  start "" "%CHROME%" --app="%URL%"
  exit /b
)

start "" "%URL%"
