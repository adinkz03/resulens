import { useParams, useNavigate } from 'react-router-dom';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  User,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  XCircle,
  FileText,
  Phone,
  Mail,
  MessageSquare,
  ExternalLink,
  MapPin,
  Target,
  TrendingUp
} from 'lucide-react';
import type { Job } from '../Utils/storage';
import { getResumePreview } from '../Utils/resumePreviewStore';
import axios from 'axios';
import { useEffect, useState } from 'react';
import PageBreadcrumb from "../components/PageBreadcrumb";
import { getAuthHeaders, removeToken } from '../Utils/auth';

const API_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://127.0.0.1:8000';

const CandidateDetail = () => {
  const { jobId, candidateId } = useParams();
  const navigate = useNavigate();

  const [showResumeOverlay, setShowResumeOverlay] = useState(false);
  const [showScoreOverlay, setShowScoreOverlay] = useState(false);

  const [job, setJob] = useState<Job | null>(null);
  const [candidate, setCandidate] = useState<any | null>(null);
  const [candidateStage, setCandidateStage] = useState("Screening");
  const [loading, setLoading] = useState(true);
  const CANDIDATE_CACHE_KEY = `candidate_detail_cache_${jobId}_${candidateId}`;
  const handleUnauthorized = () => {
    removeToken();
    navigate("/login");
  };

  const readCandidateCache = () => {
    try {
      const raw = sessionStorage.getItem(CANDIDATE_CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const saveCandidateCache = (data: { job: Job; candidate: any }) => {
    sessionStorage.setItem(CANDIDATE_CACHE_KEY, JSON.stringify(data));
  };

  const fetchCandidateDetail = async (showLoader = false) => {
    if (!jobId || !candidateId) return;

    try {
      if (showLoader) {
        setLoading(true);
      }

      const [jobResponse, candidateResponse] = await Promise.all([
        axios.get(`${API_URL}/jobs/${jobId}`, {
          headers: getAuthHeaders()
        }),
        axios.get(`${API_URL}/jobs/${jobId}/candidates/${candidateId}`, {
          headers: getAuthHeaders()
        })
      ]);

      const apiJob = jobResponse.data;
      const apiCandidate = candidateResponse.data;
      const preview = getResumePreview(candidateId || "");

      let mergedCandidate = {
        ...apiCandidate,
        resume_storage_url: apiCandidate.resume_storage_url || preview?.resume_storage_url,
        resume_url: apiCandidate.resume_url || preview?.resume_url,
        resume_filename: apiCandidate.resume_filename || preview?.resume_filename
      };

      if (mergedCandidate.is_new) {
        try {
          const seenResponse = await axios.put(
            `${API_URL}/jobs/${jobId}/candidates/${candidateId}/seen`,
            { is_new: false },
            { headers: getAuthHeaders() }
          );

          mergedCandidate = {
            ...seenResponse.data,
            resume_storage_url: seenResponse.data.resume_storage_url || preview?.resume_storage_url,
            resume_url: seenResponse.data.resume_url || preview?.resume_url,
            resume_filename: seenResponse.data.resume_filename || preview?.resume_filename
          };
        } catch (seenError) {
          if (axios.isAxiosError(seenError) && seenError.response?.status === 401) {
            handleUnauthorized();
            return;
          }

          console.error("Failed to mark candidate as seen from detail page", seenError);
        }
      }

      setJob(apiJob);
      setCandidate(mergedCandidate);
      setCandidateStage(mergedCandidate.stage || "Screening");

      saveCandidateCache({
        job: apiJob,
        candidate: mergedCandidate
      });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        handleUnauthorized();
        return;
      }

      console.error("Failed to fetch candidate detail", error);

      if (!candidate) {
        setJob(null);
        setCandidate(null);
      }
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!jobId || !candidateId) return;

    const cached = readCandidateCache();

    if (cached) {
      setJob(cached.job);
      setCandidate(cached.candidate);
      setCandidateStage(cached.candidate?.stage || "Screening");
      setLoading(false);
      fetchCandidateDetail(false);
    } else {
      fetchCandidateDetail(true);
    }
  }, [jobId, candidateId]);

  if (loading && !candidate) {
    return <div className="p-20 text-center font-black">Loading Candidate Profile...</div>;
  }
  if (!job || !candidate) {
    return <div className="p-20 text-center font-black">Candidate Not Found</div>;
  }

  const updateCandidateStage = async (newStage: string) => {
    if (!job || !candidate?.candidate_id) return;

    try {
      const response = await axios.put(
        `${API_URL}/jobs/${job.id}/candidates/${candidate.candidate_id}/stage`,
        { stage: newStage },
        { headers: getAuthHeaders() }
      );

      const updatedCandidateFromApi = response.data;
      const preview = getResumePreview(candidate.candidate_id);

      const mergedUpdatedCandidate = {
        ...updatedCandidateFromApi,
        resume_storage_url: updatedCandidateFromApi.resume_storage_url || preview?.resume_storage_url || candidate.resume_storage_url,
        resume_url: updatedCandidateFromApi.resume_url || preview?.resume_url || candidate.resume_url,
        resume_filename: updatedCandidateFromApi.resume_filename || preview?.resume_filename
      };

      setCandidate(mergedUpdatedCandidate);
      setCandidateStage(newStage);

      if (job) {
        saveCandidateCache({
          job,
          candidate: mergedUpdatedCandidate
        });
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        handleUnauthorized();
        return;
      }

      console.error("Failed to update candidate stage", error);
      alert("Something went wrong. Please try again.");
    }
  };

  const rawRecommendationStatus =
  candidate.recommendation_status || (candidate.is_recommended ? "YES" : "NO");

  const recommendationStatus =
    rawRecommendationStatus === "REVIEW" ? "POTENTIAL" : rawRecommendationStatus;

  const recommendationColor =
    recommendationStatus === "YES"
      ? "text-emerald-500"
      : recommendationStatus === "POTENTIAL"
      ? "text-orange-500"
      : "text-red-500";

  const recommendationLabel =
    recommendationStatus === "YES"
      ? "Recommendation for Interview: YES"
      : recommendationStatus === "POTENTIAL"
      ? "Recommendation: Potential for Interview"
      : "Recommendation: Not for Interview";

const getFitColor = (level?: string) => {
  if (level === "High") return "bg-emerald-50 text-emerald-500";
  if (level === "Medium") return "bg-orange-50 text-orange-500";
  if (level === "Low") return "bg-red-50 text-red-500";
  return "bg-gray-50 text-gray-400";
};

const getScoringPresetLabel = (strategy?: string) => {
  if (strategy === "capability") return "Skills & Capability Focus";
  if (strategy === "experience") return "Experience & Evidence Focus";
  if (strategy === "balanced" || !strategy) return "Balanced Screening";
  return strategy;
};

const scoreBreakdown = candidate.score_breakdown;
const scoringPresetLabel = getScoringPresetLabel((job as any)?.scoringStrategy);
const hasResumePreview =
  typeof candidate.resume_url === "string" && candidate.resume_url.trim().length > 0;

const scoreComponents = scoreBreakdown
  ? [
      scoreBreakdown.core_requirement,
      scoreBreakdown.role_capability,
      scoreBreakdown.experience_relevance,
      scoreBreakdown.role_alignment,
      scoreBreakdown.education_credential,
      scoreBreakdown.evidence_confidence
    ].filter(Boolean)
  : [];

const totalContribution = scoreComponents.reduce(
  (total: number, component: any) => total + Number(component.contribution || 0),
  0
);

const exportAnalysisReport = () => {
  const doc = new jsPDF("p", "mm", "a4");

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 15;
  let y = 18;

  const safeText = (value: any, fallback = "Not provided") => {
    if (value === null || value === undefined || value === "") return fallback;
    return String(value);
  };

  const addSectionTitle = (title: string) => {
    ensurePageSpace(20);

    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.text(title, marginX, y);
    y += 4;
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 6;
  };

  const addWrappedText = (text: string, fontSize = 10) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(71, 85, 105);

    const lines = doc.splitTextToSize(safeText(text), pageWidth - marginX * 2);

    ensurePageSpace(lines.length * 5 + 10);

    doc.text(lines, marginX, y);
    y += lines.length * 5 + 3;
  };

  const ensurePageSpace = (neededSpace = 30) => {
    const pageHeight = doc.internal.pageSize.getHeight();

    if (y + neededSpace > pageHeight - 20) {
      doc.addPage();
      y = 20;
    }
  };

  const recommendationStatus =
    candidate.recommendation_status === "YES"
      ? "YES"
      : candidate.recommendation_status === "POTENTIAL"
      ? "POTENTIAL"
      : candidate.recommendation_status === "REVIEW"
      ? "POTENTIAL"
      : "NO";

  // Header
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageWidth, 28, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("ResuLens Candidate Analysis Report", marginX, 14);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated on ${new Date().toLocaleString()}`, marginX, 21);

  y = 38;

  // Candidate summary
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(safeText(candidate.name, "Unknown Candidate"), marginX, y);

  y += 8;

  ensurePageSpace(40);
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 3,
      textColor: [51, 65, 85],
      lineColor: [226, 232, 240],
      lineWidth: 0.2
    },
    headStyles: {
      fillColor: [248, 250, 252],
      textColor: [100, 116, 139],
      fontStyle: "bold"
    },
    body: [
      ["Final APS Score", `${candidate.score}%`],
      ["Match Level", safeText(candidate.match_level)],
      ["Recommendation", recommendationStatus],
      ["Stage", safeText(candidateStage || "Screening")],
      ["Location", safeText(candidate.location || "Unknown")]
    ],
    margin: { left: marginX, right: marginX }
  });

  y = (doc as any).lastAutoTable.finalY + 4;

  // AI Recommendation
  addSectionTitle("AI Recommendation");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`Recommendation for Interview: ${recommendationStatus}`, marginX, y);
  y += 7;

  addWrappedText(
    safeText(
      candidate.recommendation_summary || candidate.summary,
      "No recommendation summary available."
    )
  );

  if (candidate.interview_questions && candidate.interview_questions.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("Interview Focus Questions:", marginX, y);
    y += 6;

    candidate.interview_questions.forEach((question: string, index: number) => {
      addWrappedText(`${index + 1}. ${question}`, 9);
    });
  }

  // Candidate Assessment
  addSectionTitle("Candidate Assessment");

  ensurePageSpace(40);
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 3,
      textColor: [51, 65, 85],
      lineColor: [226, 232, 240],
      lineWidth: 0.2
    },
    head: [["Assessment Area", "Fit"]],
    headStyles: {
      fillColor: [248, 250, 252],
      textColor: [100, 116, 139],
      fontStyle: "bold"
    },
    body: [
      ["Location Fit", safeText(candidate.location_fit)],
      ["Experience Relevance", safeText(candidate.experience_fit)],
      ["Role Capability", safeText(candidate.technical_fit)],
      ["Education & Credential Fit", safeText(candidate.education_fit)]
    ],
    margin: { left: marginX, right: marginX }
  });

  y = (doc as any).lastAutoTable.finalY + 4;

  // About Candidate
  addSectionTitle("About Candidate");
  addWrappedText(safeText(candidate.about_candidate, "No candidate summary available."));

  // Job Match Issues
  addSectionTitle("Job Match Issues");
  addWrappedText(safeText(candidate.match_issues, "No major job match issues identified."));

  // Breakdown
  addSectionTitle("Detailed Breakdown");

  ensurePageSpace(40);
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 3,
      textColor: [51, 65, 85],
      lineColor: [226, 232, 240],
      lineWidth: 0.2
    },
    head: [["Area", "Score", "Explanation"]],
    headStyles: {
      fillColor: [248, 250, 252],
      textColor: [100, 116, 139],
      fontStyle: "bold"
    },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 25, halign: "center" },
      2: { cellWidth: 125 }
    },
    body: [
      [
        "Core Requirement Match",
        `${scoreBreakdown?.core_requirement?.score ?? "N/A"} / 100`,
        getComponentReason(
          "core_requirement_match",
          "Core requirement explanation is unavailable for this candidate."
        )
      ],
      [
        "Role-Specific Capability",
        `${scoreBreakdown?.role_capability?.score ?? "N/A"} / 100`,
        getComponentReason(
          "role_specific_capability",
          candidate.technical_explanation ||
            "Role capability explanation is unavailable for this candidate."
        )
      ],
      [
        "Experience Relevance",
        `${scoreBreakdown?.experience_relevance?.score ?? "N/A"} / 100`,
        getComponentReason(
          "experience_relevance",
          candidate.experience_explanation ||
            "Experience relevance explanation is unavailable for this candidate."
        )
      ],
      [
        "Role Context Alignment",
        `${scoreBreakdown?.role_alignment?.score ?? "N/A"} / 100`,
        `Reason:\nThis score is calculated locally using SBERT semantic similarity between the candidate profile and the job description.\n\nEvidence:\nThe system compares the candidate's extracted career summary against the structured job requirements.\n\nMissing or weak areas:\nThis score measures overall role-context similarity only. It does not verify exact requirements, credentials, or role-specific capabilities by itself.`
      ],
      [
        "Education & Credential Fit",
        `${scoreBreakdown?.education_credential?.score ?? "N/A"} / 100`,
        getComponentReason(
          "education_credential_fit",
          candidate.education_explanation ||
            "Education and credential explanation is unavailable for this candidate."
        )
      ],
      [
        "Evidence Quality / Confidence",
        `${scoreBreakdown?.evidence_confidence?.score ?? "N/A"} / 100`,
        getComponentReason(
          "evidence_quality",
          "Evidence quality explanation is unavailable for this candidate."
        )
      ]
    ],
    margin: { left: marginX, right: marginX }
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // Add new page if needed before transparency report
  ensurePageSpace(40);

  // Score Transparency Report
  addSectionTitle("Score Transparency Report");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`Final APS Score: ${candidate.score}%`, marginX, y);
  y += 6;

  doc.text(`Total Weighted Contribution: ${totalContribution.toFixed(2)}`, marginX, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text("Formula: APS = sum of (Component Score x Weight)", marginX, y);
  y += 8;

  if (scoreComponents.length > 0) {
    ensurePageSpace(40);
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 3,
        textColor: [51, 65, 85],
        lineColor: [226, 232, 240],
        lineWidth: 0.2
      },
      head: [["Component", "Score", "Weight", "Contribution"]],
      headStyles: {
        fillColor: [248, 250, 252],
        textColor: [100, 116, 139],
        fontStyle: "bold"
      },
      body: scoreComponents.map((component: any) => [
        component.label,
        `${Number(component.score).toFixed(2)} / 100`,
        `${Number(component.weight).toFixed(2)}%`,
        Number(component.contribution).toFixed(2)
      ]),
      margin: { left: marginX, right: marginX }
    });

    y = (doc as any).lastAutoTable.finalY + 6;
  } else {
    addWrappedText("Score calculation data is unavailable for this candidate.");
  }

  // Footer page numbers
  const pageCount = doc.getNumberOfPages();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `ResuLens Candidate Analysis Report - Page ${i} of ${pageCount}`,
      marginX,
      290
    );
  }

  const safeName = safeText(candidate.name, "candidate")
    .replace(/[^a-z0-9]/gi, "_")
    .toLowerCase();

  doc.save(`${safeName}_analysis_report.pdf`);
};

