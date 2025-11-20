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
  // Normalize endpoint prefix
  if (!endpoint.startsWith('/')) endpoint = '/' + endpoint;

  // If mock mode explicitly enabled, return mock
  if (MOCK_API) {
    return mockResponseFor(endpoint, method, data);
  }

  // Attempt real request
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
    // Log full error for debugging
    console.error('API Error:', err.response?.status, err.response?.data || err.message);

    // Automatic graceful fallback: if network/DNS error or 5xx, switch to mock mode temporarily
    const message = err.message || '';
    if (message.includes('ENOTFOUND') || message.includes('ECONNREFUSED') || (err.response && err.response.status >= 500)) {
      console.warn('Remote API unreachable — switching to mock mode fallback for this request.');
      // Do not mutate global MOCK_API here permanently; just return mock for this call
      return mockResponseFor(endpoint, method, data);
    }

    // For 4xx errors (client errors), rethrow to let route handle appropriately
    const thrown = new Error(err.response?.data?.message || err.message || 'API request failed');
    thrown.status = err.response?.status;
    throw thrown;
  }
}

// Produce simple mock responses matching expected shapes
function mockResponseFor(endpoint, method, data) {
  // Patients list
  if (endpoint === '/v1/patients' && method === 'GET') {
    return { count: mockData.patients.length, results: mockData.patients };
  }

  // Get patient by id
  if (endpoint.match(/^\/v1\/patients\/\d+$/) && method === 'GET') {
    const id = parseInt(endpoint.split('/').pop());
    const p = mockData.patients.find(x => x.id === id);
    return p || {};
  }

  // Patient encounters
  if (endpoint.match(/^\/v1\/patients\/\d+\/encounters/) && method === 'GET') {
    const id = parseInt(endpoint.split('/')[3]);
    return { count: mockData.encounters.filter(e => e.patient === id).length,
             results: mockData.encounters.filter(e => e.patient === id) };
  }

  // Patient medications
  if (endpoint.match(/^\/v1\/patients\/\d+\/medications/) && method === 'GET') {
    const id = parseInt(endpoint.split('/')[3]);
    return { count: mockData.medications.filter(m => m.patient_id === id).length,
             results: mockData.medications.filter(m => m.patient_id === id) };
  }

  // AI create patient
  if (endpoint === '/v1/ai/patient' && method === 'POST') {
    const newId = mockData.patients.length + 1;
    const prompt = (data?.prompt || '').toString();
    const allergies = prompt.toLowerCase().includes('allergic to penicillin') ? ['penicillin'] : [];
    const created = { id: newId, full_name: `Patient ${newId}`, allergies };
    mockData.patients.push(created);
    return { status: true, status_code: 201, message: 'success', id: newId };
  }

  // AI emr (create encounter/appointment)
  if (endpoint === '/v1/ai/emr' && method === 'POST') {
    const patientId = parseInt(data?.patient) || null;
    const summary = (data?.prompt || '').toString().substring(0, 140);
    const created = {
      id: mockData.encounters.length + 1,
      created_at: new Date().toISOString(),
      summary,
      patient: patientId,
      encounter_medications: []
    };
    // extract simple med names from prompt
    const lower = (data?.prompt || '').toLowerCase();
    if (lower.includes('aspirin')) mockData.medications.push({ name: 'Aspirin', patient_id: patientId });
    if (lower.includes('amlodipine')) mockData.medications.push({ name: 'Amlodipine', patient_id: patientId });
    if (lower.includes('amoxicillin')) mockData.medications.push({ name: 'Amoxicillin', patient_id: patientId });

    mockData.encounters.push(created);
    return { status: true, status_code: 201, message: 'created', resource: 'Encounter', id: created.id };
  }

  // Default fallback
  return {};
}

// Compute alerts using either mock store or real fetched meds/patient
async function computeAlerts(patientId, medsFromApi = null, patientFromApi = null) {
  const meds = medsFromApi || (mockData.medications || []);
  const patient = patientFromApi || mockData.patients.find(p => p.id === patientId) || { allergies: [] };
  let alerts = [];

  // Allergy checks - patient.allergies is expected to be array or string
  const allergies = Array.isArray(patient.allergies) ? patient.allergies : (patient.allergies ? [patient.allergies] : []);

  allergies.forEach(allergy => {
    meds.forEach(med => {
      const medName = (med.name || med.medication_name || '').toString().toLowerCase();
      if (allergy && medName.includes(allergy.toLowerCase())) {
        alerts.push({ type: 'ALLERGY RISK', message: `Patient is allergic to ${allergy}!`, risk: 'High' });
      }
    });
  });

  // Drug interaction alerts
  for (let combo of RISKY_COMBINATIONS) {
    const [a, b] = combo;
    const hasA = meds.some(m => (m.name || '').toString().toLowerCase().includes(a));
    const hasB = meds.some(m => (m.name || '').toString().toLowerCase().includes(b));
    if (hasA && hasB) {
      alerts.push({ type: 'DRUG INTERACTION', message: `${a} + ${b} = Serious risk (e.g., bleeding, BP spike)`, risk: 'High' });
    }
  }

  // Extra: if lastPrompt contains dangerous combo
  if (global.lastPrompt && global.lastPrompt.toLowerCase().includes('aspirin') && global.lastPrompt.toLowerCase().includes('amlodipine')) {
    alerts.push({ type: 'PHARMAVIGILANCE ALERT', message: 'Major drug interaction detected: Blood pressure risk!', risk: 'High' });
  }

  return alerts;
}

