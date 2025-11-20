require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_TOKEN = process.env.API_TOKEN || '';
const BASE_URL = (process.env.BASE_URL || 'https://hackathon-api.aheadafrica.org').replace(/\/$/, '');
const MOCK_API = process.env.MOCK_API === 'true';

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Hardcoded risks
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

// Helper: auth headers
const authHeaders = () => API_TOKEN ? { Authorization: `Token ${API_TOKEN}` } : {};

// Mock API fallback
const mockResponseFor = (endpoint, method, data) => {
  if (endpoint === '/v1/patients' && method === 'GET') return { results: mockData.patients };
  if (endpoint.match(/^\/v1\/patients\/\d+$/) && method === 'GET') {
    const id = parseInt(endpoint.split('/').pop());
    return mockData.patients.find(x => x.id === id) || {};
  }
  if (endpoint.match(/^\/v1\/patients\/\d+\/encounters/) && method === 'GET') {
    const id = parseInt(endpoint.split('/')[3]);
    return { results: mockData.encounters.filter(e => e.patient === id) };
  }
  if (endpoint.match(/^\/v1\/patients\/\d+\/medications/) && method === 'GET') {
    const id = parseInt(endpoint.split('/')[3]);
    return { results: mockData.medications.filter(m => m.patient_id === id) };
  }
  if (endpoint === '/v1/ai/patient' && method === 'POST') {
    const newId = mockData.patients.length + 1;
    const prompt = (data?.prompt || '').toLowerCase();
    const allergies = prompt.includes('allergic to penicillin') ? ['penicillin'] : [];
    const created = { id: newId, full_name: `Patient ${newId}`, allergies };
    mockData.patients.push(created);
    return { status: true, id: newId };
  }
  if (endpoint === '/v1/ai/emr' && method === 'POST') {
    const patientId = parseInt(data?.patient) || null;
    const summary = (data?.prompt || '').substring(0, 140);
    const created = { id: mockData.encounters.length + 1, created_at: new Date().toISOString(), summary, patient: patientId, encounter_medications: [] };
    if ((data.prompt || '').toLowerCase().includes('aspirin')) mockData.medications.push({ name: 'Aspirin', patient_id: patientId });
    if ((data.prompt || '').toLowerCase().includes('amlodipine')) mockData.medications.push({ name: 'Amlodipine', patient_id: patientId });
    if ((data.prompt || '').toLowerCase().includes('amoxicillin')) mockData.medications.push({ name: 'Amoxicillin', patient_id: patientId });
    mockData.encounters.push(created);
    return { status: true, id: created.id };
  }
  return {};
};

// Safe API call
const apiCall = async (endpoint, method='GET', data=null) => {
  if (MOCK_API) return mockResponseFor(endpoint, method, data);
  try {
    const url = `${BASE_URL}${endpoint}`;
    const resp = await axios({ method, url, headers: { ...authHeaders(), 'Content-Type':'application/json' }, data });
    return resp.data;
  } catch (err) {
    console.error('API Error:', err.response?.data || err.message);
    return mockResponseFor(endpoint, method, data);
  }
};

// Compute alerts
const computeAlerts = async (patientId, meds=[], patient={}) => {
  const alerts = [];
  const allergies = patient.allergies || [];
  allergies.forEach(allergy => {
    meds.forEach(med => {
      const medName = (med.name || '').toLowerCase();
      if (allergy && medName.includes(allergy.toLowerCase())) alerts.push({ type:'ALLERGY RISK', message:`Patient is allergic to ${allergy}!`, risk:'High' });
    });
  });
  RISKY_COMBINATIONS.forEach(([a,b])=>{
    const hasA = meds.some(m=>m.name.toLowerCase().includes(a));
    const hasB = meds.some(m=>m.name.toLowerCase().includes(b));
    if(hasA && hasB) alerts.push({ type:'DRUG INTERACTION', message:`${a} + ${b} = Serious risk`, risk:'High' });
  });
  return alerts;
};

// Routes

// Home - list patients
app.get('/', async (req,res)=>{
  const patients = (await apiCall('/v1/ai/patients')).results || [];
  res.render('index', { patients, dashboard: null });
});

// // Create patient
// app.post('/create-patient', async (req,res)=>{
//   const prompt = req.body.prompt;
//   const r = await apiCall('/v1/ai/patient','POST',{ prompt });
//   res.json({ success:true, patientId:r.id });
// });

