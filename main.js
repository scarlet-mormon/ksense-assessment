import https from 'https'; // <-- STEP 1: Import the https module

// --- Configuration ---
const API_KEY = 'ak_1894e840a8d34bfdb49d8c37175c7a8cb24f0b7b76911945';
const BASE_URL = 'https://assessment.ksensetech.com/api';

// --- API Client Configuration ---
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 1000;
const REQUEST_DELAY_MS = 250;

// <-- STEP 2: Create a custom agent to bypass SSL validation
// WARNING: This disables certificate validation. Use only for this assessment.
const unsafeAgent = new https.Agent({
    rejectUnauthorized: false
});


// --- Helper Functions ---

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ... (keep the rest of the file the same)

async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const fetchOptions = { ...options, agent: unsafeAgent };
            const response = await fetch(url, fetchOptions);

            if (response.ok) {
                return await response.json();
            }

            if ([429, 500, 503].includes(response.status)) {
                console.warn(`Attempt ${attempt}: Received status ${response.status}. Retrying after delay...`);
                const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                await sleep(delay);
            } else {
                const errorBody = await response.text();
                throw new Error(`Non-retryable HTTP error: ${response.status} ${response.statusText}. Body: ${errorBody}`);
            }
        } catch (error) {
            // --- ENHANCED LOGGING ---
            // This is the key change. We now log the full error object.
            console.error(`\n--- DETAILED ERROR ON ATTEMPT ${attempt} ---`);
            console.error(error); // This will print the full error object with code, stack, etc.
            console.error('--- END OF DETAILED ERROR ---\n');

            if (attempt === retries) {
                throw new Error(`Failed to fetch from ${url} after ${retries} attempts. See detailed error above.`);
            }

            console.warn(`Retrying after delay...`);
            const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
            await sleep(delay);
        }
    }
     throw new Error(`Exhausted all retries for ${url}`);
}

// ... (the rest of your main.js file remains unchanged)


// --- Risk Scoring Functions (No changes needed here) ---
function calculateBPRisk(bpString) {
    if (!bpString || typeof bpString !== 'string') return { score: 0, isInvalid: true };
    const parts = bpString.split('/');
    if (parts.length !== 2) return { score: 0, isInvalid: true };
    const systolic = parseInt(parts[0], 10);
    const diastolic = parseInt(parts[1], 10);
    if (isNaN(systolic) || isNaN(diastolic)) return { score: 0, isInvalid: true };
    if (systolic >= 140 || diastolic >= 90) return { score: 3, isInvalid: false };
    if ((systolic >= 130 && systolic <= 139) || (diastolic >= 80 && diastolic <= 89)) return { score: 2, isInvalid: false };
    if ((systolic >= 120 && systolic <= 129) && diastolic < 80) return { score: 1, isInvalid: false };
    return { score: 0, isInvalid: false };
}

function calculateTempRisk(tempValue) {
    if (tempValue === null || tempValue === undefined) return { score: 0, isInvalid: true };
    const temp = parseFloat(tempValue);
    if (isNaN(temp)) return { score: 0, isInvalid: true };
    if (temp >= 101.0) return { score: 2, isInvalid: false };
    if (temp >= 99.6) return { score: 1, isInvalid: false };
    return { score: 0, isInvalid: false };
}

function calculateAgeRisk(ageValue) {
    if (ageValue === null || ageValue === undefined) return { score: 0, isInvalid: true };
    const age = parseInt(ageValue, 10);
    if (isNaN(age)) return { score: 0, isInvalid: true };
    if (age > 65) return { score: 2, isInvalid: false };
    if (age >= 40) return { score: 1, isInvalid: false };
    return { score: 0, isInvalid: false };
}


// --- Main Application Logic (No changes needed here) ---

async function fetchAllPatients() {
    let allPatients = [];
    let page = 1;
    let hasNext = true;
    const limit = 20;

    console.log("Starting to fetch patient data...");
    while (hasNext) {
        const url = `${BASE_URL}/patients?page=${page}&limit=${limit}`;
        const options = {
            method: 'GET',
            headers: { 'x-api-key': API_KEY }
        };
        
        console.log(`Fetching page ${page}...`);
        const responseData = await fetchWithRetry(url, options);

        if (responseData?.data?.length) {
            allPatients = allPatients.concat(responseData.data);
        } else {
             console.warn(`No patient data found on page ${page}.`);
        }

        hasNext = responseData?.pagination?.hasNext ?? false;
        page++;
        
        if (hasNext) {
            await sleep(REQUEST_DELAY_MS);
        }
    }

    console.log(`Successfully fetched a total of ${allPatients.length} patients.`);
    return allPatients;
}

async function submitResults(payload) {
    const url = `${BASE_URL}/submit-assessment`;
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY
        },
        body: JSON.stringify(payload)
    };

    console.log("Submitting assessment...");
    return await fetchWithRetry(url, options);
}

async function main() {
    try {
        const allPatients = await fetchAllPatients();
        const highRiskPatients = new Set();
        const feverPatients = new Set();
        const dataQualityIssues = new Set();

        console.log("Processing patient data...");
        for (const patient of allPatients) {
            if (!patient || !patient.patient_id) {
                console.warn("Skipping a record with no patient_id:", patient);
                continue;
            }
            const { patient_id, blood_pressure, temperature, age } = patient;
            const bpResult = calculateBPRisk(blood_pressure);
            const tempResult = calculateTempRisk(temperature);
            const ageResult = calculateAgeRisk(age);
            if (bpResult.isInvalid || tempResult.isInvalid || ageResult.isInvalid) {
                dataQualityIssues.add(patient_id);
            }
            const totalRiskScore = bpResult.score + tempResult.score + ageResult.score;
            if (totalRiskScore >= 4) {
                highRiskPatients.add(patient_id);
            }
            const tempNumber = parseFloat(temperature);
            if (!tempResult.isInvalid && tempNumber >= 99.6) {
                feverPatients.add(patient_id);
            }
        }
        console.log("Patient processing complete.");

        const submissionPayload = {
            high_risk_patients: Array.from(highRiskPatients).sort(),
            fever_patients: Array.from(feverPatients).sort(),
            data_quality_issues: Array.from(dataQualityIssues).sort(),
        };

        console.log("\n--- Submission Payload ---");
        console.log(JSON.stringify(submissionPayload, null, 2));

        const submissionResult = await submitResults(submissionPayload);

        console.log("\n--- Submission Result ---");
        console.log(JSON.stringify(submissionResult, null, 2));

        if(submissionResult.success) {
            console.log(`\n✅ Assessment successful! Final score: ${submissionResult.results.score}`);
        } else {
            console.error(`\n❌ Assessment submission failed: ${submissionResult.message}`);
        }

    } catch (error) {
        console.error("\nAn unrecoverable error occurred during the process:", error.message);
        process.exit(1);
    }
}

main();