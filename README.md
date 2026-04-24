# 📄 ResuLens AI

![React](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-blue?style=flat-square)
![Python](https://img.shields.io/badge/Backend-FastAPI-green?style=flat-square)
![AI](https://img.shields.io/badge/AI-Gemini%203.1%20Pro-purple?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-gray?style=flat-square)

**ResuLens AI** is an intelligent, bias-free resume screening and candidate analysis pipeline. It automates the extraction of candidate data from PDF resumes, calculates a relevancy score against job descriptions using semantic matching, and provides a qualitative "Gap Analysis" using the latest Large Language Models (LLMs).

> **Project Status:** Active (Final Year Project)

---

## 🚀 Key Features

* **Multi-Resume Analysis:** Upload and process dozens of PDF resumes simultaneously with high-performance asynchronous processing.
* **🧠 Advanced Reasoning:** Utilizes **Gemini 3.1 Pro** for contextual data extraction and deep gap analysis.
* **🛡️ Resilient Pipeline:** Implements "Staggered Starts" and "Sanity Checks" to prevent API congestion and handle scanned documents gracefully.
* **🧠 Hybrid Scoring System:** Combines **Semantic Analysis** (Local BERT embeddings) for context and **Keyword Matching** for hard skills.
* **🔍 Narrative Gap Analysis:** Provides human-like, constructive feedback on why specific candidates fit the role.
* **Interactive Dashboard:** A modern, responsive UI built with React, TypeScript, and Tailwind CSS.

---

## 🏗️ System Architecture

ResuLens utilizes a decoupled frontend-backend architecture designed for speed and reliability.



### Data Flow
1. **Input:** User uploads PDFs and Job Description.
2. **Local NLP:** `SentenceTransformers` (BERT) calculates the Semantic Similarity Score locally.
3. **Async Processing:**
    * **Sanity Check:** System detects scanned vs. digital PDFs.
    * **Task A (Extraction):** Native Google GenAI SDK extracts JSON data (Name, Degree, Skills, Exp).
    * **Task B (Gap Analysis):** Pro-tier LLM performs a contextual delta analysis between the JD and Resume.
4. **Scoring Engine:** Calculates the final **APS (Applicant Profile Score)** based on weighted metrics.
5. **Output:** Frontend displays a dashboard and generates PDF reports.

---

## 🛠️ Tech Stack

### Frontend
* **Framework:** React 19 (Vite)
* **Language:** TypeScript
* **Styling:** Tailwind CSS v4

### Backend
* **Framework:** FastAPI (Python)
* **AI Engine:** Google GenAI SDK (`gemini-3.1-pro-preview`)
* **ML/NLP:** `sentence-transformers` (all-MiniLM-L6-v2)
* **PDF Parsing:** `pypdf`

---

## 🛠️ Prerequisites

* **Python:** 3.12.x (Required for optimized FastAPI performance and Typing support)
* **Node.js:** v18.0.0+
* **Google Cloud Console:** API Key with **Gemini API** enabled.

## ⚡ Getting Started


### 1. Backend Setup

# 1. Navigate to the backend folder
cd backend

# 2. Create the virtual environment (Ensuring Python 3.12)
# Windows:
py -3.12 -m venv .venv
# Mac/Linux:
python3.12 -m venv .venv

# 3. Activate the environment
# Windows:
.\.venv\Scripts\activate
# Mac/Linux:
source .venv/bin/activate

# 4. Verify the version (Should be 3.12.x)
python --version

# 5. Install dependencies
pip install -r requirements.txt

# 6. Set up Environment Variables
# Create a .env file in the /backend folder and add: GOOGLE_API_KEY=your_gemini_api_key_here

# 7. Start the server
uvicorn main:app --reload


### 2. Frontend Setup
cd frontend
npm install
npm run dev 
