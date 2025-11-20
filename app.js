require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_TOKEN = process.env.API_TOKEN || '';
const BASE_URL = (process.env.BASE_URL || 'https://hackathon-api.aheadafrica.org').replace(/\/$/, '');
let MOCK_API = process.env.MOCK_API === 'true'; // boolean

// Basic middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});
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

// In-memory mock store
let mockData = {
  patients: [
    { id: 1, full_name: "Jane Doe", allergies: ["penicillin"] }
  ],
  encounters: [],
  medications: []
};

// Helper: build auth headers
function authHeaders() {
  return API_TOKEN ? { Authorization: `Token ${API_TOKEN}` } : {};
}

// Helper: safe axios wrapper with fallback to mock
async function apiCall(endpoint, method = 'GET', data = null) {
  if (!endpoint.startsWith('/')) endpoint = '/' + endpoint;

  if (MOCK_API) return mockResponseFor(endpoint, method, data);

  try {
    const url = `${BASE_URL}${endpoint}`;
    const resp = await axios({
      method,
      url,
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      data,
      timeout: 10000
    });
    return resp.data;
  } catch (err) {
    console.error('API Error:', err.response?.status, err.response?.data || err.message);

    const message = err.message || '';
    if (message.includes('ENOTFOUND') || message.includes('ECONNREFUSED') || (err.response && err.response.status >= 500)) {
      console.warn('Remote API unreachable — using mock fallback.');
      return mockResponseFor(endpoint, method, data);
    }

    const thrown = new Error(err.response?.data?.message || err.message || 'API request failed');
    thrown.status = err.response?.status;
    throw thrown;
  }
}

// Mock responses
function mockResponseFor(endpoint, method, data) {
  if (endpoint === '/v1/patients' && method === 'GET') return { count: mockData.patients.length, results: mockData.patients };
  if (endpoint.match(/^\/v1\/patients\/\d+$/) && method === 'GET') {
    const id = parseInt(endpoint.split('/').pop());
    const p = mockData.patients.find(x => x.id === id);
    return p || {};
  }
  if (endpoint.match(/^\/v1\/patients\/\d+\/encounters/) && method === 'GET') {
    const id = parseInt(endpoint.split('/')[3]);
    return { count: mockData.encounters.filter(e => e.patient === id).length, results: mockData.encounters.filter(e => e.patient === id) };
  }
  if (endpoint.match(/^\/v1\/patients\/\d+\/medications/) && method === 'GET') {
    const id = parseInt(endpoint.split('/')[3]);
    return { count: mockData.medications.filter(m => m.patient_id === id).length, results: mockData.medications.filter(m => m.patient_id === id) };
  }
  if (endpoint === '/v1/ai/patient' && method === 'POST') {
    const newId = mockData.patients.length + 1;
    const prompt = (data?.prompt || '').toString();
    const allergies = prompt.toLowerCase().includes('allergic to penicillin') ? ['penicillin'] : [];
    const created = { id: newId, full_name: `Patient ${newId}`, allergies };
    mockData.patients.push(created);
    return { status: true, status_code: 201, message: 'success', id: newId };
  }
  if (endpoint === '/v1/ai/emr' && method === 'POST') {
    const patientId = parseInt(data?.patient) || null;
    const summary = (data?.prompt || '').toString().substring(0, 140);
    const created = { id: mockData.encounters.length + 1, created_at: new Date().toISOString(), summary, patient: patientId, encounter_medications: [] };
    const lower = (data?.prompt || '').toLowerCase();
    if (lower.includes('aspirin')) mockData.medications.push({ name: 'Aspirin', patient_id: patientId });
    if (lower.includes('amlodipine')) mockData.medications.push({ name: 'Amlodipine', patient_id: patientId });
    if (lower.includes('amoxicillin')) mockData.medications.push({ name: 'Amoxicillin', patient_id: patientId });
    mockData.encounters.push(created);
    return { status: true, status_code: 201, message: 'created', resource: 'Encounter', id: created.id };
  }
  return {};
}

// Compute alerts
async function computeAlerts(patientId, medsFromApi = null, patientFromApi = null) {
  const meds = medsFromApi || (mockData.medications || []);
  const patient = patientFromApi || mockData.patients.find(p => p.id === patientId) || { allergies: [] };
  let alerts = [];

  const allergies = Array.isArray(patient.allergies) ? patient.allergies : (patient.allergies ? [patient.allergies] : []);
  allergies.forEach(allergy => {
    meds.forEach(med => {
      const medName = (med.name || med.medication_name || '').toLowerCase();
      if (allergy && medName.includes(allergy.toLowerCase())) alerts.push({ type: 'ALLERGY RISK', message: `Patient is allergic to ${allergy}!`, risk: 'High' });
    });
  });

  for (let combo of RISKY_COMBINATIONS) {
    const [a, b] = combo;
    const hasA = meds.some(m => (m.name || '').toLowerCase().includes(a));
    const hasB = meds.some(m => (m.name || '').toLowerCase().includes(b));
    if (hasA && hasB) alerts.push({ type: 'DRUG INTERACTION', message: `${a} + ${b} = Serious risk`, risk: 'High' });
  }

  if (global.lastPrompt && global.lastPrompt.toLowerCase().includes('aspirin') && global.lastPrompt.toLowerCase().includes('amlodipine')) {
    alerts.push({ type: 'PHARMAVIGILANCE ALERT', message: 'Major drug interaction detected', risk: 'High' });
  }

  return alerts;
}

