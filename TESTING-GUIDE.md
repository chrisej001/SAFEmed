# 🚀 SafeMed - Quick Start & Testing Guide

## ✅ ALL ISSUES FIXED

All 15 identified issues have been resolved:
- ✓ API endpoint inconsistencies fixed
- ✓ Comprehensive error handling added
- ✓ Mock data structure corrected
- ✓ Dead code removed
- ✓ Input validation implemented
- ✓ Alert detection logic improved
- ✓ Logging middleware added
- ✓ Complete application flow tested
- ✓ Documentation created

## 🏃 HOW TO RUN THE PROJECT

### Method 1: Using npm (Recommended)
```powershell
# 1. Install dependencies (first time only)
npm install

# 2. Start the server
npm start

# 3. Open your browser
# Go to: http://localhost:3000
```

### Method 2: Using node directly
```powershell
node app.js
```

The server will display:
```
============================================================
🚀 SafeMed Server Running
📍 Port: 3000
🌐 URL: http://localhost:3000
🔧 Mode: MOCK (Development)
🔑 API Token: Not set (using mock)
📡 Base URL: https://hackathon-api.aheadafrica.org
============================================================
```

## 🧪 HOW TO TEST THE APPLICATION

### Automated Testing

Run the health check:
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/health"
```

Expected output:
```json
{
  "status": "ok",
  "mode": "mock",
  "timestamp": "2025-11-20T...",
  "apiConnected": true
}
```

### Manual Testing Scenarios

#### Test 1: Create a Patient with Allergies

1. Open http://localhost:3000
2. In the "Create New Patient" form, enter:
   ```
   New patient John Smith, allergic to penicillin
   ```
3. Click "➕ Create Patient"
4. **Expected Result**: ✅ Patient created! Patient appears in the list

#### Test 2: Trigger an Allergy Alert (Critical Test)

1. Click "View Dashboard & Alerts" for the patient you just created
2. In the "Add Encounter / Prescription" form, enter:
   ```
   Patient has bacterial infection. Prescribe amoxicillin 500mg.
   ```
3. Click "🚀 Add & Check Safety"
4. **Expected Result**: 
   - 🚨 RED ALERT BANNER appears
   - Alert message: "ALLERGY RISK: Patient is allergic to penicillin! Prescribed medication: Amoxicillin"
   - Risk level: High
   - **Why this works**: Amoxicillin is a penicillin-based antibiotic

#### Test 3: Trigger a Drug Interaction Alert

1. Create a new patient:
   ```
   New patient Jane Doe, no allergies
   ```
2. View the dashboard for Jane Doe
3. Add first medication:
   ```
   Patient has high blood pressure. Prescribe amlodipine 5mg.
   ```
4. Add second medication:
   ```
   Patient has headache. Prescribe aspirin 300mg.
   ```
5. **Expected Result**:
   - 🚨 RED ALERT BANNER
   - Alert: "DRUG INTERACTION: ASPIRIN + AMLODIPINE = Serious interaction risk"
   - Risk level: High

#### Test 4: Safe Medication (No Alerts)

1. Create a patient without allergies
2. Prescribe a single safe medication:
   ```
   Patient has fever. Prescribe paracetamol 500mg.
   ```
3. **Expected Result**: 
   - ✅ "No safety concerns detected. Patient is clear!"
   - Green success message

## 📊 Testing Dashboard Features

### View Patient Dashboard
```powershell
# Open dashboard for patient ID 1
Start-Process "http://localhost:3000/dashboard/1"
```

The dashboard shows:
- Patient information and allergies
- Real-time safety alerts
- Current medications table
- Recent encounters history
- Form to add new encounters

### Test Webhook Endpoint
```powershell
$body = @{ test = $true } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/webhook" -Method Post -Body $body -ContentType "application/json"
```

Expected output:
```json
{
  "received": true,
  "timestamp": "2025-11-20T..."
}
```

## 🔧 Configuration Options

### Development Mode (Default - No API needed)
The `.env` file is already configured for development:
```env
MOCK_API=true
PORT=3000
```

### Production Mode (Requires API Token)
To connect to real AHEAD Africa API:
1. Get your API token from AHEAD Africa
2. Edit `.env`:
   ```env
   MOCK_API=false
   API_TOKEN=your_actual_token_here
   BASE_URL=https://hackathon-api.aheadafrica.org
   ```
3. Restart the server

## 🛑 Stopping the Server

Press `Ctrl+C` in the terminal where the server is running

OR

```powershell
Stop-Process -Name node -Force
```

## 🐛 Troubleshooting

### Server won't start
**Problem**: Port 3000 already in use
```powershell
# Check what's using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID with actual process ID)
Stop-Process -Id <PID> -Force

# Or change the port in .env
PORT=3001
```

### "Cannot find module" error
```powershell
# Clean install
Remove-Item -Recurse -Force node_modules, package-lock.json
npm install
```

### Browser shows "Cannot GET /"
- Server is not running
- Check if you see the startup message in terminal
- Verify the port: http://localhost:3000

### No alerts showing up
- Verify you're using correct medication names: aspirin, amlodipine, amoxicillin, etc.
- Check that patient allergies were set during creation
- Look at browser console (F12) for JavaScript errors

## 📝 Quick Reference

### Detected Drug Interactions
- Aspirin + Amlodipine
- Ibuprofen + Warfarin  
- Amoxicillin + Penicillin allergy
- Paracetamol + Codeine
- Aspirin + Ibuprofen

### Supported Medication Names (for testing)
- aspirin
- amlodipine
- amoxicillin
- ibuprofen
- warfarin
- paracetamol
- codeine
- penicillin

### API Endpoints
- `GET /` - Home page
- `GET /dashboard/:id` - Patient dashboard
- `POST /create-patient` - Create patient
- `POST /create-encounter` - Add encounter
- `POST /webhook` - Webhook receiver
- `GET /health` - Health check

## ✨ What's Working Now

✅ Patient creation with AI prompts  
✅ Allergy detection and parsing  
✅ Drug interaction detection  
✅ Real-time safety alerts  
✅ Encounter tracking  
✅ Medication history  
✅ Visual alert system with color coding  
✅ Error handling and validation  
✅ Request logging  
✅ Mock API mode for development  
✅ Health monitoring  

## 🎯 Success Criteria

Your SafeMed application is working correctly when:

1. ✅ Server starts without errors
2. ✅ Home page loads and shows patient list
3. ✅ Can create patients with allergies
4. ✅ Allergy alerts trigger when prescribing conflicting medications
5. ✅ Drug interaction alerts show for risky combinations
6. ✅ Dashboard displays all patient information correctly
7. ✅ No JavaScript errors in browser console
8. ✅ All API endpoints respond correctly

## 🚀 You're Ready!

The application is fully functional and ready for testing and demonstration!

**Next Steps:**
1. Run `npm start`
2. Open http://localhost:3000
3. Test the scenarios above
4. Show off your pharmavigilance dashboard!

---

Built for AHEAD 2025 | All issues resolved ✓
