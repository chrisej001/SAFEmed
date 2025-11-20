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
  const patients = (await apiCall('/v1/patients')).results || [];
  res.render('index', { patients, dashboard: null });
});

// Create patient
app.post('/create-patient', async (req,res)=>{
  const prompt = req.body.prompt;
  const r = await apiCall('/v1/ai/patient','POST',{ prompt });
  res.json({ success:true, patientId:r.id });
});

// Dashboard
app.get('/dashboard/:id', async (req,res)=>{
  const id = parseInt(req.params.id);
  const [patient, encountersData, medicationsData] = await Promise.all([
    apiCall(`/v1/patients/${id}`),
    apiCall(`/v1/patients/${id}/encounters`),
    apiCall(`/v1/patients/${id}/medications`)
  ]);
  const encounters = encountersData.results || [];
  const medications = medicationsData.results || [];
  const alerts = await computeAlerts(id, medications, patient);
  const patients = (await apiCall('/v1/patients')).results || [];
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
    apiCall(`/v1/patients/${patientId}/encounters`),
    apiCall(`/v1/patients/${patientId}/medications`)
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
