import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Users, Search, UploadCloud,
  Briefcase, Loader2, Zap, ShieldCheck, Award, X, Settings, Trash2, Plus, Smile, Meh, Frown,
  FileText
} from 'lucide-react';
import type { Job } from '../Utils/storage';
import { saveResumePreview, getResumePreview, deleteResumePreview } from '../Utils/resumePreviewStore';
import axios from 'axios';
import PageBreadcrumb from "../components/PageBreadcrumb";
import { getAuthHeaders, removeToken } from '../Utils/auth';

const API_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://127.0.0.1:8000';

const WEIGHT_LABELS: Record<string, string> = {
  w1: "Core Requirement Match",
  w2: "Role-Specific Capability",
  w3: "Experience Relevance",
  w4: "Role Context Alignment",
  w5: "Education & Credential Fit",
  w6: "Evidence Quality"
};

const PRESETS = {
  balanced: {
    name: "Balanced Screening",
    icon: <Zap className="w-5 h-5 text-blue-500" />,
    desc: "Balances requirements, capability, experience, alignment, education, and evidence quality.",
    weights: { w1: 25, w2: 20, w3: 20, w4: 15, w5: 10, w6: 10 }
  },
  capability: {
    name: "Skills & Capability Focus",
    icon: <ShieldCheck className="w-5 h-5 text-purple-500" />,
    desc: "Prioritizes role-specific skills, tools, procedures, and professional capabilities.",
    weights: { w1: 25, w2: 30, w3: 15, w4: 10, w5: 10, w6: 10 }
  },
  experience: {
    name: "Experience & Evidence Focus",
    icon: <Award className="w-5 h-5 text-emerald-500" />,
    desc: "Prioritizes relevant work history, responsibility overlap, and evidence quality.",
    weights: { w1: 20, w2: 15, w3: 30, w4: 10, w5: 10, w6: 15 }
  }
};


