import os
import io
import re
import json
import asyncio
import pdfplumber
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field
from fastapi import FastAPI, UploadFile, HTTPException, File, Form, Depends
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from azure.storage.blob import BlobServiceClient, ContentSettings, generate_blob_sas, BlobSasPermissions
from sentence_transformers import SentenceTransformer, util
from google import genai
from google.genai import types
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from database import get_db
from auth import authenticate_user, create_access_token, get_current_user
from models import Job as JobModel, Batch as BatchModel, Candidate as CandidateModel, User

# Importing your existing logic from scoring.py
from scoring import get_final_aps, get_final_aps_v2, calculate_skill_score, normalize_degree

load_dotenv()
app = FastAPI(title="ResuLens AI API - Auditor Edition")

frontend_origin = os.getenv("FRONTEND_ORIGIN", "")
allowed_origins = [
    origin.strip()
    for origin in frontend_origin.split(",")
    if origin.strip()
]

if not allowed_origins:
    allowed_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CONCURRENCY_LIMIT = asyncio.Semaphore(1)

print("Loading Semantic Model (SBERT)...")
local_sim_model = SentenceTransformer('all-MiniLM-L6-v2')

client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

AZURE_STORAGE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "").strip()
AZURE_STORAGE_RESUME_CONTAINER = os.getenv("AZURE_STORAGE_RESUME_CONTAINER", "resumes").strip() or "resumes"
AZURE_STORAGE_RESUME_URL_TTL_MINUTES = int(os.getenv("AZURE_STORAGE_RESUME_URL_TTL_MINUTES", "60"))

blob_service_client = (
    BlobServiceClient.from_connection_string(AZURE_STORAGE_CONNECTION_STRING)
    if AZURE_STORAGE_CONNECTION_STRING else None
)

AI_MODELS = [
    "models/gemini-2.5-flash-lite",
    "models/gemini-2.5-flash",
    "models/gemini-3-flash-preview",
    "models/gemini-3.1-pro-preview"
]

STRATEGY_PRESETS = {
    "balanced": {
        "weights": {"w1": 0.25, "w2": 0.20, "w3": 0.20, "w4": 0.15, "w5": 0.10, "w6": 0.10},
        "label": "Balanced Screening",
        "description": "General-purpose screening that balances requirements, capability, experience, alignment, education, and evidence quality."
    },
    "capability": {
        "weights": {"w1": 0.25, "w2": 0.30, "w3": 0.15, "w4": 0.10, "w5": 0.10, "w6": 0.10},
        "label": "Skills & Capability Focus",
        "description": "Prioritizes role-specific skills, competencies, tools, procedures, and professional capabilities."
    },
    "experience": {
        "weights": {"w1": 0.20, "w2": 0.15, "w3": 0.30, "w4": 0.10, "w5": 0.10, "w6": 0.15},
        "label": "Experience & Evidence Focus",
        "description": "Prioritizes relevant work history, responsibility overlap, and clearly supported resume evidence."
    }
}

# --- THE AUDITOR CONTRACT (Matches New UI Requirements) ---

class Token(BaseModel):
    access_token: str
    token_type: str

# Create a new Pydantic schema for the structured job
class JobStructure(BaseModel):
    title: str
    employment_type: str
    exp_level: str
    location: str
    technical_skills: str
    tools_software: str
    certifications: str
    education_level: str
    years_exp: str
    languages: str
    responsibilities: str
    soft_skills: str
    must_haves: str
    nice_to_haves: str
    culture_fit: str

class ComponentScore(BaseModel):
    score: int = Field(
        ge=0,
        le=100,
        description="Score from 0 to 100 based only on resume evidence and job requirements."
    )
    reason: str = Field(description="Short explanation justifying the score.")
    evidence: List[str] = Field(
        default_factory=list,
        description="Resume evidence snippets supporting this component score."
    )
    missing_or_weak: List[str] = Field(
        default_factory=list,
        description="Important missing, weak, or unclear areas compared with the job requirements."
    )


class ComponentScores(BaseModel):
    core_requirement_match: ComponentScore = Field(
        description="How well the candidate satisfies the must-have requirements of the job."
    )
    role_specific_capability: ComponentScore = Field(
        description="How strong the candidate's role-relevant skills, tools, methods, procedures, or competencies are."
    )
    experience_relevance: ComponentScore = Field(
        description="How closely the candidate's previous work, projects, and responsibilities align with the target role."
    )
    education_credential_fit: ComponentScore = Field(
        description="How well the candidate's education, certifications, licenses, or credentials support the role."
    )
    evidence_quality: ComponentScore = Field(
        description="How clearly the resume provides concrete evidence for its claims."
    )


class ScoringExplanations(BaseModel):
    core_requirement: str = Field(description="Explanation of must-have requirement coverage.")
    role_capability: str = Field(description="Explanation of role-specific skills, tools, methods, or professional capabilities.")
    experience_relevance: str = Field(description="Explanation of how relevant the candidate's work history is to the role.")
    role_alignment: str = Field(description="Explanation of the candidate's overall role-context alignment.")
    education_credential: str = Field(description="Explanation of education, certification, license, or credential fit.")
    evidence_confidence: str = Field(description="Explanation of how strong or weak the resume evidence is.")
    overall_match: str = Field(description="High-level recruiter briefing on candidate suitability.")
    recommendation_summary: str = Field(description="Recruiter-facing paragraph explaining the final recommendation decision.")


class SkillEvidence(BaseModel):
    name: str
    snippet: str = Field(description="Exact quote or concise evidence from the resume.")


class ResumeExtraction(BaseModel):
    name: str
    location: str = Field(
        description="Candidate's current location only if explicitly found in the resume. Return 'Unknown' if not found. Never infer from job description."
    )
    location_evidence_snippet: str = Field(
        description="Exact resume text proving the candidate location. Return empty string if no location is found."
    )
    degree: str
    years_exp: float

    extracted_capabilities: List[SkillEvidence] = Field(
        description="Role-relevant skills, tools, methods, procedures, certifications, responsibilities, or competencies found in the resume."
    )

    component_scores: ComponentScores

    location_rating: str = Field(description="'High', 'Medium', 'Low', or 'Unknown'")
    education_rating: str = Field(description="'High', 'Medium', 'Low', or 'Unknown'")
    experience_rating: str = Field(description="'High', 'Medium', 'Low', or 'Unknown'")

    verdict: str
    interview_questions: List[str]
    explanations: ScoringExplanations
    gap_summary: str
    cleaned_career_summary: str

