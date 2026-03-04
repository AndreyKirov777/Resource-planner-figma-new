# Start Resource Planning Application
# This script runs both backend and frontend servers

Write-Host "Starting Resource Planning Application..." -ForegroundColor Green

# Start backend server in background
Write-Host "Starting backend server..." -ForegroundColor Yellow
Start-Job -ScriptBlock {
    Set-Location $using:PWD
    npm run dev:server
} -Name "BackendServer"

# Wait a moment for backend to initialize
Start-Sleep -Seconds 3

# Start frontend dev server in background
Write-Host "Starting frontend dev server..." -ForegroundColor Yellow
Start-Job -ScriptBlock {
    Set-Location $using:PWD
    npm run dev
} -Name "FrontendServer"

# Wait a moment for frontend to initialize
Start-Sleep -Seconds 5

Write-Host "Application started successfully!" -ForegroundColor Green
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Backend: http://localhost:3001" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop both servers" -ForegroundColor Yellow

# Keep script running to maintain background jobs
try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
} finally {
    Write-Host "Stopping servers..." -ForegroundColor Yellow
    Get-Job | Stop-Job
    Get-Job | Remove-Job
    Write-Host "Servers stopped." -ForegroundColor Green
}