app.post('/create-patient', async (req, res) => {
  const prompt = (req.body.prompt || '').toString();
  global.lastPrompt = prompt;

  // Helper to call standard create (non-AI)
  const standardCreate = async (derived) => {
    // derived should be an object matching minimal required fields.
    // docs require first_name; include full_name if available
    try {
      const r = await apiCall('/v1/patients/create', 'POST', derived);
      // docs return { status: true, status_code: 201, id: 67 } — adapt if API responds differently
      return r?.id || (r?.status === true && r?.id) || null;
    } catch (e) {
      console.error('Standard create failed:', e?.message || e);
      return null;
    }
  };

  try {
    // 1) Try AI endpoint first (preferred)
    console.log('Attempting AI patient create with prompt:', prompt);
    const aiResp = await apiCall('/v1/ai/patient', 'POST', { prompt });

    // AI may return { status:true, id: 67 } or similar
    const aiId = aiResp?.id || (aiResp?.status === true && aiResp?.id) || null;
    if (aiId) {
      return res.json({ success: true, patientId: aiId });
    }

    // If AI returned but no id, fall through to standard create
    console.warn('AI create returned but no id, falling back to standard create', aiResp);
  } catch (err) {
    console.warn('AI create failed (will attempt standard create). Error:', err.message || err);
  }

  // 2) Attempt regular create endpoint as fallback
  // Build a minimal body from prompt. This is heuristic: you can improve parsing if you want
  const derived = {
    first_name: 'New',                // required by docs — change parsing to extract real name if possible
    full_name: prompt.substring(0, 200),
    allergies: []
  };

  // quick parse: look for "allergic to X" in the prompt (basic heuristic)
  const m = prompt.toLowerCase().match(/allergic to ([a-zA-Z, ]+)/);
  if (m) {
    const list = m[1].split(',').map(s => s.trim()).filter(Boolean);
    if (list.length) derived.allergies = list;
    if (list.length && derived.full_name === prompt.substring(0,200)) {
      // try to set a better full_name (optional)
      // if prompt includes "New patient John Doe", extract after "New patient"
      const nameMatch = prompt.match(/new patient\s+([A-Za-z\s]+)/i);
      if (nameMatch) derived.first_name = nameMatch[1].split(' ')[0] || 'New';
      derived.full_name = (nameMatch ? nameMatch[1].trim() : derived.full_name).substring(0,200);
    }
  }

  const stdId = await standardCreate(derived);
  if (stdId) return res.json({ success: true, patientId: stdId });

  // 3) Last resort: mock fallback (so UI remains functional)
  if (MOCK_API) {
    // mockResponseFor handles adding patient to in-memory store
    const mResp = mockResponseFor('/v1/ai/patient', 'POST', { prompt });
    const id = mResp?.id || null;
    if (id) return res.json({ success: true, patientId: id });
  }

  // If everything failed:
  return res.status(500).json({ success: false, error: 'Failed to create patient (AI and standard create failed)' });
});
// Dashboard
app.get('/dashboard/:id', async (req,res)=>{
  const id = parseInt(req.params.id);
  const [patient, encountersData, medicationsData] = await Promise.all([
    apiCall(`/v1/ai/patients/${id}`),
    apiCall(`/v1/ai/patients/${id}/encounters`),
    apiCall(`/v1/ai/patients/${id}/medications`)
  ]);
  const encounters = encountersData.results || [];
  const medications = medicationsData.results || [];
  const alerts = await computeAlerts(id, medications, patient);
  const patients = (await apiCall('/v1/ai/patients')).results || [];
  res.render('index', { patients, dashboard:{ patient, encounters, medications, alerts } });
});

// Create encounter
app.post('/create-encounter', async (req,res)=>{
  const patientId = parseInt(req.body.patientId);
  const prompt = req.body.prompt;
  await apiCall('/v1/ai/emr','POST',{ patient:patientId, prompt });
  // Fetch updated data
  const [patient, encountersData, medicationsData] = await Promise.all([
    apiCall(`/v1/patients/${patientId}`),
    apiCall(`/v1/ai/patients/${patientId}/encounters`),
    apiCall(`/v1/ai/patients/${patientId}/medications`)
  ]);
  const encounters = encountersData.results || [];
  const medications = medicationsData.results || [];
  const alerts = await computeAlerts(patientId, medications, patient);
  res.json({ success:true, patient, encounters, medications, alerts });
});

// Webhook
app.post('/webhook', (req,res)=>{
  console.log('🔔 PHARMAVIGILANCE WEBHOOK:', req.body);
  res.json({ received:true });
});

// Health check
app.get('/health', (req,res)=>res.json({ status:'ok', env:MOCK_API ? 'mock':'real' }));

// Start server
app.listen(PORT, ()=>console.log(`🚀 SafeMed running on port ${PORT}`));