const componentDetails = candidate.component_scores || {};

const getComponentReason = (
  key: keyof typeof componentDetails,
  fallback: string
) => {
  const detail = componentDetails[key];

  if (!detail) return fallback;

  const parts: string[] = [];

  if (detail.reason) {
    parts.push(`Reason:\n${detail.reason}`);
  }

  if (detail.evidence && detail.evidence.length > 0) {
    parts.push(`Evidence:\n${detail.evidence.slice(0, 3).join("\n• ")}`);
  }

  if (detail.missing_or_weak && detail.missing_or_weak.length > 0) {
    parts.push(`Missing or weak areas:\n${detail.missing_or_weak.slice(0, 3).join("\n• ")}`);
  }

  return parts.join("\n\n");
};

  return (
    <div className="bg-[#F8FAFC] min-h-screen pb-20 text-[#2c3e50]">
      {/* TOP NAV */}
      <nav className="flex items-center justify-between px-8 py-4 bg-white border-b border-gray-50">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg text-white">
            <FileText className="w-5 h-5" />
          </div>
          <span className="text-xl font-bold text-[#2c3e50] tracking-tight">
            ResuLens
          </span>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <div className="max-w-5xl mx-auto px-10 pt-6">
        <PageBreadcrumb
          items={[
            { label: "Job List", onClick: () => navigate("/jobs") },
            { label: "Job Dashboard", onClick: () => navigate(`/job/${job.id}`) },
            { label: candidate.name, active: true }
          ]}
        />

      {/* 2. PROFILE HEADER */}
      <div className="flex flex-col items-center text-center mb-16">
        <div className="w-28 h-28 bg-black rounded-full flex items-center justify-center text-white mb-6 border-[6px] border-gray-50 shadow-sm">
          <User className="w-14 h-14" />
        </div>
        <h1 className="text-4xl font-black uppercase tracking-tight mb-2">{candidate.name}</h1>
        <p className="text-xs font-bold text-gray-400 mb-8 flex items-center gap-1 uppercase tracking-widest">
          <MapPin className="w-3 h-3" /> {candidate.location || "Unknown Location"}
        </p>
        
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          {hasResumePreview ? (
            <button
              onClick={() => setShowResumeOverlay(true)}
              className="px-8 py-2.5 border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all"
            >
              View Original Resume
            </button>
          ) : (
            <p className="px-4 py-2.5 text-[10px] font-bold text-gray-400">
              Resume preview is only available during the current browser session.
            </p>
          )}

          <button
            onClick={() => setShowScoreOverlay(true)}
            className="px-8 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
          >
            Score Transparency Report
          </button>
          <button
            onClick={exportAnalysisReport}
            className="px-8 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-100"
          >
            Export Analysis Report
          </button>
        </div>

        <div className="flex gap-6 text-gray-300">
          <Phone className="w-5 h-5" />
          <MessageSquare className="w-5 h-5" />
          <Mail className="w-5 h-5" />
          <ExternalLink className="w-5 h-5" />
        </div>
      </div>

      {/* 3. CANDIDATE STAGE */}
      <div className="border border-gray-100 rounded-[2rem] p-8 mb-8 bg-white">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-black uppercase tracking-tight">
            Candidate Stage
          </h3>
          <p className="text-xs text-gray-400 font-bold mt-1">
            Update the candidate's current recruitment progress.
          </p>
        </div>

        <span className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-[9px] font-black uppercase tracking-widest">
          Current: {candidateStage}
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        {["Screening", "Interview Requested", "Interviewing", "Offer", "Rejected"].map(stage => (
          <button
            key={stage}
            type="button"
            onClick={() => updateCandidateStage(stage)}
            className={`px-6 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
              stage === candidateStage
                ? stage === "Rejected"
                  ? "bg-red-50 border-red-200 text-red-500 shadow-sm"
                  : stage === "Offer"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-600 shadow-sm"
                  : "bg-blue-50 border-blue-200 text-blue-600 shadow-sm"
                : "bg-white border-gray-100 text-gray-300 hover:border-blue-200 hover:text-blue-500"
            }`}
          >
            {stage}
          </button>
        ))}
      </div>
    </div>

      {/* 4. AI RECOMMENDATION */}
      <div className="border border-gray-100 rounded-[2.5rem] p-10 md:p-12 mb-12 relative bg-white">
        <div className="flex flex-col md:flex-row gap-8">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center text-white shrink-0 shadow-lg ${
              recommendationStatus === "YES"
                ? "bg-emerald-600 shadow-emerald-100"
                : recommendationStatus === "POTENTIAL"
                ? "bg-orange-500 shadow-orange-100"
                : "bg-red-500 shadow-red-100"
            }`}
          >
            {recommendationStatus === "YES" ? (
              <CheckCircle2 className="w-8 h-8" />
            ) : recommendationStatus === "POTENTIAL" ? (
              <AlertCircle className="w-8 h-8" />
            ) : (
              <XCircle className="w-8 h-8" />
            )}
          </div>

          <div className="flex-1">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-black text-gray-800">
                AI Recommendation
              </h3>
              <Target className="w-5 h-5 text-gray-100" />
            </div>

            <h4 className="text-xl font-black mb-4 text-gray-800">
              <span className={recommendationColor}>
                {recommendationLabel}
              </span>
            </h4>

            <p className="text-sm text-gray-600 leading-relaxed mb-6 font-medium">
              {candidate.recommendation_summary ||
                "No recommendation summary available."}
            </p>

            <div>
              <p className="text-sm font-black text-gray-800 mb-4">
                Interview Focus Areas:
              </p>

              {candidate.interview_questions && candidate.interview_questions.length > 0 ? (
                <ol className="list-decimal pl-6 space-y-2 text-sm text-gray-600 font-medium">
                  {candidate.interview_questions.map((question: string, index: number) => (
                    <li key={index}>{question}</li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-gray-400 font-bold italic">
                  No interview focus areas generated.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 5. ASSESSMENT GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-20">
        <div>
          <h3 className="text-xl font-black mb-8">Candidate Assessment</h3>
          <div className="space-y-5">
            <AssessmentRow label="Location Fit" level={candidate.location_fit || "Unknown"} color={getFitColor(candidate.location_fit)} />
            <AssessmentRow label="Relevant Experience" level={candidate.experience_fit || "Unknown"} color={getFitColor(candidate.experience_fit)} />
            <AssessmentRow label="Role Capability" level={candidate.technical_fit || "Unknown"} color={getFitColor(candidate.technical_fit)} />
            <AssessmentRow label="Education" level={candidate.education_fit || "Unknown"} color={getFitColor(candidate.education_fit)} />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-xl font-black">About</h3>
          <p className="text-xs text-gray-400 leading-relaxed font-medium">
            {candidate.about_candidate || "No candidate profile summary available."}
          </p>
        </div>
      </div>

      <div className="mb-20">
        <h3 className="text-xl font-black mb-4">Job Match Issues</h3>

        <div className="p-6 bg-orange-50 rounded-2xl border border-orange-100">
          <p className="text-sm text-orange-700 leading-relaxed font-bold flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>
              {candidate.match_issues || "No critical gaps identified in this audit."}
            </span>
          </p>
        </div>
      </div>

      {/* 6. APS COMPONENT BREAKDOWN */}
      <div className="space-y-12 pt-16 border-t border-gray-100">
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tight">
            APS Component Breakdown
          </h2>
          <p className="text-xs text-gray-400 font-bold mt-3 max-w-3xl leading-relaxed">
            This section explains the score behind each APS component. The Score Transparency Report shows the weighted calculation, while this breakdown explains the meaning of each score.
          </p>
        </div>

        <BreakdownSection 
          title="Core Requirement Match" 
          score={scoreBreakdown?.core_requirement?.score ?? 0}
          icon={<Target className="w-5 h-5" />}
          desc={getComponentReason(
            "core_requirement_match",
            "Core requirement explanation is unavailable for this candidate."
          )}
        />

        <BreakdownSection 
          title="Role-Specific Capability" 
          score={scoreBreakdown?.role_capability?.score ?? 0}
          icon={<ShieldCheck className="w-5 h-5" />}
          desc={getComponentReason(
            "role_specific_capability",
            candidate.technical_explanation ||
              "Role capability explanation is unavailable for this candidate."
          )}
        />

        <BreakdownSection 
          title="Experience Relevance" 
          score={scoreBreakdown?.experience_relevance?.score ?? 0}
          icon={<TrendingUp className="w-5 h-5" />}
          desc={getComponentReason(
            "experience_relevance",
            candidate.experience_explanation ||
              "Experience relevance explanation is unavailable for this candidate."
          )}
        />

        <BreakdownSection 
          title="Role Context Alignment" 
          score={scoreBreakdown?.role_alignment?.score ?? 0}
          icon={<MapPin className="w-5 h-5" />}
          desc={
            `Reason:\nThis score is calculated locally using SBERT semantic similarity between the candidate profile and the job description.\n\n` +
            `Evidence:\nThe system compares the candidate's extracted career summary against the structured job requirements.\n\n` +
            `Missing or weak areas:\nThis score measures overall role-context similarity only. It does not verify exact requirements, credentials, or role-specific capabilities by itself.`
          }
        />

        <BreakdownSection 
          title="Education & Credential Fit" 
          score={scoreBreakdown?.education_credential?.score ?? 0}
          icon={<FileText className="w-5 h-5" />}
          desc={getComponentReason(
            "education_credential_fit",
            candidate.education_explanation ||
              "Education and credential explanation is unavailable for this candidate."
          )}
        />

        <BreakdownSection 
          title="Evidence Quality / Confidence" 
          score={scoreBreakdown?.evidence_confidence?.score ?? 0}
          icon={<CheckCircle2 className="w-5 h-5" />}
          desc={getComponentReason(
            "evidence_quality",
            "Evidence quality explanation is unavailable for this candidate."
          )}
        />

        <div className="flex flex-col items-center py-12 opacity-10">
          <XCircle className="w-8 h-8 mb-4 text-gray-400" />
          <span className="text-[10px] font-black uppercase tracking-[0.4em]">
            Audit Report End
          </span>
        </div>
      </div>
      {showResumeOverlay && (
        <div className="fixed inset-0 z-[200] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-5xl h-[90vh] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">
                  Original Resume
                </h3>
                <p className="text-xs text-gray-400 font-bold">
                  {candidate.resume_filename || candidate.name}
                </p>
              </div>

              <button
                onClick={() => setShowResumeOverlay(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-xs font-black uppercase tracking-widest text-gray-500"
              >
                Close
              </button>
            </div>

            {candidate.resume_url ? (
              <iframe
                src={candidate.resume_url}
                title="Original Resume"
                className="w-full flex-1"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-xs font-black uppercase tracking-widest text-center px-6">
                Resume preview is only available during the current browser session.
              </div>
            )}
          </div>
        </div>
      )}

      {showScoreOverlay && (
        <div className="fixed inset-0 z-[210] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-5xl max-h-[90vh] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col">
            
            {/* Header */}
            <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight">
                  Score Transparency Report
                </h3>
                <p className="text-xs text-gray-400 font-bold mt-1">
                  Breakdown of how the final APS score was calculated.
                </p>
              </div>

              <button
                onClick={() => setShowScoreOverlay(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-xs font-black uppercase tracking-widest text-gray-500"
              >
                Close
              </button>
            </div>

            {/* Body */}
            <div className="p-8 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
                <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-2">
                    Final APS Score
                  </p>
                  <h2 className="text-4xl font-black text-blue-700">
                    {candidate.score}%
                  </h2>
                </div>

                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                    Total Contribution
                  </p>
                  <h2 className="text-4xl font-black text-slate-800">
                    {totalContribution.toFixed(2)}
                  </h2>
                </div>

                <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-2">
                    Formula
                  </p>
                  <p className="text-xs font-bold text-emerald-700 leading-relaxed">
                    APS = Σ(Component Score × Weight)
                  </p>
                </div>
              </div>

              <div className="mb-8 p-6 bg-white rounded-2xl border border-gray-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  Scoring Preset Used
                </p>
                <p className="text-sm font-black text-slate-800">
                  {scoringPresetLabel}
                </p>
              </div>

              {scoreComponents.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-gray-100">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 text-[9px] font-black uppercase text-gray-400 tracking-widest">
                      <tr>
                        <th className="px-6 py-4 w-[34%]">Component</th>
                        <th className="px-6 py-4 text-center w-[18%]">Score</th>
                        <th className="px-6 py-4 text-center w-[18%]">Weight</th>
                        <th className="px-6 py-4 text-right w-[20%]">Contribution</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-50">
                      {scoreComponents.map((component: any, index: number) => (
                        <tr key={index} className="hover:bg-gray-50/60">
                          <td className="px-6 py-5">
                            <p className="text-sm font-black text-gray-800">
                              {component.label}
                            </p>
                          </td>

                          <td className="px-6 py-5 text-center">
                            <span className="px-3 py-1 bg-slate-50 rounded-lg text-xs font-black text-slate-700">
                              {Number(component.score).toFixed(2)} / 100
                            </span>
                          </td>

                          <td className="px-6 py-5 text-center">
                            <span className="px-3 py-1 bg-blue-50 rounded-lg text-xs font-black text-blue-600">
                              {Number(component.weight).toFixed(2)}%
                            </span>
                          </td>

                          <td className="px-6 py-5 text-right">
                            <span className="text-sm font-black text-gray-800">
                              {Number(component.contribution).toFixed(2)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-16 text-center border border-dashed border-gray-200 rounded-2xl">
                  <p className="text-xs font-black uppercase tracking-widest text-gray-300">
                    Score calculation data is unavailable for this candidate.
                  </p>
                  <p className="text-xs text-gray-400 font-bold mt-3">
                    Re-run the screening to generate the Score Transparency Report.
                  </p>
                </div>
              )}

              <div className="mt-8 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <h4 className="text-sm font-black text-slate-800 mb-3">
                  How to read this report
                </h4>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  Each component score is measured from 0 to 100. The selected scoring strategy assigns a weight to each component.
                  The contribution is calculated by multiplying the component score by its weight. The final APS score is the sum of all weighted contributions.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>

  );
};

// --- HELPERS ---

const AssessmentRow = ({ label, level, color }: any) => (
  <div className="flex justify-between items-center border-b border-gray-50 pb-3">
    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{label}</span>
    <span className={`px-4 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${color}`}>{level}</span>
  </div>
);

const BreakdownSection = ({ title, score, desc, icon }: any) => {
  const safeScore = Math.max(0, Math.min(Number(score) || 0, 100));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-50 rounded-xl text-blue-600">{icon}</div>
          <h4 className="text-xl font-black uppercase tracking-tight">{title}</h4>
        </div>
        <span className="text-sm font-black text-gray-300">{safeScore} / 100</span>
      </div>
      <div className="w-full h-2 bg-gray-50 rounded-full overflow-hidden">
        <div className="h-full bg-blue-600 transition-all duration-1000" style={{ width: `${safeScore}%` }} />
      </div>
      <p className="text-xs text-gray-400 leading-relaxed font-bold max-w-3xl whitespace-pre-line">
        {desc}
      </p>
    </div>
  );
};

export default CandidateDetail;