class CandidateAnalysis(BaseModel):
    name: str
    score: int
    match_level: str
    is_recommended: bool
    recommendation_status: str
    summary: str
    recommendation_summary: str
    interview_questions: List[str]

    location: str
    stage: str = "Screening"

    location_fit: str
    experience_fit: str
    technical_fit: str
    education_fit: str

    about_candidate: str
    match_issues: str

    tech_score: int
    exp_score: int
    location_score: int

    location_explanation: str
    experience_explanation: str
    technical_explanation: str
    education_explanation: str

# --- Database Models (for reference, not the actual SQLAlchemy models) ---

class JobBasicInput(BaseModel):
    employmentType: str = ""
    expLevel: str = ""
    location: str = "Not specified"


class JobRoleInput(BaseModel):
    skills: str = ""
    tools: str = ""
    certs: str = ""


class JobQualificationsInput(BaseModel):
    education: str = ""
    experience: str = ""
    languages: str = ""


class JobAdditionalInput(BaseModel):
    responsibilities: str = ""
    softSkills: str = ""
    culturalFit: str = ""


class JobDetailsInput(BaseModel):
    basic: JobBasicInput
    technical: JobRoleInput
    qualifications: JobQualificationsInput
    additional: JobAdditionalInput


class JobInput(BaseModel):
    title: str
    status: str = "Active"
    positionStatus: str = "Open"
    details: JobDetailsInput
    scoringStrategy: str = "balanced"
    strongThreshold: int = 75
    minimumInterviewThreshold: int = 50

class BatchInput(BaseModel):
    id: str
    count: int = 0
    status: str = "Completed"


class CandidateStageInput(BaseModel):
    stage: str

class CandidateSeenInput(BaseModel):
    is_new: bool

class CandidateInput(BaseModel):
    candidate_id: Optional[str] = None
    name: str
    score: int = 0
    match_level: str = "Low"
    is_recommended: bool = False
    recommendation_status: str = "NO"

    summary: str = ""
    recommendation_summary: str = ""
    interview_questions: List[str] = Field(default_factory=list)

    location: str = "Unknown"
    stage: str = "Screening"

    location_fit: str = "Unknown"
    experience_fit: str = "Unknown"
    technical_fit: str = "Unknown"
    education_fit: str = "Unknown"

    about_candidate: str = ""
    match_issues: str = ""

    tech_score: int = 0
    exp_score: int = 0
    location_score: int = 0

    location_explanation: str = ""
    experience_explanation: str = ""
    technical_explanation: str = ""
    education_explanation: str = ""

    resume_filename: Optional[str] = None
    resume_url: Optional[str] = None
    resume_storage_url: Optional[str] = None

    score_breakdown: Dict[str, Any] = Field(default_factory=dict)
    component_scores: Dict[str, Any] = Field(default_factory=dict)

    is_new: bool = False

# --- DATA EXTRACTION ENGINE ---

@app.post("/token", response_model=Token)
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = authenticate_user(db, form_data.username, form_data.password)

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        data={
            "sub": user.username,
            "role": user.role
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer"
    }

def model_to_dict(model_obj):
    if hasattr(model_obj, "model_dump"):
        return model_obj.model_dump()
    return model_obj.dict()


def get_job_or_404(db: Session, job_id: str) -> JobModel:
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID format.")

    job = db.query(JobModel).filter(JobModel.id == job_uuid).first()

    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    return job


def serialize_job(job: JobModel, candidates: Optional[list] = None, batches: Optional[list] = None) -> dict:
    return {
        "id": str(job.id),
        "title": job.title,
        "status": job.status,
        "positionStatus": job.position_status,
        "createdAt": (
            job.created_at.astimezone(timezone.utc)
            .isoformat(timespec="seconds")
            .replace("+00:00", "Z")
            if job.created_at else None
        ),
        "details": {
            "basic": job.details_basic or {},
            "technical": job.details_role or {},
            "qualifications": job.details_qualifications or {},
            "additional": job.details_additional or {}
        },
        "scoringStrategy": job.scoring_strategy,
        "strongThreshold": job.strong_threshold,
        "minimumInterviewThreshold": job.minimum_interview_threshold,
        "candidates": candidates or [],
        "batches": batches or []
    }

def serialize_batch(batch: BatchModel) -> dict:
    return {
        "id": batch.batch_code,
        "dbId": str(batch.id),
        "date": batch.created_at.isoformat() if batch.created_at else None,
        "count": batch.total_files,
        "status": batch.status
    }


def parse_storage_connection_string(connection_string: str) -> dict:
    parsed = {}

    for segment in connection_string.split(";"):
        if "=" not in segment:
            continue
        key, value = segment.split("=", 1)
        parsed[key] = value

    return parsed


def build_signed_resume_url(blob_name: Optional[str]) -> Optional[str]:
    if not blob_name:
        return None

    if blob_name.startswith("http://") or blob_name.startswith("https://"):
        return blob_name

    if not blob_service_client or not AZURE_STORAGE_CONNECTION_STRING:
        return None

    connection_parts = parse_storage_connection_string(AZURE_STORAGE_CONNECTION_STRING)
    account_name = connection_parts.get("AccountName")
    account_key = connection_parts.get("AccountKey")

    if not account_name or not account_key:
        return None

    sas_token = generate_blob_sas(
        account_name=account_name,
        container_name=AZURE_STORAGE_RESUME_CONTAINER,
        blob_name=blob_name,
        account_key=account_key,
        permission=BlobSasPermissions(read=True),
        expiry=datetime.now(timezone.utc) + timedelta(minutes=AZURE_STORAGE_RESUME_URL_TTL_MINUTES)
    )

    return (
        f"https://{account_name}.blob.core.windows.net/"
        f"{AZURE_STORAGE_RESUME_CONTAINER}/{blob_name}?{sas_token}"
    )


def upload_resume_bytes(file_bytes: bytes, filename: str) -> Optional[str]:
    if not blob_service_client:
        return None

    safe_filename = os.path.basename(filename or "resume.pdf")
    blob_name = f"{uuid.uuid4()}-{safe_filename}"
    container_client = blob_service_client.get_container_client(AZURE_STORAGE_RESUME_CONTAINER)

    try:
        container_client.create_container()
    except Exception:
        pass

    blob_client = container_client.get_blob_client(blob_name)
    blob_client.upload_blob(
        file_bytes,
        overwrite=True,
        content_settings=ContentSettings(
            content_type="application/pdf",
            content_disposition=f'inline; filename="{safe_filename}"'
        )
    )

    return blob_name


