@echo off
rem Wrapper for hermesc.exe — delegates all arguments to the real Windows binary.
rem Fixes Windows path issues where Gradle cannot invoke hermesc.exe directly.
set "HERMESC=%~dp0node_modules\react-native\sdks\hermesc\win64-bin\hermesc.exe"
"%HERMESC%" %*
exit /b %errorlevel%