const JobDashboard = () => {
  const [loading, setLoading] = useState(true);
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logs, setLogs] = useState<string[]>(["System initialized. Ready for batch..."]);
  const [job, setJob] = useState<Job | undefined>(undefined);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [strategy, setStrategy] = useState<keyof typeof PRESETS>('balanced');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'score'; direction: 'asc' | 'desc' } | null>(null);

  const [strongThreshold, setStrongThreshold] = useState(75);
  const [minimumInterviewThreshold, setMinimumInterviewThreshold] = useState(50);

  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  const [tempStrategy, setTempStrategy] = useState(strategy);
  const [tempStrongThreshold, setTempStrongThreshold] = useState(strongThreshold);
  const [tempMinimumInterviewThreshold, setTempMinimumInterviewThreshold] = useState(minimumInterviewThreshold);

  const [positionStatus, setPositionStatus] = useState<'Open' | 'On Hold' | 'Closed'>(
    (job?.positionStatus as 'Open' | 'On Hold' | 'Closed') || 'Open'
  );

  const [tempPositionStatus, setTempPositionStatus] = useState<'Open' | 'On Hold' | 'Closed'>(
    positionStatus
  );

  const [processingFiles, setProcessingFiles] = useState<
    { filename: string; status: "Queued" | "Processing" | "Completed" | "Failed" }[]
  >([]);

  const processingTableRef = useRef<HTMLDivElement>(null);

  const [newBatchIds, setNewBatchIds] = useState<string[]>([]);

  const handleUnauthorized = () => {
    removeToken();
    navigate("/login");
  };

  const mergeDashboardWithPreviewCache = (apiJob: Job): Job => {
    const mergedCandidates = (apiJob.candidates || []).map((candidate: any) => {
      const preview = candidate.candidate_id
        ? getResumePreview(candidate.candidate_id)
        : null;

      return {
        ...candidate,
        resume_storage_url: candidate.resume_storage_url || preview?.resume_storage_url,
        resume_url: candidate.resume_url || preview?.resume_url,
        resume_filename: candidate.resume_filename || preview?.resume_filename
      };
    });

    return {
      ...apiJob,
      candidates: mergedCandidates,
      batches: apiJob.batches || []
    };
  };

  const formatCreatedAt = (value?: string | null) => {
    if (!value) return "Unknown";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  };
  
  const SCROLL_KEY = `job_dashboard_scroll_${jobId}`;
  const DASHBOARD_CACHE_KEY = `job_dashboard_cache_${jobId}`;
  const hasRestoredScrollRef = useRef(false);

  useEffect(() => {
    hasRestoredScrollRef.current = false;
  }, [jobId]);

  useLayoutEffect(() => {
    if (loading || !job || hasRestoredScrollRef.current) return;

    const saved = sessionStorage.getItem(SCROLL_KEY);
    if (!saved) return;

    const targetY = Number(saved);
    let attempts = 0;
    const maxAttempts = 40;

    const restore = () => {
      const maxScrollable =
        document.documentElement.scrollHeight - window.innerHeight;

      if (maxScrollable >= targetY || attempts >= maxAttempts) {
        window.scrollTo({
          top: Math.max(0, Math.min(targetY, maxScrollable)),
          behavior: "auto"
        });

        sessionStorage.removeItem(SCROLL_KEY);
        hasRestoredScrollRef.current = true;
        return;
      }

      attempts += 1;
      requestAnimationFrame(restore);
    };

    requestAnimationFrame(restore);
  }, [loading, job]);

  const fetchDashboard = async (showLoader = false) => {
    if (!jobId) return;

    try {
      if (showLoader) {
        setLoading(true);
      }

      const response = await axios.get(`${API_URL}/jobs/${jobId}/dashboard`, {
        headers: getAuthHeaders()
      });
      const apiJob = response.data;

      const mergedJob = mergeDashboardWithPreviewCache(apiJob);
      setJob(mergedJob);
      saveDashboardCache(mergedJob);

      const incomingStrategy =
        apiJob.scoringStrategy === "balanced" ||
        apiJob.scoringStrategy === "capability" ||
        apiJob.scoringStrategy === "experience"
          ? apiJob.scoringStrategy
          : "balanced";

      setStrategy(incomingStrategy);
      setTempStrategy(incomingStrategy);

      setStrongThreshold(apiJob.strongThreshold ?? 75);
      setTempStrongThreshold(apiJob.strongThreshold ?? 75);

      setMinimumInterviewThreshold(apiJob.minimumInterviewThreshold ?? 50);
      setTempMinimumInterviewThreshold(apiJob.minimumInterviewThreshold ?? 50);

      const incomingPositionStatus =
        apiJob.positionStatus || (apiJob.status === "Closed" ? "Closed" : "Open");

      setPositionStatus(incomingPositionStatus);
      setTempPositionStatus(incomingPositionStatus);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        handleUnauthorized();
        return;
      }

      console.error("Failed to fetch dashboard data", error);

      if (!job) {
        setJob(undefined);
      }
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  };

  const readDashboardCache = (): Job | null => {
    try {
      const raw = sessionStorage.getItem(DASHBOARD_CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const saveDashboardCache = (dashboardJob: Job) => {
    sessionStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(dashboardJob));
  };

  const openAdvancedSettings = () => {
    setTempStrategy(strategy);
    setTempStrongThreshold(strongThreshold);
    setTempMinimumInterviewThreshold(minimumInterviewThreshold);
    setTempPositionStatus(positionStatus);
    setShowAdvancedSettings(true);
  };

  const saveAdvancedSettings = async () => {
    if (!job) return;

    try {
      const updatedLocalJob: Job & any = {
        ...job,
        positionStatus: tempPositionStatus,
        status: tempPositionStatus === 'Closed' ? 'Closed' : 'Active',
        scoringStrategy: tempStrategy,
        strongThreshold: tempStrongThreshold,
        minimumInterviewThreshold: tempMinimumInterviewThreshold
      };

      const payload = {
        title: updatedLocalJob.title,
        status: updatedLocalJob.status || "Active",
        positionStatus: updatedLocalJob.positionStatus || "Open",
        details: {
          basic: updatedLocalJob.details.basic,
          technical: updatedLocalJob.details.technical,
          qualifications: updatedLocalJob.details.qualifications,
          additional: updatedLocalJob.details.additional
        },
        scoringStrategy: tempStrategy,
        strongThreshold: tempStrongThreshold,
        minimumInterviewThreshold: tempMinimumInterviewThreshold
      };

      const response = await axios.put(`${API_URL}/jobs/${job.id}`, payload, {
        headers: getAuthHeaders()
      });

      const mergedJob: Job = {
        ...response.data,
        candidates: updatedLocalJob.candidates || [],
        batches: updatedLocalJob.batches || []
      };

      setStrategy(tempStrategy);
      setStrongThreshold(tempStrongThreshold);
      setMinimumInterviewThreshold(tempMinimumInterviewThreshold);
      setPositionStatus(tempPositionStatus);

      setJob(mergedJob);

      setShowAdvancedSettings(false);
      addLog("AI screening settings updated.");
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        handleUnauthorized();
        return;
      }

      console.error("Failed to save advanced settings", error);
      alert("Something went wrong. Please try again.");
    }
  };

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev].slice(0, 6)); // Keep latest 6 logs
   };

  useEffect(() => {
    if (!jobId) return;

    const cached = readDashboardCache();

    if (cached) {
      setJob(cached);
      setLoading(false);
      fetchDashboard(false);
    } else {
      fetchDashboard(true);
    }
  }, [jobId]);

  if (loading && !job) {
    return <div className="p-20 text-center font-black text-gray-400">Loading Job Engine...</div>;
  }

  if (!job) {
    return <div className="p-20 text-center font-black text-gray-400">Job Not Found</div>;
  }

    // Adds files to the staging area
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;
        const newFiles = Array.from(e.target.files);
        setStagedFiles(prev => [...prev, ...newFiles]);
        addLog(`Staged ${newFiles.length} files in the handler.`);
    };

    // The Sorting Function
    const handleSort = (key: 'name' | 'score') => {
        let direction: 'asc' | 'desc' = 'desc'; // Default to highest score first
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
        addLog(`Sorting candidates by ${key} (${direction.toUpperCase()})...`);
    };

    // 3. Updated Filter & Sort Logic
    const sortedAndFilteredCandidates = [...(job.candidates || [])]
        .filter(c => c.name?.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => {
            if (!sortConfig) return 0;
            
            const { key, direction } = sortConfig;
            if (key === 'name') {
            const nameA = a.name.toLowerCase();
            const nameB = b.name.toLowerCase();
            return direction === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
            }
            
            if (key === 'score') {
            return direction === 'asc' ? a.score - b.score : b.score - a.score;
            }
            
            return 0;
    });

    // Removes a file from the queue
    const removeFile = (index: number) => {
        setStagedFiles(prev => prev.filter((_, i) => i !== index));
    };


  // Triggers the actual AI processing
    const handleSubmitBatch = async () => {
      if (stagedFiles.length === 0 || !job) return;

      const filesForBatch = [...stagedFiles];

      setIsAnalyzing(true);
      setShowUploadModal(false);

      setProcessingFiles(
        filesForBatch.map((file, index) => ({
          filename: file.name,
          status: index === 0 ? "Processing" : "Queued"
        }))
      );

      setTimeout(() => {
        processingTableRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }, 200);

      const formData = new FormData();
      filesForBatch.forEach(file => formData.append("files", file));

      formData.append("jobDetails", JSON.stringify(job.details));
      formData.append("weights", JSON.stringify(PRESETS[strategy].weights));
      formData.append(
        "settings",
        JSON.stringify({
          strong_threshold: strongThreshold,
          minimum_interview_threshold: minimumInterviewThreshold
        })
      );

      try {
        addLog(`Initiating neural audit for ${filesForBatch.length} documents...`);

        let liveJob: Job = job;

        const response = await fetch(`${API_URL}/analyze-batch-stream`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: formData
        });

        if (response.status === 401) {
          handleUnauthorized();
          return;
        }

        if (!response.ok || !response.body) {
          const errorText = await response.text();
          throw new Error(`Streaming response failed: ${response.status} ${errorText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let buffer = "";
        let completedCount = 0;

        while (true) {
          const { value, done } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;

            const event = JSON.parse(line);

            if (event.type === "file_started") {
              setProcessingFiles(prev =>
                prev.map((file, index) =>
                  index === event.index
                    ? { ...file, status: "Processing" }
                    : file
                )
              );

              addLog(`Processing ${event.filename}...`);
            }

            if (event.type === "file_completed") {
              setProcessingFiles(prev =>
                prev.map((file, index) =>
                  index === event.index
                    ? { ...file, status: "Completed" }
                    : index === event.index + 1
                    ? { ...file, status: "Processing" }
                    : file
                )
              );

              const localCandidate = {
                ...event.candidate,
                is_new: true,
                resume_url: event.candidate.resume_url || URL.createObjectURL(filesForBatch[event.index]),
                resume_storage_url: event.candidate.resume_storage_url || null,
                resume_filename: filesForBatch[event.index]?.name || event.filename
              };

              const dbPayload = {
                ...localCandidate,
                resume_url: event.candidate.resume_url || null,
                resume_storage_url: event.candidate.resume_storage_url || null
              };

              const createdCandidateResponse = await axios.post(
                `${API_URL}/jobs/${job.id}/candidates`,
                dbPayload,
                { headers: getAuthHeaders() }
              );

              const persistedCandidate = {
                ...createdCandidateResponse.data,
                resume_storage_url: createdCandidateResponse.data.resume_storage_url || localCandidate.resume_storage_url,
                resume_url: createdCandidateResponse.data.resume_url || localCandidate.resume_url,
                resume_filename: createdCandidateResponse.data.resume_filename || localCandidate.resume_filename
              };

              if (persistedCandidate.candidate_id) {
                saveResumePreview(
                  persistedCandidate.candidate_id,
                  persistedCandidate.resume_url,
                  persistedCandidate.resume_filename,
                  persistedCandidate.resume_storage_url
                );
              }

              liveJob = {
                ...liveJob,
                candidates: [...(liveJob.candidates || []), persistedCandidate]
              };

              setJob(liveJob);

              completedCount += 1;
              addLog(`Completed audit for ${event.filename}.`);
            }

            if (event.type === "file_failed") {
              setProcessingFiles(prev =>
                prev.map((file, index) =>
                  index === event.index
                    ? { ...file, status: "Failed" }
                    : index === event.index + 1
                    ? { ...file, status: "Processing" }
                    : file
                )
              );

              addLog(`Failed audit for ${event.filename}.`);
            }

            if (event.type === "batch_error") {
              throw new Error(event.error);
            }
          }
        }

        const batchCode = `BTCH-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

        const createdBatchResponse = await axios.post(
          `${API_URL}/jobs/${job.id}/batches`,
          {
            id: batchCode,
            count: filesForBatch.length,
            status: "Completed"
          },
          { headers: getAuthHeaders() }
        );

        const createdBatch = {
          id: createdBatchResponse.data.id,
          date: createdBatchResponse.data.date
            ? new Date(createdBatchResponse.data.date).toLocaleString()
            : new Date().toLocaleString(),
          count: createdBatchResponse.data.count,
          status: createdBatchResponse.data.status
        };

        liveJob = {
          ...liveJob,
          batches: [...(liveJob.batches || []), createdBatch]
        };

        setJob(liveJob);

        setNewBatchIds([createdBatch.id]);

        setTimeout(() => {
          setNewBatchIds([]);
        }, 5000);

        setStagedFiles([]);
        addLog(`Batch processing successful. ${completedCount} candidate(s) added.`);

        await fetchDashboard();
      } catch (err: any) {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          handleUnauthorized();
          return;
        }

        console.error("Streaming screening failed:", err);

        setProcessingFiles(prev =>
          prev.map(file => ({
            ...file,
            status: file.status === "Completed" ? "Completed" : "Failed"
          }))
        );

        addLog("Something went wrong. Please try again.");
      } finally {
        setIsAnalyzing(false);

        setTimeout(() => {
          setProcessingFiles([]);
        }, 1200);
      }
    };

  const deleteCandidate = async (index: number) => {
    if (index < 0 || !job) return;

    const candidateToDelete = (job.candidates || [])[index];
    if (!candidateToDelete?.candidate_id) return;

    const shouldDelete = window.confirm(
      "Are you sure you want to delete this candidate? This action cannot be undone."
    );

    if (!shouldDelete) return;

    try {
      await axios.delete(`${API_URL}/jobs/${job.id}/candidates/${candidateToDelete.candidate_id}`, {
        headers: getAuthHeaders()
      });

      deleteResumePreview(candidateToDelete.candidate_id);

      const updatedCandidates = [...(job.candidates || [])];
      updatedCandidates.splice(index, 1);

      const updatedJob = { ...job, candidates: updatedCandidates };
      setJob(updatedJob);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        handleUnauthorized();
        return;
      }

      console.error("Failed to delete candidate", error);
      alert("Something went wrong. Please try again.");
    }
  };

  const clearBatchHistory = async () => {
    if (!job) return;

    try {
      await axios.delete(`${API_URL}/jobs/${job.id}/batches`, {
        headers: getAuthHeaders()
      });

      const updatedJob = {
        ...job,
        batches: []
      };

      setJob(updatedJob);
      addLog("Batch history cleared.");
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        handleUnauthorized();
        return;
      }

      console.error("Failed to clear batch history", error);
      alert("Something went wrong. Please try again.");
    }
  };

  return (

    <div className="bg-[#F8FAFC] min-h-screen pb-20">
      {/* SIMPLE NAV */}
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
      <div className="max-w-7xl mx-auto px-10 pt-6">
        {/* 1. BREADCRUMBS */}
        <PageBreadcrumb
          items={[
            { label: "Job List", onClick: () => navigate("/jobs") },
            { label: "Job Dashboard", active: true }
          ]}
        />
        
        {/* 2. DYNAMIC HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tight mb-1">{job.title}</h2>
            <p className="text-slate-400 font-medium text-sm italic">Screening with <span className="text-blue-600 font-bold">{PRESETS[strategy].name}</span></p>
          </div>
          <button
            onClick={openAdvancedSettings}
            className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-400 transition-all font-black text-[10px] uppercase tracking-widest text-slate-600"
          >
            <Settings className="w-4 h-4" /> Advanced Settings
          </button>
        </div>


        {/* 3. STATS CARDS (Restored) */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-10">
          {[
            { label: "Total Pool", val: job.candidates?.length || 0, color: "bg-white text-slate-900", icon: <Users className="w-4 h-4" /> },
            { label: "High Fit", val: job.candidates?.filter(c => c.match_level === 'High').length || 0, color: "bg-emerald-50 text-emerald-700", icon: <Smile className="w-4 h-4" /> },
            { label: "Medium Fit", val: job.candidates?.filter(c => c.match_level === 'Medium').length || 0, color: "bg-amber-50 text-amber-700", icon: <Meh className="w-4 h-4" /> },
            { label: "Low Fit", val: job.candidates?.filter(c => c.match_level === 'Low').length || 0, color: "bg-red-100 text-red-700", icon: <Frown className="w-4 h-4" /> },
            {
              label: "Interview Pool",
              val: job.candidates?.filter(c =>
                c.recommendation_status === "YES" ||
                c.recommendation_status === "POTENTIAL"
              ).length || 0,
              color: "bg-blue-50 text-blue-700",
              icon: <Award className="w-4 h-4" />
            }
            
          ].map((stat, i) => (
            <div key={i} className={`${stat.color} p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between`}>
               <div>
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">{stat.label}</p>
                  <h2 className="text-4xl font-black tracking-tighter">{stat.val}</h2>
               </div>
               <div className="p-3 bg-white/50 rounded-2xl">{stat.icon}</div>
            </div>
          ))}
        </div>

        {/* 4. AUDIT WORKSPACE (Merged Upload & Stage) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
        
        {/* Left Spec Card (Benchmark) */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col justify-between">
            <div>
            <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 mb-6 flex items-center gap-2">
                <Briefcase className="w-4 h-4" /> Job Details
            </h3>
            <div className="space-y-4">
                {[
                { label: "Title", value: job.title },
                { label: "Level", value: job.details.basic.expLevel },
                { label: "Type", value: job.details.basic.employmentType },
                { label: "Location", value: job.details.basic.location }
                ].map((item, i) => (
                <div key={i}>
                    <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest block mb-1">{item.label}</span>
                    <span className="text-sm font-bold text-slate-700">{item.value}</span>
                </div>
                ))}
            </div>
            </div>
            <button onClick={() => navigate(`/job/${job.id}/details`)} className="w-full mt-8 py-3 bg-slate-50 text-slate-500 font-black text-[9px] uppercase tracking-widest rounded-xl border border-slate-100 hover:bg-slate-100 transition-all">
            View Full Job Details
            </button>
        </div>

        {/* Upload Resumes */}
        <div 
            onClick={() => setShowUploadModal(true)}
            className="lg:col-span-2 p-10 rounded-[2.5rem] border-2 border-dashed bg-white border-slate-200 hover:border-blue-400 transition-all flex flex-col items-center justify-center text-center cursor-pointer"
            >
            <UploadCloud className="w-12 h-12 mb-3 text-slate-300" />
            <h3 className="text-xl font-black text-slate-800 mb-1">Upload Resumes</h3>
            <p className="text-slate-400 text-xs mb-6 font-medium">Click to open the neural batch handler.</p>
            <span className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-slate-200">Open Handler</span>
        </div>

        </div>

        {/* 5. CANDIDATE TABLE (Merged with Sorting) */}
        {processingFiles.length > 0 && (
          <div
            ref={processingTableRef}
            className="bg-white rounded-[2.5rem] border border-blue-100 shadow-sm overflow-hidden mb-10"
          >
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-800">
                  Resume Processing Queue
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Live screening status for the current batch
                </p>
              </div>

              <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-xl">
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">
                  Processing
                </span>
              </div>
            </div>

            <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 text-[9px] font-black uppercase text-slate-400 tracking-widest">
                  <tr>
                    <th className="px-8 py-4">File Name</th>
                    <th className="px-8 py-4">Status</th>
                    <th className="px-8 py-4 text-right">Engine</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-50">
                  {processingFiles.map((file, index) => (
                    <tr key={`${file.filename}-${index}`} className="hover:bg-slate-50/40">
                      <td className="px-8 py-5 text-xs font-bold text-slate-700">
                        {file.filename}
                      </td>

                      <td className="px-8 py-5">
                        <span
                          className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                            file.status === "Completed"
                              ? "bg-emerald-50 text-emerald-500"
                              : file.status === "Failed"
                              ? "bg-red-50 text-red-500"
                              : file.status === "Processing"
                              ? "bg-blue-50 text-blue-500"
                              : "bg-slate-50 text-slate-400"
                          }`}
                        >
                          {file.status}
                        </span>
                      </td>

                      <td className="px-8 py-5 text-right text-[9px] font-black uppercase tracking-widest text-slate-300 italic">
                        Hybrid Gemini + SBERT
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mb-10">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center">
            <h3 className="text-lg font-black text-slate-800">View Candidates</h3>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search" 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                className="pl-10 pr-4 py-2 bg-slate-50 rounded-lg text-xs font-bold outline-none w-64 border-none" 
              />
            </div>
          </div>
          
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 text-[9px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-100">
              <tr>
                <th className="px-8 py-4 w-[22%] cursor-pointer hover:text-blue-600 transition-colors group/head" onClick={() => handleSort('name')}>
                  <div className="flex items-center gap-1">
                    Name 
                    <span className="text-blue-500">
                      {sortConfig?.key === 'name' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </div>
                </th>

                <th className="px-8 py-4 w-[13%] text-center">Stage</th>
                <th className="px-8 py-4 w-[16%] text-center">Location</th>
                <th className="px-8 py-4 w-[14%] text-center">Fit Level</th>
                <th className="px-8 py-4 text-center w-[16%]">Recommendation</th>

                <th className="px-8 py-4 w-[11%] text-center cursor-pointer hover:text-blue-600 transition-colors group/head" onClick={() => handleSort('score')}>
                  <div className="flex items-center justify-center gap-1">
                    Score 
                    <span className="text-blue-500">
                      {sortConfig?.key === 'score' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </div>
                </th>

                
                <th className="px-8 py-4 text-right w-[8%]">Action</th>
              </tr>
            </thead>
          </table>

          <div className="max-h-[420px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left">
              <tbody className="divide-y divide-slate-50">
                {sortedAndFilteredCandidates.map((c) => {
                  const originalIndex = (job.candidates || []).findIndex(cand =>
                    c.candidate_id
                      ? cand.candidate_id === c.candidate_id
                      : cand.name === c.name &&
                        cand.score === c.score &&
                        cand.location === c.location
                  );

                  const isNewCandidate = c.is_new === true;

                  return (
                    <tr 
                      key={c.candidate_id || `${c.name}-${c.score}-${c.location}-${originalIndex}`}
                      className={`transition-colors group cursor-pointer ${
                        isNewCandidate
                          ? "bg-blue-50/80 ring-1 ring-blue-100"
                          : "hover:bg-slate-50/50"
                      }`}
                      onClick={async () => {
                        if (!c.candidate_id) return;

                        sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));

                        try {
                          const seenResponse = await axios.put(
                            `${API_URL}/jobs/${job.id}/candidates/${c.candidate_id}/seen`,
                            { is_new: false },
                            { headers: getAuthHeaders() }
                          );

                          setJob(prev => {
                            if (!prev) return prev;

                            return {
                              ...prev,
                              candidates: (prev.candidates || []).map((cand: any) =>
                                cand.candidate_id === c.candidate_id
                                  ? {
                                      ...cand,
                                      ...seenResponse.data,
                                      resume_url: cand.resume_url,
                                      resume_filename: cand.resume_filename
                                    }
                                  : cand
                              )
                            };
                          });

                          navigate(`/job/${job.id}/candidate/${c.candidate_id}`);
                        } catch (error) {
                          if (axios.isAxiosError(error) && error.response?.status === 401) {
                            handleUnauthorized();
                            return;
                          }

                          console.error("Failed to mark candidate as seen", error);
                          alert("Something went wrong. Please try again.");
                        }
                      }}
                    >
                      {/* NAME */}
                      <td className="px-8 py-5 font-black text-slate-800 uppercase text-xs tracking-tight w-[22%]">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{c.name}</span>

                          {isNewCandidate && (
                            <span className="px-2 py-0.5 bg-blue-600 text-white rounded-full text-[8px] font-black uppercase tracking-widest shrink-0">
                              New
                            </span>
                          )}
                        </div>
                      </td>

                      {/* STAGE */}
                      <td className="px-8 py-5 w-[13%] text-center">
                        <div className="flex justify-center">
                          <span
                            className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${
                              c.stage === "Rejected"
                                ? "bg-red-50 text-red-500"
                                : "bg-cyan-50 text-cyan-600"
                            }`}
                          >
                            {c.stage || "Screening"}
                          </span>
                        </div>
                      </td>

                      {/* LOCATION */}
                      <td className="px-8 py-5 w-[16%] text-center">
                        <div className="flex justify-center">
                          <span className="inline-block max-w-[160px] truncate text-slate-500 text-xs font-medium">
                            {c.location || "No Location"}
                          </span>
                        </div>
                      </td>

                      {/* FIT LEVEL */}
                      <td className="px-8 py-5 w-[14%] text-center">
                        <div className="flex justify-center">
                          <span
                            className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${
                              c.match_level === "High"
                                ? "bg-emerald-50 text-emerald-500"
                                : c.match_level === "Medium"
                                ? "bg-orange-50 text-orange-500"
                                : "bg-red-50 text-red-500"
                            }`}
                          >
                            {c.match_level} Match
                          </span>
                        </div>
                      </td>

                      {/* RECOMMENDATION */}
                      <td className="px-8 py-5 text-center w-[16%]">
                        <div className="flex justify-center">
                          <span
                            className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                              c.recommendation_status === "YES"
                                ? "bg-emerald-50 text-emerald-500"
                                : c.recommendation_status === "POTENTIAL"
                                ? "bg-orange-50 text-orange-500"
                                : "bg-red-50 text-red-500"
                            }`}
                          >
                            {c.recommendation_status === "YES"
                              ? "YES"
                              : c.recommendation_status === "POTENTIAL"
                              ? "POTENTIAL"
                              : "NO"}
                          </span>
                        </div>
                      </td>

                      {/* SCORE */}
                      <td className="px-8 py-5 w-[11%] text-center">
                        <div className="flex justify-center">
                          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 text-slate-900 font-black text-[11px]">
                            {c.score}%
                          </div>
                        </div>
                      </td>

                      {/* ACTION */}
                      <td className="px-8 py-5 text-right w-[8%]">
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 

                            if (originalIndex !== -1) {
                              deleteCandidate(originalIndex);
                            }
                          }} 
                          className="p-2 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {sortedAndFilteredCandidates.length === 0 && (
            <div className="p-20 text-center text-[10px] font-black uppercase tracking-widest text-slate-300">
              No candidates found matching your search
            </div>
          )}
        </div>

        {/* 6. BATCH HISTORY TABLE */}
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden mt-10">
        <div className="p-8 border-b border-slate-50 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-black text-slate-800">Batch History</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Logs of previous screenings
          </p>
        </div>

        <button
          onClick={clearBatchHistory}
          disabled={!job.batches || job.batches.length === 0}
          className="px-5 py-3 bg-red-50 text-red-500 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-red-500 hover:text-white disabled:bg-slate-50 disabled:text-slate-300 disabled:cursor-not-allowed transition-all"
        >
          Clear History
        </button>
      </div>
        <table className="w-full text-left">
          <thead className="bg-slate-50/50 text-[9px] font-black uppercase text-slate-400 tracking-widest">
            <tr>
              <th className="px-8 py-4 w-[20%]">Batch ID</th>
              <th className="px-8 py-4 w-[30%]">Date/Time</th>
              <th className="px-8 py-4 w-[18%]">Total Files</th>
              <th className="px-8 py-4 w-[16%]">Status</th>
              <th className="px-8 py-4 text-right w-[16%]">Engine</th>
            </tr>
          </thead>
        </table>

        <div className="max-h-[320px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left">
            <tbody className="divide-y divide-slate-50">
              {(job.batches || []).map((batch, i) => (
                <tr
                  key={i}
                  className={`transition-colors group ${
                    newBatchIds.includes(batch.id)
                      ? "bg-emerald-50/80 ring-1 ring-emerald-100"
                      : "hover:bg-slate-50/30"
                  }`}
                >
                  <td className="px-8 py-5 font-mono text-[10px] font-bold text-slate-500 w-[20%]">
                    <div className="flex items-center gap-2">
                      <span>{batch.id}</span>
                      {newBatchIds.includes(batch.id) && (
                        <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-full text-[8px] font-black uppercase tracking-widest">
                          New
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-5 text-xs font-bold text-slate-700 w-[30%]">
                    {formatCreatedAt(batch.date)}
                  </td>
                  <td className="px-8 py-5 w-[18%]">
                    <span className="px-2 py-1 bg-slate-100 rounded-md text-[10px] font-black text-slate-600">
                      {batch.count} Resumes
                    </span>
                  </td>
                  <td className="px-8 py-5 w-[16%]">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[10px] font-black uppercase text-emerald-600">
                        {batch.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right font-bold text-[9px] text-slate-300 italic uppercase w-[16%]">
                    Hybrid AI Engine
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(!job.batches || job.batches.length === 0) && (
            <div className="p-20 text-center text-[10px] font-black uppercase tracking-widest text-slate-300">
            No historical batches found for this job description
            </div>
        )}
        </div>

        {/* 7. SYSTEM ACTIVITY */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-12">
          {/* COMPACT ACTIVITY LOG */}
          <div className="lg:col-span-2 bg-[#0a0f1e] rounded-[2rem] p-6 shadow-xl border border-slate-800 relative overflow-hidden">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800/50 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500/30" />
                  <div className="w-2 h-2 rounded-full bg-orange-500/30" />
                  <div className="w-2 h-2 rounded-full bg-emerald-500/30" />
                </div>

                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-2 font-mono">
                  system_activity.log
                </span>
              </div>

              {isAnalyzing && (
                <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/10 rounded-lg">
                  <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                  <span className="text-[9px] font-black text-blue-400 uppercase tracking-tighter">
                    Running
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2 font-mono text-[10px] max-h-[90px] overflow-y-auto custom-scrollbar pr-2">
              {logs.map((log, i) => (
                <div 
                  key={i} 
                  className={`${i === 0 ? 'text-emerald-400' : 'text-slate-500'} flex gap-3 transition-all duration-500`}
                >
                  <span className="opacity-30">0{logs.length - i}</span>
                  <span className="opacity-50">{'>'}</span>
                  <span className={i === 0 ? 'animate-pulse' : ''}>{log}</span>
                </div>
              ))}
            </div>

            <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-blue-500/5 to-transparent h-[200%] animate-scanline" />
          </div>

          {/* ENGINE STATUS */}
          <div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm flex flex-col justify-between relative overflow-hidden">
            <div className="relative z-10">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                Compute Status
              </p>

              <h4 className="text-lg font-black text-slate-800 flex items-center gap-2">
                {isAnalyzing ? "Processing..." : "Standby Mode"}
                <Zap className={`w-4 h-4 ${isAnalyzing ? 'text-blue-500' : 'text-slate-300'}`} />
              </h4>
            </div>
            
            <div className="pt-5 border-t border-slate-50 mt-5 relative z-10">
              <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase mb-3">
                <span>Engine Pulse</span>
                <span className={isAnalyzing ? 'text-blue-600' : ''}>
                  {isAnalyzing ? 'Active' : 'Idle'}
                </span>
              </div>

              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full bg-blue-600 transition-all duration-[2000ms] ease-in-out ${
                    isAnalyzing ? 'w-full animate-pulse' : 'w-0'
                  }`} 
                />
              </div>

              <p className="text-[9px] font-bold text-slate-300 mt-4 italic tracking-tight">
                Gemini Evidence Scoring + SBERT
              </p>
            </div>

            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-50 rounded-full blur-3xl opacity-50" />
          </div>
        </div>
        
      </div>

        {/* BATCH RESUME HANDLER MODAL */}
        {showUploadModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
                <div className="w-10" /> {/* Spacer */}
                <h3 className="text-lg font-black text-slate-800 tracking-tight">Batch Resume Handler</h3>
                <button 
                onClick={() => { setShowUploadModal(false); setStagedFiles([]); }}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
                >
                <X className="w-6 h-6" />
                </button>
            </div>

            <div className="p-10">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4">
                Upload resumes <span className="text-slate-300 ml-2 font-bold italic lowercase">Required</span>
                </label>

                {/* File Input Logic */}
                <input type="file" multiple accept=".pdf" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

                <div className="space-y-3">
                {stagedFiles.length === 0 ? (
                    /* EMPTY STATE */
                    <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full p-6 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center gap-4 text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-all group"
                    >
                    <div className="p-3 bg-white rounded-xl shadow-sm group-hover:scale-110 transition-transform">
                        <UploadCloud className="w-6 h-6" />
                    </div>
                    <span className="font-bold text-sm italic">Choose a file...</span>
                    </button>
                ) : (
                    /* LIST STATE */
                    <>
                    <div className="max-h-[300px] overflow-y-auto pr-2 space-y-2">
                        {stagedFiles.map((file, i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl group">
                            <div className="flex items-center gap-4 overflow-hidden">
                            <div className="p-2 bg-white rounded-lg border border-slate-100">
                                <Briefcase className="w-4 h-4 text-slate-400" />
                            </div>
                            <span className="text-xs font-bold text-slate-600 truncate">{file.name}</span>
                            </div>
                            <button 
                            onClick={() => removeFile(i)}
                            className="p-2 bg-slate-200/50 hover:bg-red-500 hover:text-white rounded-full text-slate-400 transition-all"
                            >
                            <X className="w-4 h-4" />
                            </button>
                        </div>
                        ))}
                    </div>
                    
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 text-blue-500 font-black text-[10px] uppercase tracking-widest py-4 hover:text-blue-600 transition-colors"
                    >
                        Add <Plus className="w-4 h-4" />
                    </button>
                    </>
                )}
                </div>

                {/* Footer Actions */}
                <div className="mt-10">
                <button 
                    onClick={handleSubmitBatch}
                    disabled={stagedFiles.length === 0 || isAnalyzing}
                    className="px-10 py-4 bg-[#2daab8] text-white rounded-2xl font-black text-xs tracking-tight shadow-lg shadow-cyan-100 hover:bg-[#248d99] disabled:bg-slate-200 disabled:shadow-none transition-all"
                >
                    Submit
                </button>
                </div>
            </div>
            </div>
        </div>
        )} 
      {/* ADVANCED SETTINGS MODAL */}
            {showAdvancedSettings && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden">
            
            {/* Header */}
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-800">
                  AI Screening Settings
                </h2>
                <p className="text-xs font-bold text-slate-400 mt-1">
                  Adjust recommendation thresholds and scoring strategy.
                </p>
              </div>

              <button
                onClick={() => setShowAdvancedSettings(false)}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-8 space-y-10 max-h-[70vh] overflow-y-auto custom-scrollbar">
              
              {/* Section 1: Recommendation Thresholds */}
              <section>
                <h3 className="text-lg font-black text-slate-800 mb-2">
                  Recommendation Thresholds
                </h3>

                <p className="text-xs font-bold text-slate-400 mb-8">
                  Define how APS scores are grouped into interview recommendation zones.
                </p>

                {/* 3-ZONE THRESHOLD BAR */}
                <div className="space-y-6">
                  <div className="relative pt-8 pb-10">
                    {/* Value markers */}
                    <div
                      className="absolute top-0 -translate-x-1/2 text-[10px] font-black text-orange-500"
                      style={{ left: `${tempMinimumInterviewThreshold}%` }}
                    >
                      {tempMinimumInterviewThreshold}
                    </div>

                    <div
                      className="absolute top-0 -translate-x-1/2 text-[10px] font-black text-emerald-500"
                      style={{ left: `${tempStrongThreshold}%` }}
                    >
                      {tempStrongThreshold}
                    </div>

                    {/* Main bar */}
                    <div className="relative h-4 rounded-full overflow-hidden bg-slate-100 border border-slate-100">
                      {/* Not for interview zone */}
                      <div
                        className="absolute left-0 top-0 h-full bg-red-100"
                        style={{ width: `${tempMinimumInterviewThreshold}%` }}
                      />

                      {/* Potential zone */}
                      <div
                        className="absolute top-0 h-full bg-orange-100"
                        style={{
                          left: `${tempMinimumInterviewThreshold}%`,
                          width: `${tempStrongThreshold - tempMinimumInterviewThreshold}%`
                        }}
                      />

                      {/* Yes zone */}
                      <div
                        className="absolute top-0 h-full bg-emerald-100"
                        style={{
                          left: `${tempStrongThreshold}%`,
                          width: `${100 - tempStrongThreshold}%`
                        }}
                      />
                    </div>

                    {/* Handles */}
                    <div
                      className="absolute top-[27px] w-5 h-5 rounded-full bg-orange-500 border-4 border-white shadow-lg -translate-x-1/2"
                      style={{ left: `${tempMinimumInterviewThreshold}%` }}
                    />

                    <div
                      className="absolute top-[27px] w-5 h-5 rounded-full bg-emerald-500 border-4 border-white shadow-lg -translate-x-1/2"
                      style={{ left: `${tempStrongThreshold}%` }}
                    />

                    {/* Labels */}
                    <div className="absolute bottom-0 left-0 right-0 grid grid-cols-3 text-[9px] font-black uppercase tracking-widest text-slate-400">
                      <span className="text-red-400">Not for Interview</span>
                      <span className="text-center text-orange-400">Potential</span>
                      <span className="text-right text-emerald-500">Interview: Yes</span>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                      <label className="text-[10px] font-black uppercase tracking-widest text-orange-500 block mb-3">
                        Potential Interview Starts At
                      </label>

                      <input
                        type="range"
                        min="0"
                        max={tempStrongThreshold}
                        value={tempMinimumInterviewThreshold}
                        onChange={(e) => setTempMinimumInterviewThreshold(Number(e.target.value))}
                        className="w-full accent-orange-500"
                      />

                      <p className="text-[10px] text-slate-400 font-bold mt-3">
                        Scores from {tempMinimumInterviewThreshold} to {tempStrongThreshold - 1} are marked as potential for interview.
                      </p>
                    </div>

                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                      <label className="text-[10px] font-black uppercase tracking-widest text-emerald-500 block mb-3">
                        Interview Recommendation Starts At
                      </label>

                      <input
                        type="range"
                        min={tempMinimumInterviewThreshold}
                        max="100"
                        value={tempStrongThreshold}
                        onChange={(e) => setTempStrongThreshold(Number(e.target.value))}
                        className="w-full accent-emerald-500"
                      />

                      <p className="text-[10px] text-slate-400 font-bold mt-3">
                        Scores from {tempStrongThreshold} and above are marked as recommended for interview.
                      </p>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-4 rounded-2xl bg-red-50 border border-red-100">
                      <p className="text-[9px] font-black uppercase tracking-widest text-red-400 mb-1">
                        0 - {tempMinimumInterviewThreshold - 1}
                      </p>
                      <p className="text-xs font-black text-red-500">
                        Not for Interview
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-orange-50 border border-orange-100">
                      <p className="text-[9px] font-black uppercase tracking-widest text-orange-400 mb-1">
                        {tempMinimumInterviewThreshold} - {tempStrongThreshold - 1}
                      </p>
                      <p className="text-xs font-black text-orange-500">
                        Potential for Interview
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                      <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400 mb-1">
                        {tempStrongThreshold} - 100
                      </p>
                      <p className="text-xs font-black text-emerald-500">
                        Recommendation for Interview
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Section 2: Scoring Strategy */}
              <section>
                <h3 className="text-lg font-black text-slate-800 mb-2">
                  Scoring Strategy
                </h3>
                <p className="text-xs font-bold text-slate-400 mb-6">
                  Choose how APS weights are distributed during general resume screening.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(Object.keys(PRESETS) as Array<keyof typeof PRESETS>).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTempStrategy(key)}
                      className={`p-5 rounded-2xl border-2 text-left transition-all ${
                        tempStrategy === key
                          ? "bg-slate-900 border-slate-900 text-white shadow-lg"
                          : "bg-white border-slate-200 text-slate-500 hover:border-blue-400"
                      }`}
                    >
                      <div className="mb-4">
                        {PRESETS[key].icon}
                      </div>

                      <span className="text-xs font-black uppercase tracking-wider block mb-2">
                        {PRESETS[key].name}
                      </span>

                      <p className={`text-[10px] font-medium leading-relaxed ${
                        tempStrategy === key ? "text-slate-400" : "text-slate-400"
                      }`}>
                        {PRESETS[key].desc}
                      </p>

                      <div className="mt-5 space-y-2">
                        {Object.entries(PRESETS[key].weights).map(([weightKey, value]) => (
                          <div key={weightKey} className="flex justify-between text-[9px] font-black uppercase tracking-tight">
                            <span className={tempStrategy === key ? "text-slate-400" : "text-slate-400"}>
                              {WEIGHT_LABELS[weightKey]}
                            </span>
                            <span className={tempStrategy === key ? "text-white" : "text-slate-700"}>
                              {value}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-lg font-black text-slate-800 mb-2">
                  Position Status
                </h3>
                <p className="text-xs font-bold text-slate-400 mb-6">
                  Control whether this job position is open, paused, or closed.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(['Open', 'On Hold', 'Closed'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setTempPositionStatus(status)}
                      className={`p-5 rounded-2xl border-2 text-left transition-all ${
                        tempPositionStatus === status
                          ? "bg-slate-900 border-slate-900 text-white shadow-lg"
                          : "bg-white border-slate-200 text-slate-500 hover:border-blue-400"
                      }`}
                    >
                      <span className="text-xs font-black uppercase tracking-wider block mb-2">
                        {status}
                      </span>

                      <p className={`text-[10px] font-medium leading-relaxed ${
                        tempPositionStatus === status ? "text-slate-400" : "text-slate-400"
                      }`}>
                        {status === 'Open'
                          ? 'This position is actively accepting resume screenings.'
                          : status === 'On Hold'
                          ? 'This position is temporarily paused but still visible.'
                          : 'This position is closed and no longer actively screened.'}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className="p-8 border-t border-slate-100 flex justify-end gap-4">
              <button
                onClick={() => setShowAdvancedSettings(false)}
                className="px-6 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-black uppercase tracking-widest"
              >
                Cancel
              </button>

              <button
                onClick={saveAdvancedSettings}
                className="px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-100"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobDashboard;