def serialize_candidate(candidate: CandidateModel) -> dict:
    return {
        "candidate_id": str(candidate.id),
        "name": candidate.name,
        "score": int(float(candidate.score or 0)),
        "match_level": candidate.match_level,
        "is_recommended": candidate.is_recommended,
        "recommendation_status": candidate.recommendation_status,

        "summary": candidate.summary or "",
        "recommendation_summary": candidate.recommendation_summary or "",
        "interview_questions": candidate.interview_questions or [],

        "location": candidate.location or "Unknown",
        "stage": candidate.stage or "Screening",

        "location_fit": candidate.location_fit or "Unknown",
        "experience_fit": candidate.experience_fit or "Unknown",
        "technical_fit": candidate.role_capability_fit or "Unknown",
        "education_fit": candidate.education_fit or "Unknown",

        "about_candidate": candidate.about_candidate or "",
        "match_issues": candidate.match_issues or "",

        "tech_score": candidate.role_capability_score or 0,
        "exp_score": candidate.experience_relevance_score or 0,
        "location_score": candidate.location_score or 0,

        "location_explanation": candidate.location_explanation or "",
        "experience_explanation": candidate.experience_explanation or "",
        "technical_explanation": candidate.role_capability_explanation or "",
        "education_explanation": candidate.education_explanation or "",

        "resume_filename": candidate.resume_filename,
        "resume_storage_url": candidate.resume_storage_url,
        "resume_url": build_signed_resume_url(candidate.resume_storage_url),

        "score_breakdown": candidate.score_breakdown or {},
        "component_scores": candidate.component_scores or {},

        "is_new": candidate.is_new
    }


