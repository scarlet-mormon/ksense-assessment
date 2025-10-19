// --- Configuration ---
const API_KEY = 'ak_1894e840a8d34bfdb49d8c37175c7a8cb24f0b7b76911945';
const BASE_URL = 'https://assessment.ksenetech.com/api';

// --- API Client Configuration ---
const MAX_RETRIES = 5; // Max number of retries for a failed API request
const INITIAL_RETRY_DELAY_MS = 1000; // Initial delay for retries, increases exponentially
const REQUEST_DELAY_MS = 250; // A small delay between fetching pages to be polite to the API

// --- Helper Functions ---

/**
 * Pauses execution for a specified number of milliseconds.
 * @param {number} ms - The number of milliseconds to wait.
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetches data from a URL with retry logic for network and server errors.
 * @param {string} url - The URL to fetch.
 * @param {object} options - The options for the fetch request.
 * @param {number} retries - The number of remaining retries.
 * @returns {Promise<object>} The JSON response data.
 */
async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, options);

            if (response.ok) {
                return await response.json();
            }

            // Retry on specific server errors
            if ([429, 500, 503].includes(response.status)) {
                console.warn(`Attempt ${attempt}: Received status ${response.status}. Retrying after delay...`);
                const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                await sleep(delay);
            } else {
                // Non-retryable error
                throw new Error(`Non-retryable HTTP error: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            if (attempt === retries) {
                // All retries failed
                throw new Error(`Failed to fetch from ${url} after ${retries} attempts: ${error.message}`);
            }
            console.warn(`Attempt ${attempt}: Network error or fetch failed. Retrying after delay...`);
            const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
            await sleep(delay);
        }
    }
     throw new Error(`Exhausted all retries for ${url}`);
}


// --- Risk Scoring Functions ---

/**
 * Calculates the risk score based on blood pressure.
 * @param {string | null | undefined} bpString - Blood pressure reading (e.g., "120/80").
 * @returns {{score: number, isInvalid: boolean}} - The calculated score and a flag for data quality.
 */
function calculateBPRisk(bpString) {
    if (!bpString || typeof bpString !== 'string') {
        return { score: 0, isInvalid: true };
    }

    const parts = bpString.split('/');
    if (parts.length !== 2) {
        return { score: 0, isInvalid: true };
    }

    const systolic = parseInt(parts[0], 10);
    const diastolic = parseInt(parts[1], 10);

    if (isNaN(systolic) || isNaN(diastolic)) {
        return { score: 0, isInvalid: true };
    }

    // Cascade check from highest risk to lowest, as per the "higher risk stage" rule.
    if (systolic >= 140 || diastolic >= 90) return { score: 3, isInvalid: false };
    if ((systolic >= 130 && systolic <= 139) || (diastolic >= 80 && diastolic <= 89)) return { score: 2, isInvalid: false };
    if ((systolic >= 120 && systolic <= 129) && diastolic < 80) return { score: 1, isInvalid: false };
    // Any other valid reading, including Normal (Systolic <120 AND Diastolic <80), is 0 risk.
    return { score: 0, isInvalid: false };
}

/**
 * Calculates the risk score based on temperature.
 * @param {number | string | null | undefined} tempValue - Temperature reading.
 * @returns {{score: number, isInvalid: boolean}} - The calculated score and a flag for data quality.
 */
function calculateTempRisk(tempValue) {
    if (tempValue === null || tempValue === undefined) {
        return { score: 0, isInvalid: true };
    }

    const temp = parseFloat(tempValue);

    if (isNaN(temp)) {
        return { score: 0, isInvalid: true };
    }

    if (temp >= 101.0) return { score: 2, isInvalid: false };
    if (temp >= 99.6) return { score: 1, isInvalid: false }; // 99.6 - 100.9
    return { score: 0, isInvalid: false }; // <= 99.5
}

/**
 * Calculates the risk score based on age.
 * @param {number | string | null | undefined} ageValue - The patient's age.
 * @returns {{score: number, isInvalid: boolean}} - The calculated score and a flag for data quality.
 */
function calculateAgeRisk(ageValue) {
    if (ageValue === null || ageValue === undefined) {
        return { score: 0, isInvalid: true };
    }
    
    const age = parseInt(ageValue, 10);

    if (isNaN(age)) {
        return { score: 0, isInvalid: true };
    }

    if (age > 65) return { score: 2, isInvalid: false };
    if (age >= 40) return { score: 1, isInvalid: false }; // 40 - 65
    return { score: 0, isInvalid: false }; // < 40
}


// --- Main Application Logic ---

/**
 * Fetches all patients from the paginated API.
 * @returns {Promise<Array<object>>} A list of all patient objects.
 */
async function fetchAllPatients() {
    let allPatients = [];
    let page = 1;
    let hasNext = true;
    const limit = 20; // Use max limit to reduce number of API calls

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

/**
 * Submits the final analysis to the assessment API.
 * @param {object} payload - The submission payload.
 * @returns {Promise<object>} The API response from the submission.
 */
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

/**
 * Main function to orchestrate the entire process.
 */
async function main() {
    try {
        // 1. Fetch all patient data
        const allPatients = await fetchAllPatients();

        // 2. Initialize result sets to automatically handle duplicates
        const highRiskPatients = new Set();
        const feverPatients = new Set();
        const dataQualityIssues = new Set();

        console.log("Processing patient data...");

        // 3. Process each patient
        for (const patient of allPatients) {
            if (!patient || !patient.patient_id) {
                console.warn("Skipping a record with no patient_id:", patient);
                continue;
            }
            const { patient_id, blood_pressure, temperature, age } = patient;

            // Calculate scores and check for data quality issues
            const bpResult = calculateBPRisk(blood_pressure);
            const tempResult = calculateTempRisk(temperature);
            const ageResult = calculateAgeRisk(age);

            const hasIssue = bpResult.isInvalid || tempResult.isInvalid || ageResult.isInvalid;
            if (hasIssue) {
                dataQualityIssues.add(patient_id);
            }

            // Calculate total risk score
            const totalRiskScore = bpResult.score + tempResult.score + ageResult.score;

            // Categorize patient based on rules
            if (totalRiskScore >= 4) {
                highRiskPatients.add(patient_id);
            }

            const tempNumber = parseFloat(temperature);
            if (!tempResult.isInvalid && tempNumber >= 99.6) {
                feverPatients.add(patient_id);
            }
        }
        console.log("Patient processing complete.");

        // 4. Prepare submission payload
        const submissionPayload = {
            high_risk_patients: Array.from(highRiskPatients).sort(),
            fever_patients: Array.from(feverPatients).sort(),
            data_quality_issues: Array.from(dataQualityIssues).sort(),
        };

        console.log("\n--- Submission Payload ---");
        console.log(JSON.stringify(submissionPayload, null, 2));

        // 5. Submit results
        const submissionResult = await submitResults(submissionPayload);

        console.log("\n--- Submission Result ---");
        console.log(JSON.stringify(submissionResult, null, 2));

        if(submissionResult.success) {
            console.log(`\nAssessment successful! Final score: ${submissionResult.results.score}`);
        } else {
            console.error(`\nAssessment submission failed: ${submissionResult.message}`);
        }

    } catch (error) {
        console.error("\nAn unrecoverable error occurred during the process:", error.message);
        process.exit(1);
    }
}

// Execute the main function
main();