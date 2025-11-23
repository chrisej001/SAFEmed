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

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

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
  medications: [],
  nextMedicationId: 1
};

// Cache for patient names (helps when API doesn't return full_name)
let patientNameCache = {};

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
    return { results: mockData.medications.filter(m => m.patient === id) };
  }
  if (endpoint === '/v1/ai/patient' && method === 'POST') {
    const newId = mockData.patients.length + 1;
    const prompt = (data?.prompt || '');
    
    // Extract patient name using the same logic as main app
    let fullName = `Patient ${newId}`;
    const namePatterns = [
      /(?:new patient|patient|create patient)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)(?:\s+has|\s+is|\s+,)/i,
      /^([A-Z][a-z]+\s+[A-Z][a-z]+)/i
    ];
    
    for (const pattern of namePatterns) {
      const match = prompt.match(pattern);
      if (match && match[1]) {
        fullName = match[1].trim();
        break;
      }
    }
    
    // Extract allergies
    const allergies = [];
    const allergyMatch = prompt.match(/allergic to\s+([a-zA-Z\s,]+?)(?:\.|,|$)/i);
    if (allergyMatch) {
      const allergyList = allergyMatch[1].split(',').map(a => a.trim()).filter(Boolean);
      allergies.push(...allergyList);
    }
    
    const created = { id: newId, full_name: fullName, allergies };
    mockData.patients.push(created);
    console.log('[MOCK] Created patient:', created);
    return { status: true, id: newId };
  }
  if (endpoint === '/v1/patients/create' && method === 'POST') {
    const newId = mockData.patients.length + 1;
    const created = { 
      id: newId, 
      full_name: data?.full_name || `Patient ${newId}`, 
      allergies: data?.allergies || [] 
    };
    mockData.patients.push(created);
    return { status: true, status_code: 201, id: newId };
  }
  if (endpoint === '/v1/ai/emr' && method === 'POST') {
    const patientId = parseInt(data?.patient) || null;
    const prompt = data?.prompt || '';
    const summary = prompt.substring(0, 140);
    
    // Extract diagnosis from prompt
    let diagnosis = 'Clinical consultation';
    const diagnosisPatterns = [
      /(?:has|diagnosed with|suffering from|complains of)\s+([a-zA-Z\s,]+?)(?:\.|,|\s+prescribe|\s+bp:|$)/i,
      /diagnosis[:\s]+([a-zA-Z\s]+?)(?:\.|,|$)/i,
      /(?:fever|headache|infection|hypertension|diabetes|cough|cold|pain)/i
    ];
    
    for (const pattern of diagnosisPatterns) {
      const match = prompt.match(pattern);
      if (match) {
        if (match[1]) {
          diagnosis = match[1].trim();
        } else {
          diagnosis = match[0];
        }
        break;
      }
    }
    
    const created = { 
      id: mockData.encounters.length + 1, 
      created_at: new Date().toISOString(), 
      summary, 
      patient: patientId, 
      diagnosis
    };
    
    // Parse medications from prompt and add them
    const promptLower = prompt.toLowerCase();
    const medications = [
      { keyword: 'aspirin', name: 'Aspirin', dose: '500mg' },
      { keyword: 'amlodipine', name: 'Amlodipine', dose: '5mg' },
      { keyword: 'amoxicillin', name: 'Amoxicillin', dose: '250mg' },
      { keyword: 'penicillin', name: 'Penicillin', dose: '500mg' },
      { keyword: 'ibuprofen', name: 'Ibuprofen', dose: '400mg' },
      { keyword: 'warfarin', name: 'Warfarin', dose: '5mg' },
      { keyword: 'paracetamol', name: 'Paracetamol', dose: '500mg' },
      { keyword: 'codeine', name: 'Codeine', dose: '30mg' }
    ];
    
    medications.forEach(med => {
      if (promptLower.includes(med.keyword)) {
        mockData.medications.push({ 
          id: mockData.nextMedicationId++,
          name: med.name, 
          patient: patientId,
          dose: med.dose,
          created_at: new Date().toISOString()
        });
      }
    });
    
    mockData.encounters.push(created);
    return { status: true, id: created.id };
  }
  return {};
};

