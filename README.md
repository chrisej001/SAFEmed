# 🛡️ SafeMed - Real-Time Patient Safety Alert Dashboard

A healthcare application that provides real-time pharmavigilance alerts for drug interactions and allergy risks. Built for the AHEAD 2025 Dorra EMR Hackathon.

## ✨ Features

- **Patient Management**: Create and manage patient records with allergy information
- **AI-Powered Data Entry**: Use natural language prompts to create patients and encounters
- **Real-Time Safety Alerts**: Automatic detection of:
  - Drug-allergy interactions
  - Dangerous drug combinations
  - High-risk medication conflicts
- **Encounter Tracking**: Record clinical visits and prescriptions
- **Medication History**: Track all prescribed medications per patient
- **Visual Alert System**: High-priority warnings with color-coded risk levels

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/chrisej001/SAFEmed.git
   cd SAFEmed
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   # Copy the example environment file
   cp .env.example .env
   ```

4. **Start the application**
   ```bash
   npm start
   ```

5. **Open your browser**
   ```
   http://localhost:3000
   ```

## 🧪 Testing the Application

### Test Scenario 1: Create a Patient with Allergies

1. Go to http://localhost:3000
2. In the "Create New Patient" form, enter:
   ```
   New patient John Doe, allergic to penicillin
   ```
3. Click "➕ Create Patient"
4. You should see "✅ Patient created!" and the patient appears in the list

### Test Scenario 2: Trigger an Allergy Alert

1. Click "View Dashboard & Alerts" for the patient you just created
2. In the "Add Encounter / Prescription" form, enter:
   ```
   Patient has infection. Prescribe amoxicillin.
   ```
3. Click "🚀 Add & Check Safety"
4. **Expected Result**: You should see a **HIGH RISK** alert banner with:
   - "ALLERGY RISK: Patient is allergic to penicillin! Prescribed medication: Amoxicillin"
   - This is correct because amoxicillin is a penicillin-based antibiotic

### Test Scenario 3: Trigger a Drug Interaction Alert

1. Create a new patient:
   ```
   New patient Jane Smith, no allergies
   ```
2. View the dashboard for Jane Smith
3. Add an encounter:
   ```
   Patient has high blood pressure. Prescribe amlodipine.
   ```
4. Add another encounter:
   ```
   Patient has headache. Prescribe aspirin.
   ```
5. **Expected Result**: You should see a **HIGH RISK** alert:
   - "DRUG INTERACTION: ASPIRIN + AMLODIPINE = Serious interaction risk"

### Test Scenario 4: Safe Medication (No Alerts)

1. Create a patient without allergies
2. Prescribe a single, safe medication:
   ```
   Patient has fever. Prescribe paracetamol.
   ```
3. **Expected Result**: "✅ No safety concerns detected. Patient is clear!"

## 🔧 Configuration

### Environment Variables

Edit `.env` file:

```env
# Development Mode (uses mock data - no real API needed)
MOCK_API=true
PORT=3000

# Production Mode (requires real API credentials)
MOCK_API=false
API_TOKEN=your_api_token_from_ahead
BASE_URL=https://hackathon-api.aheadafrica.org
```

### Running in Different Modes

**Development Mode (Mock Data)**
- No API token required
- All data stored in memory
- Perfect for testing and development
- Set `MOCK_API=true` in `.env`

**Production Mode (Real API)**
- Requires API token from AHEAD Africa
- Connects to real Dorra EMR system
- Set `MOCK_API=false` in `.env`
- Add your `API_TOKEN` in `.env`

## 📋 API Endpoints

### Frontend Routes
- `GET /` - Home page with patient list
- `GET /dashboard/:id` - Patient dashboard with alerts
- `POST /create-patient` - Create new patient
- `POST /create-encounter` - Add encounter/prescription
- `POST /webhook` - Receive pharmavigilance alerts
- `GET /health` - Health check endpoint

## 🧩 Project Structure

```
SAFEmed/
├── app.js              # Main server file (Express backend)
├── package.json        # Dependencies and scripts
├── .env               # Environment configuration (not in repo)
├── .env.example       # Example environment file
├── public/
│   └── styles.css     # Custom styles (if any)
├── views/
│   └── index.ejs      # Main dashboard template
└── README.md          # This file
```

## 🛠️ Technology Stack

- **Backend**: Node.js + Express
- **Templating**: EJS
- **HTTP Client**: Axios
- **Styling**: Custom CSS with animations
- **API Integration**: Dorra EMR + PharmaVigilance APIs

## 🔍 Known Drug Interactions Detected

The system currently monitors these high-risk combinations:

1. Aspirin + Amlodipine
2. Ibuprofen + Warfarin
3. Amoxicillin + Penicillin allergy
4. Paracetamol + Codeine (high doses)
5. Aspirin + Ibuprofen

## 🐛 Troubleshooting

### Server won't start
```bash
# Check if port 3000 is already in use
netstat -ano | findstr :3000

# Or change the port in .env
PORT=3001
```

### "Cannot find module" error
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Alerts not showing
- Verify you're using the exact medication names (aspirin, amlodipine, etc.)
- Check browser console for JavaScript errors
- Ensure patient allergies are set correctly

## 📝 Development Notes

### Adding New Drug Interactions

Edit `app.js`, find the `RISKY_COMBINATIONS` array:

```javascript
const RISKY_COMBINATIONS = [
  ['aspirin', 'amlodipine'],
  ['your-drug-a', 'your-drug-b'],  // Add new combinations here
];
```

### Adding New Allergies

Edit `app.js`, find the `ALLERGY_RISKS` array:

```javascript
const ALLERGY_RISKS = ['penicillin', 'aspirin', 'your-allergen'];
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project was built for the AHEAD 2025 Hackathon.

## 👥 Authors

- Your Name - [chrisej001](https://github.com/chrisej001)

## 🙏 Acknowledgments

- AHEAD Africa for the hackathon opportunity
- Dorra EMR for the API access
- PharmaVigilance API for drug safety data

---

**Built with ❤️ for AHEAD 2025 • Reducing burnout, saving lives**
