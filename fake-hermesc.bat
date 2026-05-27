@echo off
rem Fake hermesc for Windows local builds.
rem Skips Hermes bytecode pre-compilation; the Hermes runtime interprets raw JS at startup.
rem Usage (same as real hermesc): fake-hermesc.bat -w -emit-binary -max-diagnostic-width=80 -out OUTPUT INPUT [flags]
setlocal EnableDelayedExpansion

set OUTPUT_FILE=
set INPUT_FILE=
set NEXT_IS_OUT=0

:loop
if "%~1"=="" goto done

if "!NEXT_IS_OUT!"=="1" (
    set "OUTPUT_FILE=%~1"
    set NEXT_IS_OUT=0
    shift
    goto loop
)

if "%~1"=="-out" (
    set NEXT_IS_OUT=1
    shift
    goto loop
)

rem Skip flags (start with -)
set "ARG=%~1"
if "!ARG:~0,1!"=="-" (
    shift
    goto loop
)

rem Positional argument = input file
set "INPUT_FILE=%~1"
shift
goto loop

:done
if "!OUTPUT_FILE!"=="" (
    echo [fake-hermesc] ERROR: -out argument missing 1>&2
    exit /b 1
)
if "!INPUT_FILE!"=="" (
    echo [fake-hermesc] ERROR: input file missing 1>&2
    exit /b 1
)

echo [fake-hermesc] Copying JS bundle (no bytecode pre-compilation)
copy /Y "!INPUT_FILE!" "!OUTPUT_FILE!" >nul
if !errorlevel! neq 0 (
    echo [fake-hermesc] ERROR: copy failed 1>&2
    exit /b 1
)
exit /b 0
