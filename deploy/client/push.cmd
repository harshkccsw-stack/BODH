@echo off
rem Windows launcher for push.sh, from cmd or PowerShell. Same arguments:
rem   deploy\client\push.cmd api
rem   deploy\client\push.cmd all --dry-run
rem Inside Git Bash, run deploy/client/push.sh directly instead.
rem
rem Git Bash on purpose, not whatever "bash" is on PATH: with WSL installed
rem that can be WSL's bash, which sees none of this machine's JDK, node or
rem ssh keys.
setlocal
set "GITBASH="
if exist "%ProgramFiles%\Git\bin\bash.exe" set "GITBASH=%ProgramFiles%\Git\bin\bash.exe"
if not defined GITBASH if exist "%LOCALAPPDATA%\Programs\Git\bin\bash.exe" set "GITBASH=%LOCALAPPDATA%\Programs\Git\bin\bash.exe"
if not defined GITBASH for /f "delims=" %%G in ('where git.exe 2^>nul') do if not defined GITBASH if exist "%%~dpG..\bin\bash.exe" set "GITBASH=%%~dpG..\bin\bash.exe"
if not defined GITBASH (
  echo push: Git Bash not found - install Git for Windows ^(winget install Git.Git^) 1>&2
  exit /b 1
)
rem Forward slashes: push.sh finds the repo with dirname "$0", which does not
rem split on backslashes.
set "SCRIPT=%~dp0push.sh"
set "SCRIPT=%SCRIPT:\=/%"
"%GITBASH%" "%SCRIPT%" %*
exit /b %ERRORLEVEL%