// Safe API call with better error handling
const apiCall = async (endpoint, method='GET', data=null) => {
  if (MOCK_API) {
    console.log(`[MOCK MODE] ${method} ${endpoint}`);
    return mockResponseFor(endpoint, method, data);
  }
  try {
    const url = `${BASE_URL}${endpoint}`;
    console.log(`[API CALL] ${method} ${url}`);
    const resp = await axios({ method, url, headers: { ...authHeaders(), 'Content-Type':'application/json' }, data });
    return resp.data;
  } catch (err) {
    console.error(`[API ERROR] ${method} ${endpoint}:`, err.response?.data || err.message);
    console.log('[FALLBACK] Using mock data due to API error');
    return mockResponseFor(endpoint, method, data);
  }
};

// High-risk medications that require monitoring even when used alone
const HIGH_RISK_MEDICATIONS = [
  { name: 'warfarin', warning: 'Warfarin requires regular blood monitoring (INR levels). Risk of bleeding.' },
  { name: 'codeine', warning: 'Codeine is an opioid. Monitor for respiratory depression and dependence risk.' },
  { name: 'amoxicillin', warning: 'Amoxicillin - verify no penicillin allergy before administration.' }
];

// Compute alerts with improved medication matching
const computeAlerts = async (patientId, meds=[], patient={}) => {
  const alerts = [];
  const allergies = patient.allergies || [];
  
  console.log(`[ALERT CHECK] Patient ${patientId}:`, {
    allergies,
    medications: meds.map(m => m.name)
  });
  
  // Check for allergy risks
  allergies.forEach(allergy => {
    meds.forEach(med => {
      const medName = (med.name || '').toLowerCase();
      const allergyLower = allergy.toLowerCase();
      // Check if medication name contains the allergy or vice versa
      if (medName.includes(allergyLower) || allergyLower.includes(medName.split(' ')[0])) {
        alerts.push({ 
          type:'ALLERGY RISK', 
          message:`Patient is allergic to ${allergy}! Prescribed medication: ${med.name}`, 
          risk:'High' 
        });
      }
    });
  });
  
  // Check for high-risk single medications
  meds.forEach(med => {
    const medName = (med.name || '').toLowerCase();
    HIGH_RISK_MEDICATIONS.forEach(highRisk => {
      if (medName.includes(highRisk.name)) {
        alerts.push({
          type: 'PHARMAVIGILANCE ALERT',
          message: highRisk.warning,
          risk: 'High'
        });
      }
    });
  });
  
  // Check for drug interactions
  RISKY_COMBINATIONS.forEach(([drugA, drugB]) => {
    const hasA = meds.some(m => {
      const name = m.name.toLowerCase();
      return name.includes(drugA) || drugA.includes(name.split(' ')[0]);
    });
    const hasB = meds.some(m => {
      const name = m.name.toLowerCase();
      return name.includes(drugB) || drugB.includes(name.split(' ')[0]);
    });
    
    if (hasA && hasB) {
      alerts.push({ 
        type:'DRUG INTERACTION', 
        message:`${drugA.toUpperCase()} + ${drugB.toUpperCase()} = Serious interaction risk`, 
        risk:'High' 
      });
    }
  });
  
  console.log(`[ALERT RESULT] ${alerts.length} alerts detected`);
  
  return alerts;
};

// Routes

// Home - list patients
app.get('/', async (req, res) => {
  try {
    const patientsData = await apiCall('/v1/patients');
    const patients = patientsData.results || [];
    
    // Enhance patients with cached names if available
    patients.forEach(p => {
      if (!p.full_name && !p.first_name && patientNameCache[p.id]) {
        p.full_name = patientNameCache[p.id];
      }
    });
    
    res.render('index', { patients, dashboard: null });
  } catch (error) {
    console.error('[ERROR] Failed to fetch patients:', error.message);
    res.status(500).render('index', { 
      patients: [], 
      dashboard: null, 
      error: 'Failed to load patients' 
    });
  }
});