def get_candidate_or_404(db: Session, job_id: str, candidate_id: str) -> CandidateModel:
    job = get_job_or_404(db, job_id)

    try:
        candidate_uuid = uuid.UUID(candidate_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid candidate ID format.")

    candidate = (
        db.query(CandidateModel)
        .filter(CandidateModel.id == candidate_uuid, CandidateModel.job_id == job.id)
        .first()
    )

    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")

    return candidate

async def query_ai_analysis(pdf_bytes: Optional[bytes], text: Optional[str], job_desc: str):
    """
    General-domain resume screening analyst.
    Uses Native PDF first, falls back to text.
    """
    prompt = f"""
    Act as a Senior Recruitment Analyst and Screening Auditor.

    Analyze this resume strictly against the following Job Description.

    IMPORTANT:
    - This system must work for any job domain, not only IT.
    - Adapt the evaluation to the role domain: healthcare, education, finance, engineering, operations, sales, HR, administration, software, or any other field.
    - Do NOT assume the job is technical unless the job description clearly indicates it.
    - Use only resume evidence. Do not invent experience, credentials, skills, licenses, or location.
    - If evidence is weak or missing, score lower and explain why.

    JOB DESCRIPTION CONTEXT:
    {job_desc[:2500]}

    YOUR TASK:
    1. Extract the candidate's name.
    2. Extract current location only if explicitly written in the resume.
       - Do NOT infer candidate location from the job description.
       - Do NOT copy the job location into candidate location.
       - If no location is found, set location to "Unknown" and location_evidence_snippet to empty string.
    3. Extract degree/education and estimated years of relevant experience.
    4. Extract role-relevant capabilities from the resume.
       These may include skills, tools, software, procedures, certifications, licenses, responsibilities, methods, equipment, domain knowledge, or professional competencies.
    5. Score the candidate using these evidence-based components:

       A. Core Requirement Match
       - How well the candidate satisfies must-have job requirements.

       B. Role-Specific Capability
       - How strong the candidate's job-relevant skills, tools, methods, procedures, or competencies are.

       C. Experience Relevance
       - How closely the candidate's past work, projects, and responsibilities align with the target role.

       D. Education & Credential Fit
       - How well the candidate's degree, certification, license, or formal qualification supports the role.

       E. Evidence Quality / Confidence
       - How strongly the resume provides concrete evidence for the screening decision.

    6. For every component score:
       - Return a score from 0 to 100.
       - Provide a reason.
       - Provide resume evidence snippets.
       - Provide missing or weak areas.
    7. Provide interview questions based on gaps or uncertain areas.
    8. Provide a recruiter-facing recommendation summary.

    SCORING RULES:
    - 90-100: Excellent evidence-backed match.
    - 75-89: Strong match with minor gaps.
    - 50-74: Partial or moderate match.
    - 25-49: Weak match with important gaps.
    - 0-24: Little or no evidence of match.
    """

    contents = [
        types.Part.from_bytes(data=pdf_bytes, mime_type='application/pdf'),
        prompt
    ] if pdf_bytes else [f"{prompt}\n\nResume Text:\n{text}"]

    for model_id in AI_MODELS:
        try:
            response = await client.aio.models.generate_content(
                model=model_id,
                contents=contents,
                config=types.GenerateContentConfig(
                    response_mime_type='application/json',
                    response_schema=ResumeExtraction,
                    temperature=0.1
                )
            )

            if response and response.text:
                return json.loads(response.text)

        except Exception as e:
            print(f"🔄 Tier {model_id} failed: {str(e)[:80]}")
            continue

    raise Exception("AI Analysis Tiers Exhausted")

def build_score_breakdown(scoring_input: dict, weights: dict) -> dict:
    """
    Builds an explainable APS v2 score breakdown for the frontend.
    Supports both decimal weights, such as 0.25, and percentage weights, such as 25.
    """

    def normalize_weight(weight_value):
        try:
            weight_value = float(weight_value)
        except (ValueError, TypeError):
            return 0.0

        return weight_value * 100 if weight_value <= 1 else weight_value

    def build_component(label: str, score_decimal: float, weight_key: str):
        try:
            score_decimal = float(score_decimal)
        except (ValueError, TypeError):
            score_decimal = 0.0

        score_decimal = max(0.0, min(score_decimal, 1.0))

        weight_percent = normalize_weight(weights.get(weight_key, 0))
        score_percent = round(score_decimal * 100, 2)
        contribution = round(score_percent * (weight_percent / 100), 2)

        return {
            "label": label,
            "score": score_percent,
            "weight": round(weight_percent, 2),
            "contribution": contribution
        }

    return {
        "core_requirement": build_component(
            "Core Requirement Match",
            scoring_input.get("s_core", 0),
            "w1"
        ),
        "role_capability": build_component(
            "Role-Specific Capability",
            scoring_input.get("s_role_capability", 0),
            "w2"
        ),
        "experience_relevance": build_component(
            "Experience Relevance",
            scoring_input.get("s_experience_relevance", 0),
            "w3"
        ),
        "role_alignment": build_component(
            "Role Context Alignment",
            scoring_input.get("s_role_alignment", 0),
            "w4"
        ),
        "education_credential": build_component(
            "Education & Credential Fit",
            scoring_input.get("s_education_credential", 0),
            "w5"
        ),
        "evidence_confidence": build_component(
            "Evidence Quality / Confidence",
            scoring_input.get("s_evidence_confidence", 0),
            "w6"
        )
    }

# --- THE WORKER ---

async def process_resume(file: UploadFile, job_description: str, req_skills_list: list, req_exp: int, weights: dict):
    async with CONCURRENCY_LIMIT:
        try:
            pdf_bytes = await file.read()

            try:
                ai_data = await query_ai_analysis(pdf_bytes, None, job_description)
                mode = "Gemini Native"
                raw_text = ""
            except Exception:
                with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                    raw_text = " ".join([p.extract_text() or "" for p in pdf.pages])

                try:
                    ai_data = await query_ai_analysis(None, raw_text, job_description)
                    mode = "Gemini Text-Fallback"
                except Exception:
                    mode = "Local Emergency"

                    ai_data = {
                        "name": file.filename.rsplit('.', 1)[0],
                        "location": "Unknown",
                        "location_evidence_snippet": "",
                        "degree": "Not Parsed",
                        "years_exp": 0.0,
                        "extracted_capabilities": [],
                        "component_scores": {
                            "core_requirement_match": {
                                "score": 10,
                                "reason": "AI service unavailable. Must-have requirements could not be reliably evaluated.",
                                "evidence": [],
                                "missing_or_weak": ["Manual review required."]
                            },
                            "role_specific_capability": {
                                "score": 10,
                                "reason": "AI service unavailable. Role-specific capability could not be reliably evaluated.",
                                "evidence": [],
                                "missing_or_weak": ["Manual review required."]
                            },
                            "experience_relevance": {
                                "score": 10,
                                "reason": "AI service unavailable. Experience relevance could not be reliably evaluated.",
                                "evidence": [],
                                "missing_or_weak": ["Manual review required."]
                            },
                            "education_credential_fit": {
                                "score": 10,
                                "reason": "AI service unavailable. Education and credentials could not be reliably evaluated.",
                                "evidence": [],
                                "missing_or_weak": ["Manual review required."]
                            },
                            "evidence_quality": {
                                "score": 10,
                                "reason": "AI service unavailable. Resume evidence quality could not be reliably evaluated.",
                                "evidence": [],
                                "missing_or_weak": ["Manual review required."]
                            }
                        },
                        "location_rating": "Unknown",
                        "education_rating": "Unknown",
                        "experience_rating": "Unknown",
                        "verdict": "Manual Review Required",
                        "interview_questions": ["Manual verification required because AI analysis was unavailable."],
                        "explanations": {
                            "core_requirement": "Manual verification required.",
                            "role_capability": "Manual verification required.",
                            "experience_relevance": "Manual verification required.",
                            "role_alignment": "AI service unavailable. Semantic alignment used only if resume text was available.",
                            "education_credential": "Manual verification required.",
                            "evidence_confidence": "Manual verification required.",
                            "overall_match": "AI service unavailable. Manual review is required.",
                            "recommendation_summary": "Manual review is recommended because the AI service was unavailable."
                        },
                        "cleaned_career_summary": raw_text[:1000],
                        "gap_summary": "AI offline. Unable to analyze screening gaps."
                    }

            component_scores = ai_data.get("component_scores", {})

            def component_decimal(component_key: str) -> float:
                component = component_scores.get(component_key, {})
                try:
                    return max(0.0, min(float(component.get("score", 0)) / 100.0, 1.0))
                except (ValueError, TypeError):
                    return 0.0

            # Local SBERT Role Context Alignment
            clean_summary = str(ai_data.get("cleaned_career_summary", "") or "").strip()
            job_description = job_description.strip()

            if clean_summary and job_description:
                emb = local_sim_model.encode([clean_summary, job_description])
                s_role_alignment = float(util.cos_sim(emb[0], emb[1])[0][0])
                s_role_alignment = max(0.0, min(s_role_alignment, 1.0))
            else:
                s_role_alignment = 0.0

            scoring_input = {
                "s_core": component_decimal("core_requirement_match"),
                "s_role_capability": component_decimal("role_specific_capability"),
                "s_experience_relevance": component_decimal("experience_relevance"),
                "s_role_alignment": s_role_alignment,
                "s_education_credential": component_decimal("education_credential_fit"),
                "s_evidence_confidence": component_decimal("evidence_quality")
            }

            final_aps_score = get_final_aps_v2(scoring_input, weights)
            score_breakdown = build_score_breakdown(scoring_input, weights)

            raw_capabilities = ai_data.get("extracted_capabilities", [])

            return {
                "filename": file.filename,
                "candidate_name": ai_data.get("name", "Unknown"),
                "location": ai_data.get("location", "Unknown"),
                "location_evidence_snippet": ai_data.get("location_evidence_snippet", ""),
                "location_rating": ai_data.get("location_rating", "Unknown"),
                "education_rating": ai_data.get("education_rating", "Unknown"),
                "experience_rating": ai_data.get("experience_rating", "Unknown"),
                "degree": ai_data.get("degree", ""),
                "years_exp": ai_data.get("years_exp", 0),
                "overall_aps_score": final_aps_score,
                "score_breakdown": score_breakdown,
                "component_scores": component_scores,
                "mode": mode,
                "recommendation": ai_data.get("verdict", "No recommendation provided."),
                "interview_questions": ai_data.get("interview_questions", []),
                "explanations": ai_data.get("explanations", {}),
                "breakdown": {
                    "core_requirement_match": round(scoring_input["s_core"] * 100, 2),
                    "role_capability": round(scoring_input["s_role_capability"] * 100, 2),
                    "experience_relevance": round(scoring_input["s_experience_relevance"] * 100, 2),
                    "role_alignment": round(s_role_alignment * 100, 2),
                    "education_credential": round(scoring_input["s_education_credential"] * 100, 2),
                    "evidence_confidence": round(scoring_input["s_evidence_confidence"] * 100, 2)
                },
                "evidence_skills": raw_capabilities,
                "ai_gap_analysis": ai_data.get("gap_summary", "")
            }

        except Exception as e:
            print(f"❌ Fatal error on {file.filename}: {e}")
            return {"filename": file.filename, "error": str(e), "overall_aps_score": 0}
        
@app.post("/generate-job-structure")
async def generate_structure(
    data: dict,
    current_user: User = Depends(get_current_user)
):
    description = data.get("description", "")
    
    contents = [
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=f"""
            Act as a Senior Recruitment Analyst.

            Generate a detailed, structured job profile based on this role description:

            {description}

            IMPORTANT:
            - This system is for general resume screening, not only IT or software roles.
            - Adapt the generated job profile to the actual job domain.
            - The role may be in healthcare, education, finance, engineering, sales, operations, administration, HR, marketing, software, or any other field.
            - Do not assume the job is technical unless the role description clearly indicates it.

            FIELD GUIDANCE:
            - technical_skills should contain role-specific skills, capabilities, competencies, or professional abilities.
              Examples:
              - Marketing role: campaign planning, content strategy, client communication, market research
              - Accounting role: bookkeeping, financial reporting, tax preparation, audit support
              - Nursing role: patient care, medication administration, clinical documentation
              - Teaching role: lesson planning, classroom management, curriculum delivery
              - Software role: Python, API development, database design, debugging

            - tools_software should contain tools, software, equipment, systems, platforms, or methods used in the role.
              Examples:
              - Marketing role: Google Analytics, Meta Business Suite, Canva, CRM tools
              - Accounting role: Excel, SQL Accounting, AutoCount, audit working papers
              - Nursing role: EMR system, vital signs equipment, clinical protocols
              - Teaching role: LMS, Google Classroom, teaching aids
              - Software role: Git, Docker, VS Code, Postman

            - certifications should contain certifications, licenses, credentials, professional memberships, or required training.
              Examples:
              - Nursing role: nursing license, BLS certification
              - Accounting role: ACCA, CPA, LCCI
              - Safety role: OSHA, NIOSH, safety training
              - Teaching role: teaching certificate
              - Software role: AWS certification, cybersecurity certification

            FORMATTING RULES:
            - technical_skills must be a comma-separated list of concise atomic items.
            - tools_software must be a comma-separated list of concise atomic items.
            - certifications must be a comma-separated list if applicable.
            - responsibilities should be clear and role-specific.
            - soft_skills should contain professional/interpersonal skills relevant to the role.
            - culture_fit should include additional must-haves, work context, availability, travel, shift requirements, or workplace expectations where relevant.
            - If a field is not specified or not applicable, return "Not specified".
            """)]
        )
    ]

    for model_id in AI_MODELS:
        try:
            print(f"🤖 Attempting Job Generation with: {model_id}...")

            response = await client.aio.models.generate_content(
                model=model_id,
                contents=contents,
                config=types.GenerateContentConfig(
                    response_mime_type='application/json',
                    response_schema=JobStructure,
                    temperature=0.1
                )
            )
            
            if response and response.text:
                print(f"✅ SUCCESS: Job Structure generated via {model_id}")
                return json.loads(response.text)
                
        except Exception as e:
            print(f"❌ Tier {model_id} failed: {str(e)[:100]}")
            continue
            
    raise HTTPException(status_code=500, detail="AI Analysis Tiers Exhausted")

