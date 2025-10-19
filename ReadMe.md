# Patient Risk Scoring API Challenge - Solution

This repository contains a robust Node.js solution for the Ksense Technologies Patient Risk Scoring API Challenge. The script reliably fetches patient data from an unreliable API, calculates risk scores based on specified business logic, identifies patients for various alert lists, and submits the final analysis.

## Table of Contents

-   [Project Overview](#project-overview)
-   [Key Features](#key-features)
-   [Design Philosophy: The "Why"](#design-philosophy-the-why)
    -   [1. Separation of Concerns](#1-separation-of-concerns)
    -   [2. Building for Resilience](#2-building-for-resilience)
    -   [3. Defensive Programming & Data Sanitization](#3-defensive-programming--data-sanitization)
    -   [4. Readability and Maintainability](#4-readability-and-maintainability)
-   [Prerequisites](#prerequisites)
-   [How to Run](#how-to-run)
-   [Code Structure](#code-structure)

## Project Overview

The goal of this challenge is to create a system that can:

1.  **Interact with a REST API** that simulates real-world conditions like pagination, rate limiting, and intermittent failures.
2.  **Fetch all patient records** across multiple pages.
3.  **Implement a scoring algorithm** based on patient's blood pressure, temperature, and age.
4.  **Handle inconsistent and missing data** gracefully.
5.  **Categorize patients** into three distinct alert lists: `High-Risk`, `Fever`, and `Data Quality Issues`.
6.  **Submit the results** back to an API endpoint for evaluation.

This solution successfully accomplishes all of the above in a single, self-contained Node.js script.

## Key Features

-   **Resilient API Client**: Automatically retries failed API requests (`429`, `500`, `503` errors) with an exponential backoff strategy to handle API instability.
-   **Automatic Pagination**: Seamlessly fetches data from all available pages without manual configuration.
-   **Modular & Readable Logic**: The code is cleanly divided into API interaction, business logic (scoring), and orchestration, making it easy to understand and extend.
-   **Robust Data Validation**: Each scoring function is designed to handle invalid, missing (`null`, `undefined`), or malformed data (e.g., `"N/A"`, `"150/"`), correctly flagging them for the data quality list.
-   **Efficient Data Handling**: Uses `Set` objects to automatically manage unique patient IDs for each alert list, preventing duplicates.
-   **Informative Logging**: Provides clear console output to track the script's progress, from fetching pages to the final submission result.

## Design Philosophy: The "Why"

The structure and design of this solution were guided by several core software engineering principles to ensure it is not just correct, but also robust, readable, and maintainable.

### 1. Separation of Concerns

The script is logically divided into distinct, independent parts, each with a single responsibility.

-   **API Interaction (`fetchWithRetry`, `fetchAllPatients`)**: This part's only job is to communicate with the remote server. It knows how to handle network requests, retries, and pagination, but it has no knowledge of what a "patient" is or how to score them.
-   **Business Logic (`calculateBPRisk`, `calculateTempRisk`, `calculateAgeRisk`)**: These are "pure" functions. Their only job is to take an input (like a blood pressure string) and return a score and a validity flag. They are completely decoupled from the API and could be easily unit-tested or reused in another application.
-   **Orchestration (`main` function)**: This is the conductor. It uses the API client to get the data, passes that data to the business logic functions to get scores, organizes the results, and then uses the API client again to submit the final report. This keeps the main workflow clean and easy to follow.

### 2. Building for Resilience

The challenge prompt explicitly states the API is unreliable. The solution was built with this "real-world" constraint in mind from the start.

-   **Retry Mechanism**: A simple `fetch` would fail on the first `503` error. The `fetchWithRetry` wrapper is essential.
-   **Exponential Backoff**: Instead of just retrying immediately, the delay between retries increases exponentially (`1s`, `2s`, `4s`...). This is a standard industry practice that gives a struggling server time to recover, increasing the chance of a successful subsequent request.
-   **Polite Rate-Limiting Avoidance**: A small, constant delay (`REQUEST_DELAY_MS`) is added between fetching pages. This proactive measure reduces the likelihood of hitting a `429 Too Many Requests` error in the first place.

### 3. Defensive Programming & Data Sanitization

The prompt also warns about inconsistent and missing data. The code never assumes the data it receives is perfect.

-   **Every Input is Validated**: Each `calculate...` function acts as a gatekeeper. Before attempting any calculation, it checks if the input is `null`, `undefined`, or in an unusable format (e.g., non-numeric strings).
-   **Failing Gracefully**: When invalid data is found, the functions don't crash. They return a default score of `0` and a `isInvalid: true` flag. This allows the main loop to continue processing other patients while correctly identifying the record as having a data quality issue. This approach is far more robust than letting an unexpected `parseInt("N/A")` crash the entire script.

### 4. Readability and Maintainability

Code is read far more often than it is written. Therefore, clarity was a top priority.

-   **Meaningful Names**: Variables and functions are named to clearly describe their purpose (e.g., `submissionPayload`, `highRiskPatients`, `calculateBPRisk`).
-   **Minimal Dependencies**: The script uses the native `fetch` API available in modern Node.js, avoiding the need for external libraries like `axios` or `node-fetch` and simplifying setup.
-   **Data Structures with Intent**: A `Set` was chosen for the alert lists because the intent is to have a *unique collection of patient IDs*. This is both more efficient and clearer than pushing to an array and de-duplicating later.
-   **Logging as a Narrative**: The `console.log` statements are designed to tell a story of the script's execution, making it easy to debug and verify that each stage is completing as expected.

## Prerequisites

-   **Node.js**: Version 18.0.0 or higher is required, as the script uses the built-in `fetch` API.

## How to Run

1.  **Save the Code**: Save the provided solution as a file named `solve.js`.

2.  **Verify API Key**: The API key is hardcoded at the top of the script. Ensure it matches the one from the challenge instructions.

    ```javascript
    const API_KEY = 'ak_1894e840a8d34bfdb49d8c37175c7a8cb24f0b7b76911945';
    ```

3.  **Execute the Script**: Open your terminal, navigate to the directory where you saved the file, and run the following command:

    ```bash
    node solve.js
    ```

4.  **Observe the Output**: The script will log its progress in the console:
    -   It will show which page of patient data it is fetching.
    -   It will print the final JSON payload being sent for submission.
    -   It will display the complete response from the submission API, including your score and feedback.

    ```console
    Starting to fetch patient data...
    Fetching page 1...
    Fetching page 2...
    ...
    Successfully fetched a total of 50 patients.
    Processing patient data...
    Patient processing complete.

    --- Submission Payload ---
    {
      "high_risk_patients": [ ... ],
      "fever_patients": [ ... ],
      "data_quality_issues": [ ... ]
    }

    Submitting assessment...

    --- Submission Result ---
    {
      "success": true,
      "message": "Assessment submitted successfully",
      ...
    }

    Assessment successful! Final score: 95.5
    ```

## Code Structure

The single `solve.js` file is organized from top to bottom in a logical flow:

| Section                   | Purpose                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| **Configuration**         | Top-level constants for `API_KEY`, `BASE_URL`, retry settings, etc. Easy to modify.                 |
| **Helper Functions**      | Utility functions like `sleep` and the crucial `fetchWithRetry` used throughout the application.    |
| **Risk Scoring Functions**| The core business logic. Each function (`calculateBPRisk`, etc.) is isolated and testable.          |
| **Main Application Logic**| Contains the high-level functions that orchestrate the process: `fetchAllPatients`, `submitResults`, and the primary `main` function that ties everything together. |
| **Execution**             | A single call to `main()` at the end of the file to kick off the entire process.                    |