// ROUTES

// Home - list patients
app.get('/', async (req, res) => {
  try {
    const raw = MOCK_API ? await apiCall('/v1/patients') : await apiCall('/v1/patients');
    // raw may be { count, results } or array
    const patients = Array.isArray(raw) ? raw : (raw.results || []);
    res.render('index', { patients, alerts: [], error: null, mock: MOCK_API });
  } catch (err) {
    console.error('Error loading patients:', err.message || err);
    // fallback to mock store if available
    const patients = mockData.patients || [];
    res.render('index', { patients, alerts: [], error: err.message || 'Could not fetch patients', mock: MOCK_API });
  }
});

// AI create patient
app.post('/create-patient', async (req, res) => {
  global.lastPrompt = req.body.prompt || '';
  try {
    if (MOCK_API) {
      const r = await apiCall('/v1/ai/patient', 'POST', { prompt: req.body.prompt });
      return res.json({ success: true, patientId: r.id });
    }
    const result = await apiCall('/v1/ai/patient', 'POST', { prompt: req.body.prompt });
    // result shape per docs: { status: true, status_code: 201, message: 'success', id: 67 }
    return res.json({ success: true, patientId: result.id || result });
  } catch (err) {
    console.error('Create patient error:', err.message || err);
    return res.json({ success: false, error: err.message || 'Failed to create patient' });
  }
});

// AI create encounter / EMR
app.post('/create-encounter', async (req, res) => {
  global.lastPrompt = req.body.prompt || '';
  const patientId = parseInt(req.body.patientId) || null;
  if (!patientId) {
    return res.status(400).json({ success: false, error: 'patientId required' });
  }

  try {
    if (MOCK_API) {
      await apiCall('/v1/ai/emr', 'POST', { prompt: req.body.prompt, patient: patientId });
    } else {
      await apiCall('/v1/ai/emr', 'POST', { prompt: req.body.prompt, patient: patientId });
    }

    // After creating encounter, fetch freshest data to build dashboard
    const [patientRaw, encountersRaw, medsRaw] = await Promise.all([
      apiCall(`/v1/patients/${patientId}`),
      apiCall(`/v1/patients/${patientId}/encounters`),
      apiCall(`/v1/patients/${patientId}/medications`)
    ]);

    const patient = (patientRaw && patientRaw.id) ? patientRaw : (patientRaw || {});
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
  if (!id) {
    return res.status(400).send('Invalid patient id');
  }

  try {
    const patientRaw = await apiCall(`/v1/patients/${id}`);
    const encountersRaw = await apiCall(`/v1/patients/${id}/encounters`);
    const medsRaw = await apiCall(`/v1/patients/${id}/medications`);

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
      mock: MOCK_API
    });
  } catch (err) {
    console.error('Dashboard error:', err.message || err);
    // fallback to mock view
    const patient = mockData.patients.find(p => p.id === id) || {};
    const encounters = mockData.encounters.filter(e => e.patient === id);
    const medications = mockData.medications.filter(m => m.patient_id === id);
    const alerts = await computeAlerts(id, medications, patient);
    return res.render('index', { patients: [patient], patient, encounters, medications, alerts, error: err.message || 'Using mock data', mock: MOCK_API });
  }
});

// Webhook receiver (pharmavigilance events)
app.post('/webhook', (req, res) => {
  console.log('🔔 PHARMAVIGILANCE WEBHOOK:', JSON.stringify(req.body, null, 2));
  // TODO: verify signature if provided by API; persist event if needed
  res.json({ received: true });
});

// Health route
app.get('/health', (req, res) => res.json({ status: 'ok', env: MOCK_API ? 'mock' : 'real' }));

// Start server
app.listen(PORT, () => {
  console.log(`🚀 SafeMed Dashboard running on port ${PORT}`);
  console.log(`BASE_URL=${BASE_URL}`);
  console.log(MOCK_API ? '🟢 MOCK MODE ACTIVE' : '🔴 REAL MODE - using Dorra EMR API');
});
