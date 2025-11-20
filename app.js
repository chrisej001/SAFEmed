require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_TOKEN = process.env.API_TOKEN;
const BASE_URL = process.env.BASE_URL || 'https://hackathon-api.aheadafrica.org/'; // Replace with actual Dorra base URL if different

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Hardcoded PharmaVigilance Interactions (for demo - expand as needed)
const DRUG_INTERACTIONS = {
  'aspirin_amlodipine': { risk: 'High', message: 'Blood pressure increase risk' },
  'ibuprofen_warfarin': { risk: 'High', message: 'Bleeding risk' },
  'paracetamol_codeine': { risk: 'Medium', message: 'Liver toxicity' },
  'amoxicillin_penicillin': { risk: 'High', message: 'Allergy cross-reaction' },
  'aspirin_ibuprofen': { risk: 'Medium', message: 'GI bleeding' }
};

// Helper: API Call Function
async function apiCall(endpoint, method = 'GET', data = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: { Authorization: `Token ${API_TOKEN}` },
      data
    };
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error('API Error:', error.response?.data || error.message);
    throw new Error(`API Error: ${error.message}`);
  }
}

// Route 1: Home/Dashboard
app.get('/', async (req, res) => {
  try {
    const patients = await apiCall('/v1/patients'); // List patients
    res.render('index', { patients: patients.results || [] });
  } catch (err) {
    res.render('index', { patients: [], error: err.message });
  }
});

// Route 2: Create Patient via AI Prompt
app.post('/create-patient', async (req, res) => {
  const { prompt } = req.body;
  try {
    const result = await apiCall('/v1/ai/patient', 'POST', { prompt });
    res.json({ success: true, patientId: result.id });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Route 3: Create Encounter via AI Prompt
app.post('/create-encounter', async (req, res) => {
  const { prompt, patientId } = req.body;
  try {
    await apiCall('/v1/ai/emr', 'POST', { prompt, patient: parseInt(patientId) });
    const dashboard = await getPatientDashboard(patientId);
    res.json({ success: true, ...dashboard });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Route 4: Get Patient Dashboard (with Alerts)
async function getPatientDashboard(patientId) {
  const [patient, encounters, medications] = await Promise.all([
    apiCall(`/v1/patients/${patientId}`),
    apiCall(`/v1/patients/${patientId}/encounters`),
    apiCall(`/v1/patients/${patientId}/medications`)
  ]);

  // Compute Alerts
  const allergies = patient.allergies || [];
  const meds = medications.results || [];
  let alerts = [];

  // Allergy Check
  meds.forEach(med => {
    if (allergies.some(allergy => med.name?.toLowerCase().includes(allergy.toLowerCase()))) {
      alerts.push({ type: 'Allergy', message: `Allergic to ${med.name}!`, risk: 'High' });
    }
  });

  // Interaction Check (simple string match for demo)
  for (let i = 0; i < meds.length; i++) {
    for (let j = i + 1; j < meds.length; j++) {
      const key = [meds[i].name?.toLowerCase(), meds[j].name?.toLowerCase()].sort().join('_');
      if (DRUG_INTERACTIONS[key]) {
        alerts.push({ ...DRUG_INTERACTIONS[key], type: 'Interaction' });
      }
    }
  }

  return { patient, encounters: encounters.results || [], medications: meds, alerts };
}

app.get('/dashboard/:id', async (req, res) => {
  try {
    const dashboard = await getPatientDashboard(req.params.id);
    res.render('dashboard', dashboard);
  } catch (err) {
    res.render('dashboard', { error: err.message });
  }
});

// Route 5: Register Webhook
app.post('/register-webhook', async (req, res) => {
  const webhookUrl = `${req.protocol}://${req.get('host')}/webhook`; // For local, use ngrok for public URL
  try {
    await apiCall('/v1/auth/webhook/register', 'POST', { url: webhookUrl });
    await apiCall('/v1/auth/webhook/test', 'POST', { url: webhookUrl });
    res.json({ success: true, message: 'Webhook registered & tested!' });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Route 6: Webhook Receiver (for Live Alerts)
app.post('/webhook', (req, res) => {
  console.log('🔔 LIVE ALERT:', req.body); // In prod: Update UI or notify
  res.json({ received: true });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 SafeMed Dashboard running on http://localhost:${PORT}`);
  console.log('📝 Demo Tip: Use ngrok for webhook testing locally!');
});
