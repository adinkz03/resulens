import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Briefcase, X, Sparkles, Wand2, Loader2, FileText, MoreHorizontal, Trash2} from 'lucide-react';
import type { Job } from '../Utils/storage';
import axios from 'axios';
import PageBreadcrumb from "../components/PageBreadcrumb";
import { getAuthHeaders, removeToken } from '../Utils/auth';

const API_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://127.0.0.1:8000';

const JobList = () => {
  const navigate = useNavigate(); 

  const handleUnauthorized = () => {
    removeToken();
    navigate('/login');
  };

  const fetchJobs = async () => {
    try {
      const response = await axios.get(`${API_URL}/jobs`, {
        headers: getAuthHeaders()
      });
      setJobs(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        handleUnauthorized();
        return;
      }

      console.error("Failed to fetch jobs", error);
    }
  };
  const [jobs, setJobs] = useState<Job[]>([]);
  
  // Modal & Input States
  const [showModal, setShowModal] = useState(false);
  const [description, setDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Load jobs on mount
  useEffect(() => {
    fetchJobs();
  }, []);

  const handleGenerateAndSave = async () => {
    if (!description) return;
    setIsGenerating(true);
    
    try {
      // 1. Generate structured job profile
      const response = await axios.post(
        `${API_URL}/generate-job-structure`,
        { description },
        { headers: getAuthHeaders() }
      );

      // 2. Build payload for DB-backed /jobs route
      const newJobPayload = {
        title: response.data.title || "New Position",
        status: "Active",
        positionStatus: "Open",
        details: {
          basic: { 
            employmentType: response.data.employment_type || "",
            expLevel: response.data.exp_level || "",
            location: response.data.location || "Not specified"
          },
          technical: { 
            skills: response.data.technical_skills || "",
            tools: response.data.tools_software || "",
            certs: response.data.certifications || ""
          },
          qualifications: { 
            education: response.data.education_level || "",
            experience: response.data.years_exp || "",
            languages: response.data.languages || ""
          },
          additional: { 
            responsibilities: response.data.responsibilities || "",
            softSkills: response.data.soft_skills || "",
            culturalFit: response.data.culture_fit || ""
          }
        },
        scoringStrategy: "balanced",
        strongThreshold: 75,
        minimumInterviewThreshold: 50
      };

      // 3. Save to PostgreSQL through backend
      await axios.post(`${API_URL}/jobs`, newJobPayload, {
        headers: getAuthHeaders()
      });

      // 4. Refresh UI
      await fetchJobs();
      setShowModal(false);
      setDescription('');
      
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        handleUnauthorized();
        return;
      }

      console.error("Job generation or save failed", error);
      alert("Something went wrong. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteJob = async (id: string) => {
    const shouldDelete = window.confirm(
      "Are you sure you want to delete this job? This action cannot be undone."
    );

    if (!shouldDelete) return;

    try {
      setOpenMenuId(null);
      await axios.delete(`${API_URL}/jobs/${id}`, {
        headers: getAuthHeaders()
      });
      await fetchJobs();
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        handleUnauthorized();
        return;
      }

      console.error("Failed to delete job", error);
      alert("Something went wrong. Please try again.");
    }
  };

  const getPositionStatus = (job: Job) => {
    if (job.positionStatus) return job.positionStatus;
    return job.status === 'Closed' ? 'Closed' : 'Open';
  };

  const getStatusColor = (status: string) => {
    if (status === 'Open') return 'bg-cyan-50 text-cyan-600';
    if (status === 'On Hold') return 'bg-orange-50 text-orange-500';
    return 'bg-red-50 text-red-500';
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

        {/* 2. ADD THE BACK BUTTON HERE */}
      <PageBreadcrumb
          items={[
            { label: "Home Page", onClick: () => navigate("/") }
          ]}
        />

      {/* HEADER */}
      <div className="flex justify-between items-center mb-12">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg">
            <Briefcase className="w-6 h-6" />
          </div>
          <h1 className="text-4xl font-black text-[#2c3e50]">Your Jobs</h1>
        </div>
        
        <button 
          onClick={() => setShowModal(true)} // ✅ Now opens the modal
          className="flex items-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-3xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100"
        >
          <Plus className="w-5 h-5" /> Add New Job
        </button>
      </div>

      {/* JOBS TABLE */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-visible relative">
        <table className="w-full text-left">
          <thead className="bg-gray-50/50 text-[10px] font-black uppercase text-gray-400 tracking-widest">
            <tr>
              <th className="px-6 py-3 w-[36%]">Job Title</th>
              <th className="px-6 py-3 w-[18%] text-center">Position Status</th>
              <th className="px-6 py-3 w-[16%] text-center">Total Resumes</th>
              <th className="px-6 py-3 w-[20%] text-center">High Fit Candidates</th>
              <th className="px-6 py-3 w-[10%] text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {jobs.map((job) => (
              <tr
                key={job.id}
                onClick={() => {
                  setOpenMenuId(null);
                  navigate(`/job/${job.id}`);
                }}
                className="hover:bg-slate-50/60 transition-colors cursor-pointer"
              >
                <td className="px-6 py-3 w-[36%]">
                  <div>
                    <p className="font-black text-slate-800 text-sm">
                      {job.title}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                      Created {formatCreatedAt(job.createdAt)}
                    </p>
                  </div>
                </td>

                <td className="px-6 py-4 w-[18%] text-center">
                  <div className="flex justify-center">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${getStatusColor(getPositionStatus(job))}`}>
                      {getPositionStatus(job)}
                    </span>
                  </div>
                </td>

                <td className="px-6 py-4 w-[16%] text-sm font-black text-slate-700 text-center">
                  {job.candidates?.length || 0}
                </td>

                <td className="px-6 py-4 w-[20%] text-sm font-black text-slate-700 text-center">
                  {job.candidates?.filter(c => c.match_level === "High").length || 0}
                </td>

                <td className="px-6 py-4 w-[10%] text-center relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(openMenuId === job.id ? null : job.id);
                    }}
                    className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all"
                  >
                    <MoreHorizontal className="w-5 h-5" />
                  </button>

                  {openMenuId === job.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-6 bottom-12 z-50 w-44 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden"
                    >
                      <button
                        onClick={() => {
                          handleDeleteJob(job.id);
                          setOpenMenuId(null);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-bold text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete Job
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {jobs.length === 0 && (
          <div className="p-20 text-center text-[10px] font-black uppercase tracking-widest text-gray-300">
            No jobs created yet
          </div>
        )}
      </div>
      </div>

      {/* --- AI GENERATOR MODAL --- */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
           <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl p-12 relative">
              <button onClick={() => setShowModal(false)} className="absolute top-10 right-10 text-gray-300 hover:text-gray-600">
                 <X className="w-7 h-7" />
              </button>

              <div className="text-center mb-10">
                <h2 className="text-4xl font-black text-[#2c3e50] mb-3">
                  Job Profile Generator
                </h2>
                <p className="text-gray-400 font-medium leading-relaxed">
                  Let AI structure role requirements for general resume screening.
                </p>
              </div>

              <div className="space-y-8">
                 <div className="flex gap-2 p-1.5 bg-gray-100 rounded-3xl">
                    <button className="flex-1 py-4 bg-white rounded-2xl shadow-sm text-[10px] font-black text-blue-600 flex items-center justify-center gap-2 uppercase tracking-widest">
                       <Sparkles className="w-4 h-4" /> AI Generator
                    </button>
                    <button className="flex-1 py-4 text-gray-300 text-[10px] font-black uppercase tracking-widest opacity-50 cursor-not-allowed">
                      Manual Upload Soon
                    </button>
                 </div>

                 <textarea 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the role, requirements, responsibilities, experience level, location, and any required credentials..."
                    className="w-full p-8 bg-gray-50 border-none rounded-[2.5rem] outline-none focus:ring-2 focus:ring-blue-100 transition-all resize-none text-gray-700"
                    rows={5}
                 />

                 <button 
                   onClick={handleGenerateAndSave}
                   disabled={isGenerating || !description}
                   className="w-full py-6 bg-blue-600 text-white font-black rounded-[2rem] shadow-2xl shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center gap-3 uppercase text-xs tracking-[0.2em]"
                 >
                   {isGenerating ? (
                     <><Loader2 className="w-5 h-5 animate-spin" /> Generating...</>
                   ) : (
                     <><Wand2 className="w-5 h-5" /> Generate Job Profile</>
                   )}
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default JobList;