def extract_known_skills(text: str) -> list:
    text_lower = str(text or "").lower()

    skill_patterns = {
        "python": r"\bpython\b",
        "java": r"\bjava\b",
        "c++": r"\bc\+\+\b",
        "c": r"\bc\b",
        "javascript": r"\bjavascript\b|\bjava script\b|\bjs\b",
        "html": r"\bhtml\b",
        "css": r"\bcss\b",
        "php": r"\bphp\b",
        "dart": r"\bdart\b",
        "flutter": r"\bflutter\b",
        "mysql": r"\bmysql\b|\bmy sql\b",
        "sql": r"\bsql\b",
        "git": r"\bgit\b|\bgithub\b|\bversion control\b",
        "github": r"\bgithub\b",
        "data structures": r"\bdata structures?\b",
        "algorithms": r"\balgorithms?\b",
        "sdlc": r"\bsdlc\b|\bsoftware development lifecycle\b|\bdevelopment lifecycle\b",
        "command line": r"\bcommand line\b|\bcli\b",
        "visual studio": r"\bvisual studio\b|\bvs code\b|\bvscode\b",
        "intellij": r"\bintellij\b"
    }

    found = []

    for skill, pattern in skill_patterns.items():
        if re.search(pattern, text_lower):
            found.append(skill)

    return found

def score_to_fit(score: float) -> str:
    try:
        score = float(score)
    except (ValueError, TypeError):
        return "Unknown"

    if score >= 75:
        return "High"
    if score >= 50:
        return "Medium"
    if score > 0:
        return "Low"
    return "Unknown"


def recommendation_from_score(
    score: float,
    strong_threshold: int = 75,
    minimum_threshold: int = 50
) -> str:
    try:
        score = float(score)
    except (ValueError, TypeError):
        return "NO"

    if score >= strong_threshold:
        return "YES"

    if score >= minimum_threshold:
        return "POTENTIAL"

    return "NO"
    

def calculate_location_score(candidate_location: str, job_location: str) -> int:
    candidate_location = str(candidate_location or "").lower().strip()
    job_location = str(job_location or "").lower().strip()

    if not candidate_location or candidate_location == "unknown":
        return 0

    if not job_location or job_location == "not specified":
        return 0

    if "remote" in job_location:
        return 100

    if candidate_location == job_location:
        return 100

    candidate_parts = [p.strip() for p in candidate_location.split(",") if p.strip()]
    job_parts = [p.strip() for p in job_location.split(",") if p.strip()]

    if any(part in job_location for part in candidate_parts):
        return 80

    if any(part in candidate_location for part in job_parts):
        return 80

    return 20

def sanitize_candidate_location(candidate_location: str, job_location: str, evidence_snippet: str) -> str:
    candidate_location = str(candidate_location or "").strip()
    evidence_snippet = str(evidence_snippet or "").strip()

    if not candidate_location:
        return "Unknown"

    if candidate_location.lower() in ["unknown", "not found", "not specified", "none", "n/a"]:
        return "Unknown"

    # If there is no resume evidence, do not trust the extracted location.
    # This prevents Gemini from copying the job location into the candidate location.
    if not evidence_snippet:
        return "Unknown"

    return candidate_location

def build_match_issues(raw_gap: str, role_score: int, role_fit: str, requirement_text: str) -> str:
    raw_gap = str(raw_gap or "").strip()
    requirement_text = str(requirement_text or "").strip()
    raw_gap_lower = raw_gap.lower()

    weak_phrases = [
        "no major gaps",
        "no significant gaps",
        "no significant competency gaps",
        "no significant competency gap",
        "no critical gaps",
        "no critical gap",
        "none",
        "n/a"
    ]

    is_generic_gap = (
        any(phrase in raw_gap_lower for phrase in weak_phrases)
        or len(raw_gap) < 20
    )

    if role_score < 50:
        return (
            f"The candidate shows limited verified coverage of the role-specific requirements. "
            f"The current role capability match is {role_score}/100 ({role_fit}). "
            f"Further screening should verify the required areas: "
            f"{requirement_text or 'the listed job requirements'}."
        )

    if role_score < 75 and is_generic_gap:
        return (
            f"The candidate shows partial alignment with the role, but the role capability match is {role_score}/100 ({role_fit}). "
            f"Interviewers should verify depth of experience in the required areas: "
            f"{requirement_text or 'the listed job requirements'}."
        )

    return raw_gap or "No major gaps identified."