// Create patient with validation and proper error handling
app.post('/create-patient', async (req, res) => {
  try {
    // Validate input
    const prompt = (req.body.prompt || '').toString().trim();
    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }

    // Extract patient name from prompt (do this early for caching)
    let extractedName = 'New Patient';
    let firstName = 'New';
    
    const namePatterns = [
      /(?:new patient|patient|create patient)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i, // "New patient John Doe" or "patient John Doe"
      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)(?:\s+has|\s+is|\s+,)/i,                   // "Victor Daniel has cold"
      /^([A-Z][a-z]+\s+[A-Z][a-z]+)/i                                              // Just "Victor Daniel"
    ];
    
    for (const pattern of namePatterns) {
      const match = prompt.match(pattern);
      if (match && match[1]) {
        extractedName = match[1].trim();
        const nameParts = extractedName.split(/\s+/);
        firstName = nameParts[0];
        break;
      }
    }
    
    console.log('[NAME EXTRACTION]', { prompt, extractedName, firstName });

    // Helper to call standard create (non-AI)
    const standardCreate = async (derived) => {
      try {
        const r = await apiCall('/v1/patients/create', 'POST', derived);
        return r?.id || (r?.status === true && r?.id) || null;
      } catch (e) {
        console.error('[ERROR] Standard create failed:', e?.message || e);
        return null;
      }
    };

    // 1) Try AI endpoint first (preferred)
    console.log('[CREATE PATIENT] Attempting AI patient create with prompt:', prompt);
    const aiResp = await apiCall('/v1/ai/patient', 'POST', { prompt });

    const aiId = aiResp?.id || (aiResp?.status === true && aiResp?.id) || null;
    if (aiId) {
      console.log('[SUCCESS] Patient created via AI endpoint, ID:', aiId);
      
      // Cache the patient name
      patientNameCache[aiId] = extractedName;
      
      // Try to update the patient with the full name using the update endpoint
      try {
        await apiCall(`/v1/patients/${aiId}`, 'PATCH', { 
          full_name: extractedName,
          first_name: firstName 
        });
        console.log('[UPDATE] Patient name updated successfully');
      } catch (updateError) {
        console.log('[WARNING] Could not update patient name in API, but cached locally');
      }
      
      return res.json({ success: true, patientId: aiId });
    }

    console.log('[FALLBACK] AI create returned but no id, falling back to standard create');

    // 2) Attempt regular create endpoint as fallback
    const derived = {
      first_name: firstName,
      full_name: extractedName,
      allergies: []
    };

    // Parse allergies from prompt
    const allergyMatch = prompt.toLowerCase().match(/allergic to ([a-zA-Z, ]+)/);
    if (allergyMatch) {
      const list = allergyMatch[1].split(',').map(s => s.trim()).filter(Boolean);
      if (list.length) derived.allergies = list;
    }

    const stdId = await standardCreate(derived);
    if (stdId) {
      console.log('[SUCCESS] Patient created via standard endpoint, ID:', stdId);
      // Cache the patient name
      patientNameCache[stdId] = extractedName;
      return res.json({ success: true, patientId: stdId });
    }

    // 3) Last resort: mock fallback
    if (MOCK_API) {
      const mResp = mockResponseFor('/v1/ai/patient', 'POST', { prompt });
      const id = mResp?.id || null;
      if (id) {
        console.log('[SUCCESS] Patient created via mock, ID:', id);
        return res.json({ success: true, patientId: id });
      }
    }

    // If everything failed
    console.error('[ERROR] All patient creation methods failed');
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to create patient. Please try again.' 
    });
  } catch (error) {
    console.error('[ERROR] Exception in create-patient:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: 'An unexpected error occurred' 
    });
  }
});
// Dashboard with comprehensive error handling
app.get('/dashboard/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).render('index', { 
        patients: [], 
        dashboard: null, 
        error: 'Invalid patient ID' 
      });
    }

    const [patient, encountersData, medicationsData] = await Promise.all([
      apiCall(`/v1/patients/${id}`),
      apiCall(`/v1/patients/${id}/encounters`),
      apiCall(`/v1/patients/${id}/medications`)
    ]);
    
    if (!patient || !patient.id) {
      return res.status(404).render('index', { 
        patients: [], 
        dashboard: null, 
        error: 'Patient not found' 
      });
    }
    
    // Enhance patient with cached name if available
    if (!patient.full_name && !patient.first_name && patientNameCache[id]) {
      patient.full_name = patientNameCache[id];
    }
    
    const encounters = encountersData.results || [];
    const medications = medicationsData.results || [];
    const alerts = await computeAlerts(id, medications, patient);
    const patientsData = await apiCall('/v1/patients');
    const patients = patientsData.results || [];
    
    res.render('index', { 
      patients, 
      dashboard: { patient, encounters, medications, alerts } 
    });
  } catch (error) {
    console.error('[ERROR] Failed to load dashboard:', error.message);
    res.status(500).render('index', { 
      patients: [], 
      dashboard: null, 
      error: 'Failed to load patient dashboard' 
    });
  }
});

