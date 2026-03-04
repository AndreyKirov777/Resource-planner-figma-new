REM @echo off
REM Resource Planning Application Startup Script
REM This script starts both the backend server and frontend development server


REM Start the backend server in a new window
echo 🔧 Starting backend server...
start "Backend Server" cmd /k "npm run server"

REM Wait a moment for the server to start
timeout /t 3 /nobreak >nul

REM Start the frontend development server
echo 🎨 Starting frontend development server...
echo 📱 Frontend will be available at: http://localhost:3000
echo 🔧 Backend API will be available at: http://localhost:3001
echo.
echo Press Ctrl+C to stop the frontend server
echo Close the backend window to stop the backend server
echo.

npm run dev