@app.post("/analyze")
async def analyze_resumes(
    files: List[UploadFile] = File(...), 
    jobDescription: str = Form(""),
    reqSkills: str = Form(""),
    reqExp: int = Form(1),
    strategy: str = Form("balanced"),
    current_user: User = Depends(get_current_user)
):
    req_skills_list = [s.strip() for s in reqSkills.split(",") if s.strip()]
    selected_strategy = STRATEGY_PRESETS.get(strategy, STRATEGY_PRESETS["balanced"])
    weights = selected_strategy["weights"]
    
    tasks = [process_resume(f, jobDescription, req_skills_list, reqExp, weights) for f in files]
    results = await asyncio.gather(*tasks)
    results.sort(key=lambda x: x.get("overall_aps_score", 0), reverse=True)
    return results

def build_about_candidate(name: str, degree: str, years_exp: float, location: str, breakdown: dict, evidence_skills: list) -> str:
    name = name or "This candidate"
    degree = str(degree or "").strip()
    location = str(location or "").strip()

    skill_names = []
    for skill in evidence_skills or []:
        if isinstance(skill, dict):
            skill_name = skill.get("name", "")
        else:
            skill_name = getattr(skill, "name", "")

        if skill_name:
            skill_names.append(skill_name)

    skill_preview = ", ".join(skill_names[:6])

    parts = []

    intro = f"{name} is a candidate"
    if degree and degree.lower() not in ["not parsed", "unknown"]:
        intro += f" with an academic background in {degree}"
    if location and location.lower() not in ["unknown", "not found", "not specified"]:
        intro += f" based in {location}"
    intro += "."

    parts.append(intro)

    if years_exp:
        parts.append(f"The resume indicates approximately {years_exp} year(s) of experience or relevant project exposure.")

    if skill_preview:
        parts.append(f"Their resume highlights technical exposure to {skill_preview}.")

    return " ".join(parts)

def map_result_to_ui(
    raw_result: dict,
    job_location: str,
    req_tech_str: str,
    strong_threshold: int,
    minimum_interview_threshold: int
) -> dict:
    bd = raw_result.get("breakdown", {})

    score = raw_result.get("overall_aps_score", 0)

    role_capability_score = int(bd.get("role_capability", 0))
    experience_score = int(bd.get("experience_relevance", 0))
    education_score = int(bd.get("education_credential", 0))

    technical_fit = score_to_fit(role_capability_score)
    experience_fit = score_to_fit(experience_score)
    education_fit = score_to_fit(education_score)

    candidate_location = sanitize_candidate_location(
        raw_result.get("location", "Unknown"),
        job_location,
        raw_result.get("location_evidence_snippet", "")
    )

    location_score = calculate_location_score(
        candidate_location,
        job_location
    )

    location_fit = score_to_fit(location_score)

    recommendation_status = recommendation_from_score(
        score,
        strong_threshold,
        minimum_interview_threshold
    )

    match_issues = build_match_issues(
        raw_result.get("ai_gap_analysis", ""),
        role_capability_score,
        technical_fit,
        req_tech_str
    )

    explanations = raw_result.get("explanations") or {}

    return {
        "name": raw_result.get("candidate_name", "Unknown"),
        "score": int(score),
        "match_level": score_to_fit(score),
        "is_recommended": recommendation_status == "YES",
        "recommendation_status": recommendation_status,
        "score_breakdown": raw_result.get("score_breakdown", {}),
        "component_scores": raw_result.get("component_scores", {}),

        "summary": raw_result.get("recommendation", "Evaluation complete."),
        "recommendation_summary": explanations.get("recommendation_summary", ""),
        "interview_questions": raw_result.get("interview_questions", []),

        "location": candidate_location,
        "stage": "Screening",

        "location_fit": location_fit,
        "education_fit": education_fit,
        "experience_fit": experience_fit,
        "technical_fit": technical_fit,

        "about_candidate": build_about_candidate(
            raw_result.get("candidate_name", "This candidate"),
            raw_result.get("degree", ""),
            raw_result.get("years_exp", 0),
            candidate_location,
            raw_result.get("breakdown", {}),
            raw_result.get("evidence_skills", [])
        ),

        "match_issues": match_issues,

        "tech_score": role_capability_score,
        "exp_score": experience_score,
        "location_score": location_score,

        "location_explanation": (
            f"Candidate location is {candidate_location}. "
            f"Job location requirement is {job_location}."
        ),
        "experience_explanation": explanations.get("experience_relevance", ""),
        "technical_explanation": explanations.get("role_capability", ""),
        "education_explanation": explanations.get("education_credential", "")
    }