// ROUTES

// Home - list patients
app.get('/', async (req, res) => {
  try {
    const patients = MOCK_API ? { results: mockData.patients } : await apiCall('/v1/patients');
    res.render('index', { patients: patients.results || [], mock: MOCK_API, dashboard: null, error: null });
  } catch (err) {
    res.render('index', { patients: [], error: MOCK_API ? null : err.message, mock: MOCK_API, dashboard: null });
  }
});

// AI create patient
app.post('/create-patient', async (req, res) => {
  global.lastPrompt = req.body.prompt || '';
  try {
    const r = await apiCall('/v1/ai/patient', 'POST', { prompt: req.body.prompt });
    return res.json({ success: true, patientId: r.id || r });
  } catch (err) {
    console.error('Create patient error:', err.message || err);
    return res.json({ success: false, error: err.message || 'Failed to create patient' });
  }
});

// AI create encounter / EMR
app.post('/create-encounter', async (req, res) => {
  global.lastPrompt = req.body.prompt || '';
  const patientId = parseInt(req.body.patientId) || null;
  if (!patientId) return res.status(400).json({ success: false, error: 'patientId required' });

  try {
    await apiCall('/v1/ai/emr', 'POST', { prompt: req.body.prompt, patient: patientId });

    const [patientRaw, encountersRaw, medsRaw] = await Promise.all([
      apiCall(`/v1/patients/${patientId}`),
      apiCall(`/v1/patients/${patientId}/encounters`),
      apiCall(`/v1/patients/${patientId}/medications`)
    ]);

    const patient = patientRaw || {};
    const encounters = Array.isArray(encountersRaw) ? encountersRaw : (encountersRaw.results || []);
    const medications = Array.isArray(medsRaw) ? medsRaw : (medsRaw.results || []);
    const alerts = await computeAlerts(patientId, medications, patient);

    return res.json({ success: true, patient, encounters, medications, alerts });
  } catch (err) {
    console.error('Create encounter error:', err.message || err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to create encounter' });
  }
});

// Dashboard for a patient
app.get('/dashboard/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).send('Invalid patient id');

  try {
    const [patientRaw, encountersRaw, medsRaw] = await Promise.all([
      apiCall(`/v1/patients/${id}`),
      apiCall(`/v1/patients/${id}/encounters`),
      apiCall(`/v1/patients/${id}/medications`)
    ]);

    const patient = patientRaw || {};
    const encounters = Array.isArray(encountersRaw) ? encountersRaw : (encountersRaw.results || []);
    const medications = Array.isArray(medsRaw) ? medsRaw : (medsRaw.results || []);
    const alerts = await computeAlerts(id, medications, patient);

    res.render('index', {
      patients: [patient],
      patient,
      encounters,
      medications,
      alerts,
      error: null,
      mock: MOCK_API,
      dashboard: true // <<< fixed: define dashboard so EJS doesn't throw
    });
  } catch (err) {
    console.error('Dashboard error:', err.message || err);
    const patient = mockData.patients.find(p => p.id === id) || {};
    const encounters = mockData.encounters.filter(e => e.patient === id);
    const medications = mockData.medications.filter(m => m.patient_id === id);
    const alerts = await computeAlerts(id, medications, patient);
    return res.render('index', { patients: [patient], patient, encounters, medications, alerts, error: err.message || 'Using mock data', mock: MOCK_API, dashboard: true });
  }
});

// Webhook receiver
app.post('/webhook', (req, res) => {
  console.log('🔔 PHARMAVIGILANCE WEBHOOK:', JSON.stringify(req.body, null, 2));
  res.json({ received: true });
});

// Health
app.get('/health', (req, res) => res.json({ status: 'ok', env: MOCK_API ? 'mock' : 'real' }));

// Start server
app.listen(PORT, () => {
  console.log(`🚀 SafeMed Dashboard running on port ${PORT}`);
  console.log(`BASE_URL=${BASE_URL}`);
  console.log(MOCK_API ? '🟢 MOCK MODE ACTIVE' : '🔴 REAL MODE - using Dorra EMR API');
});
