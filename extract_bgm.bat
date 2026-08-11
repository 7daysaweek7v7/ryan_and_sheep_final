@echo off
chcp 65001 >nul
echo ========================================
echo   BGM 音频提取工具
echo ========================================
echo.

:: 创建 assets 目录
if not exist "assets" (
    mkdir "assets"
    echo [OK] 已创建 assets 目录
) else (
    echo [OK] assets 目录已存在
)

:: 查找 ffmpeg
set "FFMPEG="
where ffmpeg >nul 2>&1 && set "FFMPEG=ffmpeg"

if not defined FFMPEG (
    if exist "c:\Users\23063\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\vm\tools\app\ffmpeg\ffmpeg.exe" (
        set "FFMPEG=c:\Users\23063\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\vm\tools\app\ffmpeg\ffmpeg.exe"
    )
)

if not defined FFMPEG (
    echo [ERROR] 未找到 ffmpeg，请安装后重试
    pause
    exit /b 1
)

echo [OK]