def prepare_screening_context(jobDetails: str, weights: str, settings: Optional[str]) -> dict:
    try:
        job_reqs = json.loads(jobDetails)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid jobDetails JSON format.")

    basic = job_reqs.get("basic", {})
    technical = job_reqs.get("technical", {})
    qualifications = job_reqs.get("qualifications", {})
    additional = job_reqs.get("additional", {})

    job_title = job_reqs.get("title", "")
    employment_type = basic.get("employmentType", job_reqs.get("employment_type", ""))
    exp_level = basic.get("expLevel", job_reqs.get("exp_level", ""))
    job_location = basic.get("location", job_reqs.get("location", "Not specified"))

    req_tech_str = technical.get("skills", job_reqs.get("technical_skills", ""))
    tools_software = technical.get("tools", job_reqs.get("tools_software", ""))
    certifications = technical.get("certs", job_reqs.get("certifications", ""))

    education_level = qualifications.get("education", job_reqs.get("education_level", ""))
    raw_exp = (
        qualifications.get("experience")
        or job_reqs.get("years_exp")
        or job_reqs.get("experience")
        or job_reqs.get("required_experience")
        or exp_level
        or "1"
    )

    languages = qualifications.get("languages", job_reqs.get("languages", ""))
    responsibilities = additional.get("responsibilities", job_reqs.get("responsibilities", ""))
    soft_skills = additional.get("softSkills", job_reqs.get("soft_skills", ""))
    culture_fit = additional.get("culturalFit", job_reqs.get("culture_fit", ""))

    default_weights = STRATEGY_PRESETS["balanced"]["weights"]

    try:
        weight_map = json.loads(weights)
    except (json.JSONDecodeError, TypeError):
        weight_map = default_weights

    if not isinstance(weight_map, dict) or not all(k in weight_map for k in default_weights):
        weight_map = default_weights

    try:
        weight_map = {k: float(weight_map[k]) for k in default_weights}
    except (ValueError, TypeError):
        weight_map = default_weights

    default_screening_settings = {
        "strong_threshold": 75,
        "minimum_interview_threshold": 50
    }

    try:
        settings_map = json.loads(settings) if settings else default_screening_settings
    except (json.JSONDecodeError, TypeError):
        settings_map = default_screening_settings

    try:
        strong_threshold = int(settings_map.get("strong_threshold", 75))
        minimum_interview_threshold = int(settings_map.get("minimum_interview_threshold", 50))
    except (ValueError, TypeError):
        strong_threshold = 75
        minimum_interview_threshold = 50

    strong_threshold = max(0, min(strong_threshold, 100))
    minimum_interview_threshold = max(0, min(minimum_interview_threshold, 100))

    if strong_threshold < minimum_interview_threshold:
        strong_threshold = minimum_interview_threshold

    general_requirement_text = " ".join([
        str(req_tech_str or ""),
        str(tools_software or ""),
        str(certifications or ""),
        str(education_level or ""),
        str(raw_exp or ""),
        str(languages or ""),
        str(responsibilities or ""),
        str(soft_skills or ""),
        str(culture_fit or "")
    ])

    req_skills_list = extract_known_skills(general_requirement_text)

    if not req_skills_list:
        req_skills_list = [
            s.strip()
            for s in re.split(r",|\n|;", str(general_requirement_text))
            if s.strip()
        ]

    exp_text = str(raw_exp).lower()

    if "fresh" in exp_text or "entry" in exp_text or "intern" in exp_text:
        req_exp = 0
    else:
        numbers = re.findall(r"\d+(?:\.\d+)?", exp_text)
        req_exp = int(float(numbers[0])) if numbers else 1

    job_description_full = "\n".join([
        f"Job Title: {job_title}",
        f"Employment Type: {employment_type}",
        f"Experience Level: {exp_level}",
        f"Location: {job_location}",
        f"Technical Skills: {req_tech_str}",
        f"Tools/Software: {tools_software}",
        f"Certifications: {certifications}",
        f"Education Level: {education_level}",
        f"Years Experience: {raw_exp}",
        f"Languages: {languages}",
        f"Responsibilities: {responsibilities}",
        f"Soft Skills: {soft_skills}",
        f"Culture Fit: {culture_fit}",
    ])

    return {
        "job_location": job_location,
        "req_tech_str": req_tech_str,
        "req_skills_list": req_skills_list,
        "req_exp": req_exp,
        "weight_map": weight_map,
        "strong_threshold": strong_threshold,
        "minimum_interview_threshold": minimum_interview_threshold,
        "job_description_full": job_description_full,
        "general_requirement_text": general_requirement_text
    }

@app.post("/analyze-batch")
async def analyze_batch(
    files: List[UploadFile] = File(...),
    jobDetails: str = Form(...),
    weights: str = Form(...),
    settings: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user)
):
    try:
        context = prepare_screening_context(jobDetails, weights, settings)

        job_location = context["job_location"]
        req_tech_str = context["req_tech_str"]
        req_skills_list = context["req_skills_list"]
        req_exp = context["req_exp"]
        weight_map = context["weight_map"]
        strong_threshold = context["strong_threshold"]
        minimum_interview_threshold = context["minimum_interview_threshold"]
        job_description_full = context["job_description_full"]

        analysis_results = []

        for file in files:
            raw_result = await process_resume(
                file, job_description_full, req_skills_list, req_exp, weight_map
            )

            if "error" in raw_result:
                print(f"⚠️ Skipping {file.filename} due to error: {raw_result['error']}")
                continue

            ui_mapped = map_result_to_ui(
                raw_result,
                job_location,
                req_tech_str,
                strong_threshold,
                minimum_interview_threshold
            )

            analysis_results.append(ui_mapped)

        return analysis_results

    except HTTPException:
        raise
    except Exception as e:
        print(f"🔥 Critical Failure: {e}")
        raise HTTPException(status_code=500, detail=str(e))
        
    