// Create encounter with validation and error handling
app.post('/create-encounter', async (req, res) => {
  try {
    // Validate input
    const patientId = parseInt(req.body.patientId);
    const prompt = (req.body.prompt || '').toString().trim();
    
    if (isNaN(patientId)) {
      return res.status(400).json({ success: false, error: 'Valid patient ID is required' });
    }
    
    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }

    console.log(`[CREATE ENCOUNTER] Patient ${patientId}, prompt: ${prompt}`);
    
    // Create encounter via AI
    await apiCall('/v1/ai/emr', 'POST', { patient: patientId, prompt });
    
    // Fetch updated data
    const [patient, encountersData, medicationsData] = await Promise.all([
      apiCall(`/v1/patients/${patientId}`),
      apiCall(`/v1/patients/${patientId}/encounters`),
      apiCall(`/v1/patients/${patientId}/medications`)
    ]);
    
    const encounters = encountersData.results || [];
    const medications = medicationsData.results || [];
    const alerts = await computeAlerts(patientId, medications, patient);
    
    console.log(`[SUCCESS] Encounter created. Alerts: ${alerts.length}`);
    
    res.json({ success: true, patient, encounters, medications, alerts });
  } catch (error) {
    console.error('[ERROR] Failed to create encounter:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create encounter. Please try again.' 
    });
  }
});

// Webhook endpoint with basic validation
app.post('/webhook', (req, res) => {
  try {
    console.log('🔔 [WEBHOOK] PHARMAVIGILANCE ALERT RECEIVED:', JSON.stringify(req.body, null, 2));
    
    // Basic validation - in production, verify webhook signature here
    if (!req.body) {
      return res.status(400).json({ received: false, error: 'Empty payload' });
    }
    
    res.json({ received: true, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[ERROR] Webhook processing failed:', error.message);
    res.status(500).json({ received: false, error: 'Processing failed' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    mode: MOCK_API ? 'mock' : 'real',
    timestamp: new Date().toISOString(),
    apiConnected: !!API_TOKEN || MOCK_API
  });
});

// Start server
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`🚀 SafeMed Server Running`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🔧 Mode: ${MOCK_API ? 'MOCK (Development)' : 'REAL API'}`);
  console.log(`🔑 API Token: ${API_TOKEN ? 'Configured ✓' : 'Not set (using mock)'}`);
  console.log(`📡 Base URL: ${BASE_URL}`);
  console.log('='.repeat(60));
});
