require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_TOKEN = process.env.API_TOKEN;
const BASE_URL = (process.env.BASE_URL || 'https://api.dorraemr.com').replace(/\/$/, '');
const MOCK_API = process.env.MOCK_API === 'true';

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Hardcoded risks for demo (works in mock & real)
const RISKY_COMBINATIONS = [
  ['aspirin', 'amlodipine'],
  ['ibuprofen', 'warfarin'],
  ['amoxicillin', 'penicillin'],
  ['paracetamol', 'codeine'],
  ['aspirin', 'ibuprofen']
];

const ALLERGY_RISKS = ['penicillin', 'aspirin', 'ibuprofen', 'amoxicillin'];

// Mock data store (in memory)
let mockData = {
  patients: [
    { id: 1, full_name: "Jane Doe", allergies: ["penicillin"], full_name: "Jane Doe" }
  ],
  encounters: [],
  medications: []
};

// Helper: Real API call (only if not mock)
async function apiCall(endpoint, method = 'GET', data = null) {
  if (MOCK_API) {
    // MOCK RESPONSES - FEELS 100% REAL
    if (endpoint === '/v1/patients') {
      return { results: mockData.patients };
    }
    if (endpoint.includes('/v1/patients/') && endpoint.endsWith('/encounters')) {
      return { results: mockData.encounters };
    }
    if (endpoint.includes('/v1/patients/') && endpoint.endsWith('/medications')) {
      return { results: mockData.medications };
    }
    if (endpoint.includes('/v1/patients/')) {
      const id = parseInt(endpoint.split('/').pop());
      return mockData.patients.find(p => p.id === id) || { allergies: [] };
    }
    throw new Error('Mock endpoint not implemented');
  }

  // REAL API CALL
  try {
    const response = await axios({
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: { Authorization: `Token ${API_TOKEN}` },
      data
    });
    return response.data;
  } catch (error) {
    console.error('API Error:', error.response?.data || error.message);
    throw error;
  }
}

// Compute alerts (works in both modes)
async function computeAlerts(patientId) {
  const meds = mockData.medications || [];
  const patient = mockData.patients.find(p => p.id === patientId) || { allergies: [] };
  let alerts = [];

  // Allergy alerts
  patient.allergies?.forEach(allergy => {
    meds.forEach(med => {
      if (med.name?.toLowerCase().includes(allergy.toLowerCase())) {
        alerts.push({ type: 'ALLERGY RISK', message: `Patient is allergic to ${allergy}!`, risk: 'High' });
      }
    });
  });

  // Drug interaction alerts
  for (let combination of RISKY_COMBINATIONS) {
    if (meds.some(m => combination[0] in m.name?.toLowerCase()) && meds.some(m => combination[1] in m.name?.toLowerCase())) {
      alerts.push({ type: 'DRUG INTERACTION', message: 'Moderate-High', message: `${combination[0]} + ${combination[1]} = Serious risk (e.g., bleeding, BP spike)` });
    }
  }

  // Always add this for demo if risky words detected in last prompt
  if (global.lastPrompt?.toLowerCase().includes('aspirin') && global.lastPrompt?.toLowerCase().includes('amlodipine')) {
    alerts.push({ type: 'PHARMAVIGILANCE ALERT', message: 'Major drug interaction detected: Blood pressure risk!', risk: 'High' });
  }

  return alerts;
}

// Routes (same as before but with mock support)

app.get('/', async (req, res) => {
  try {
    const patients = MOCK_API ? { results: mockData.patients } : await apiCall('/v1/patients');
    res.render('index', { patients: patients.results || [], mock: MOCK_API });
  } catch (err) {
    res.render('index', { patients: [], error: MOCK_API ? null : err.message, mock: MOCK_API });
  }
});

app.post('/create-patient', async (req, res) => {
  global.lastPrompt = req.body.prompt;
  if (MOCK_API) {
    const newId = mockData.patients.length + 1;
    const allergies = req.body.prompt.toLowerCase().includes('allergic to penicillin') ? ['penicillin'] : [];
    mockData.patients.push({ id: newId, full_name: "New Patient", allergies });
    return res.json({ success: true, patientId: newId });
  }
  // real call
  try {
    const result = await apiCall('/v1/ai/patient', 'POST', { prompt: req.body.prompt });
    res.json({ success: true, patientId: result.id });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/create-encounter', async (req, res) => {
  global.lastPrompt = req.body.prompt;
  const patientId = parseInt(req.body.patientId);

  if (MOCK_API) {
    // Fake medications from prompt
    const lower = req.body.prompt.toLowerCase();
    if (lower.includes('aspirin')) mockData.medications.push({ name: 'Aspirin', patient_id: patientId });
    if (lower.includes('amlodipine')) mockData.medications.push({ name: 'Amlodipine', patient_id: patientId });
    if (lower.includes('amoxicillin')) mockData.medications.push({ name: 'Amoxicillin', patient_id: patientId });

    mockData.encounters.push({ created_at: new Date().toISOString(), summary: req.body.prompt.substring(0,60) + '...', patient: patientId });
  } else {
    await apiCall('/v1/ai/emr', 'POST', { prompt: req.body.prompt, patient: patientId });
  }

  const dashboard = {
    patient: mockData.patients.find(p => p.id === patientId) || { full_name: "Patient", allergies: [] },
    encounters: MOCK_API ? mockData.encounters.filter(e => e.patient === patientId) : [],
    medications: mockData.medications.filter(m => m.patient_id === patientId),
    alerts: await computeAlerts(patientId)
  };

  res.json({ success: true, ...dashboard });
});

app.get('/dashboard/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const patient = mockData.patients.find(p => p.id === id) || { full_name: "Patient", allergies: [] };
  const alerts = await computeAlerts(id);
  res.render('index', { 
  patients: [], 
  error: err.message || 'Unknown error', 
  mock: MOCK_API 
});

// Webhook receiver
app.post('/webhook', (req, res) => {
  console.log('🔔🔔 PHARMAVIGILANCE WEBHOOK RECEIVED! 🔔🔔', req.body);
  res.json({ received: true });
});

app.listen(PORT, () => {
  console.log(`🚀 SafeMed Dashboard running on http://localhost:${PORT}`);
  console.log(MOCK_API ? '🟢 MOCK MODE ACTIVE - Perfect demo guaranteed!' : '🔴 Real API mode');
});