@app.get("/db-test")
def db_test(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return {"message": "Database connection successful"}

@app.get("/jobs")
def list_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    jobs = db.query(JobModel).order_by(JobModel.created_at.desc()).all()
    return [serialize_job(job) for job in jobs]


@app.get("/jobs/{job_id}")
def get_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    job = get_job_or_404(db, job_id)
    return serialize_job(job)


@app.post("/jobs")
def create_job(
    payload: JobInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    new_job = JobModel(
        title=payload.title,
        status=payload.status,
        position_status=payload.positionStatus,
        details_basic=model_to_dict(payload.details.basic),
        details_role=model_to_dict(payload.details.technical),
        details_qualifications=model_to_dict(payload.details.qualifications),
        details_additional=model_to_dict(payload.details.additional),
        scoring_strategy=payload.scoringStrategy,
        strong_threshold=payload.strongThreshold,
        minimum_interview_threshold=payload.minimumInterviewThreshold
    )

    db.add(new_job)
    db.commit()
    db.refresh(new_job)

    return serialize_job(new_job)


@app.put("/jobs/{job_id}")
def update_job_route(
    job_id: str,
    payload: JobInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    job = get_job_or_404(db, job_id)

    job.title = payload.title
    job.status = payload.status
    job.position_status = payload.positionStatus
    job.details_basic = model_to_dict(payload.details.basic)
    job.details_role = model_to_dict(payload.details.technical)
    job.details_qualifications = model_to_dict(payload.details.qualifications)
    job.details_additional = model_to_dict(payload.details.additional)
    job.scoring_strategy = payload.scoringStrategy
    job.strong_threshold = payload.strongThreshold
    job.minimum_interview_threshold = payload.minimumInterviewThreshold

    db.commit()
    db.refresh(job)

    return serialize_job(job)


@app.delete("/jobs/{job_id}")
def delete_job_route(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    job = get_job_or_404(db, job_id)

    db.delete(job)
    db.commit()

    return {"message": "Job deleted successfully"}

@app.get("/jobs/{job_id}/dashboard")
def get_job_dashboard(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    job = get_job_or_404(db, job_id)

    candidates = (
        db.query(CandidateModel)
        .filter(CandidateModel.job_id == job.id)
        .order_by(CandidateModel.created_at.desc())
        .all()
    )

    batches = (
        db.query(BatchModel)
        .filter(BatchModel.job_id == job.id)
        .order_by(BatchModel.created_at.desc())
        .all()
    )

    return serialize_job(
        job,
        candidates=[serialize_candidate(c) for c in candidates],
        batches=[serialize_batch(b) for b in batches]
    )


@app.get("/jobs/{job_id}/candidates")
def list_candidates(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    job = get_job_or_404(db, job_id)

    candidates = (
        db.query(CandidateModel)
        .filter(CandidateModel.job_id == job.id)
        .order_by(CandidateModel.created_at.desc())
        .all()
    )

    return [serialize_candidate(c) for c in candidates]


@app.post("/jobs/{job_id}/candidates")
def create_candidate(
    job_id: str,
    payload: CandidateInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    job = get_job_or_404(db, job_id)

    new_candidate = CandidateModel(
        job_id=job.id,
        name=payload.name,
        score=payload.score,
        match_level=payload.match_level,
        recommendation_status=payload.recommendation_status,
        is_recommended=payload.is_recommended,
        stage=payload.stage,

        location=payload.location,
        location_fit=payload.location_fit,
        experience_fit=payload.experience_fit,
        role_capability_fit=payload.technical_fit,
        education_fit=payload.education_fit,

        summary=payload.summary,
        recommendation_summary=payload.recommendation_summary,
        about_candidate=payload.about_candidate,
        match_issues=payload.match_issues,

        role_capability_score=payload.tech_score,
        experience_relevance_score=payload.exp_score,
        location_score=payload.location_score,

        location_explanation=payload.location_explanation,
        experience_explanation=payload.experience_explanation,
        role_capability_explanation=payload.technical_explanation,
        education_explanation=payload.education_explanation,

        resume_filename=payload.resume_filename,
        resume_storage_url=payload.resume_storage_url or payload.resume_url,

        interview_questions=payload.interview_questions,
        score_breakdown=payload.score_breakdown,
        component_scores=payload.component_scores,

        is_new=payload.is_new
    )

    db.add(new_candidate)
    db.commit()
    db.refresh(new_candidate)

    return serialize_candidate(new_candidate)


@app.put("/jobs/{job_id}/candidates/{candidate_id}/stage")
def update_candidate_stage(
    job_id: str,
    candidate_id: str,
    payload: CandidateStageInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    candidate = get_candidate_or_404(db, job_id, candidate_id)
    candidate.stage = payload.stage

    db.commit()
    db.refresh(candidate)

    return serialize_candidate(candidate)


@app.delete("/jobs/{job_id}/candidates/{candidate_id}")
def delete_candidate_route(
    job_id: str,
    candidate_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    candidate = get_candidate_or_404(db, job_id, candidate_id)

    db.delete(candidate)
    db.commit()

    return {"message": "Candidate deleted successfully"}

@app.get("/jobs/{job_id}/candidates/{candidate_id}")
def get_candidate(
    job_id: str,
    candidate_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    candidate = get_candidate_or_404(db, job_id, candidate_id)
    return serialize_candidate(candidate)

@app.put("/jobs/{job_id}/candidates/{candidate_id}/seen")
def update_candidate_seen(
    job_id: str,
    candidate_id: str,
    payload: CandidateSeenInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    candidate = get_candidate_or_404(db, job_id, candidate_id)
    candidate.is_new = payload.is_new

    db.commit()
    db.refresh(candidate)

    return serialize_candidate(candidate)


@app.get("/jobs/{job_id}/batches")
def list_batches(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    job = get_job_or_404(db, job_id)

    batches = (
        db.query(BatchModel)
        .filter(BatchModel.job_id == job.id)
        .order_by(BatchModel.created_at.desc())
        .all()
    )

    return [serialize_batch(b) for b in batches]


@app.post("/jobs/{job_id}/batches")
def create_batch(
    job_id: str,
    payload: BatchInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    job = get_job_or_404(db, job_id)

    new_batch = BatchModel(
        job_id=job.id,
        batch_code=payload.id,
        total_files=payload.count,
        status=payload.status
    )

    db.add(new_batch)
    db.commit()
    db.refresh(new_batch)

    return serialize_batch(new_batch)


@app.delete("/jobs/{job_id}/batches")
def clear_batches(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    job = get_job_or_404(db, job_id)

    db.query(BatchModel).filter(BatchModel.job_id == job.id).delete()
    db.commit()

    return {"message": "Batch history cleared successfully"}
    
@app.post("/analyze-batch-stream")
async def analyze_batch_stream(
    files: List[UploadFile] = File(...),
    jobDetails: str = Form(...),
    weights: str = Form(...),
    settings: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user)
):
    # Read uploaded files into memory first so they remain available during streaming
    uploaded_files = []
    for index, file in enumerate(files):
        file_bytes = await file.read()
        uploaded_files.append({
            "index": index,
            "filename": file.filename,
            "bytes": file_bytes
        })

    async def event_generator():
        try:
            context = prepare_screening_context(jobDetails, weights, settings)

            job_location = context["job_location"]
            req_tech_str = context["req_tech_str"]
            req_skills_list = context["req_skills_list"]
            req_exp = context["req_exp"]
            weight_map = context["weight_map"]
            strong_threshold = context["strong_threshold"]
            minimum_interview_threshold = context["minimum_interview_threshold"]
            job_description_full = context["job_description_full"]

            yield json.dumps({
                "type": "batch_started",
                "total": len(uploaded_files)
            }) + "\n"

            for item in uploaded_files:
                index = item["index"]
                filename = item["filename"]
                resume_storage_ref = upload_resume_bytes(item["bytes"], filename)

                yield json.dumps({
                    "type": "file_started",
                    "index": index,
                    "filename": filename
                }) + "\n"

                try:
                    resume_file = UploadFile(
                        filename=filename,
                        file=io.BytesIO(item["bytes"])
                    )

                    raw_result = await process_resume(
                        resume_file,
                        job_description_full,
                        req_skills_list,
                        req_exp,
                        weight_map
                    )

                    if "error" in raw_result:
                        yield json.dumps({
                            "type": "file_failed",
                            "index": index,
                            "filename": filename,
                            "error": raw_result["error"]
                        }) + "\n"
                        continue

                    ui_mapped = map_result_to_ui(
                        raw_result,
                        job_location,
                        req_tech_str,
                        strong_threshold,
                        minimum_interview_threshold
                    )
                    ui_mapped["resume_storage_url"] = resume_storage_ref
                    ui_mapped["resume_url"] = build_signed_resume_url(resume_storage_ref)
                    ui_mapped["resume_filename"] = filename

                    yield json.dumps({
                        "type": "file_completed",
                        "index": index,
                        "filename": filename,
                        "candidate": ui_mapped
                    }) + "\n"

                except Exception as e:
                    yield json.dumps({
                        "type": "file_failed",
                        "index": index,
                        "filename": filename,
                        "error": str(e)
                    }) + "\n"

            yield json.dumps({
                "type": "batch_completed"
            }) + "\n"

        except Exception as e:
            yield json.dumps({
                "type": "batch_error",
                "error": str(e)
            }) + "\n"

    return StreamingResponse(
        event_generator(),
        media_type="application/x-ndjson"
    )

@app.get("/")
def health(): return {"status": "Online"}


@app.get("/health")
def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
