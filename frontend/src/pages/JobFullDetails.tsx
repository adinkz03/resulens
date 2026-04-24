import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ShieldCheck, 
  GraduationCap, 
  Layout,      
  Info,          
  Save, 
  Edit3, 
  CheckCircle,    
  FileText
} from 'lucide-react';
import type { Job } from '../Utils/storage';
import axios from 'axios';
import PageBreadcrumb from "../components/PageBreadcrumb";
import { getAuthHeaders, removeToken } from '../Utils/auth';

const API_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://127.0.0.1:8000';


// --- STEP 1: MOVE HELPERS OUTSIDE TO FIX THE FOCUS BUG ---

const Section = ({ title, icon: Icon, children }: any) => (
  <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm p-10 mb-8">
    <div className="flex items-center gap-3 mb-8">
      <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight">{title}</h3>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {children}
    </div>
  </div>
);

const EditableRow = ({ label, section, field, value, isEditing, updateField, isTextArea = false }: any) => (
  <div className="flex flex-col gap-2">
    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</span>
    {isEditing ? (
      isTextArea ? (
        <textarea 
          value={value}
          onChange={(e) => updateField(section, field, e.target.value)}
          className="w-full p-4 bg-gray-50 border border-blue-100 rounded-xl text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-200 resize-none"
          rows={4}
        />
      ) : (
        <input 
          type="text"
          value={value}
          onChange={(e) => updateField(section, field, e.target.value)}
          className="w-full p-4 bg-gray-50 border border-blue-100 rounded-xl text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-200"
        />
      )
    ) : (
      <p className="text-sm text-gray-600 leading-relaxed font-medium whitespace-pre-line">
        {value || "Not Specified"}
      </p>
    )}
  </div>
);

// --- STEP 2: MAIN COMPONENT ---

const JobFullDetails = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const handleUnauthorized = () => {
    removeToken();
    navigate("/login");
  };
  
  const [job, setJob] = useState<Job | undefined>(undefined);
  const [isEditing, setIsEditing] = useState(false);
  const [hasSaved, setHasSaved] = useState(false); // ✅ Fixed: Now used in the UI

  const fetchJob = async () => {
    if (!jobId) return;

    try {
      const response = await axios.get(`${API_URL}/jobs/${jobId}`, {
        headers: getAuthHeaders()
      });
      setJob(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        handleUnauthorized();
        return;
      }

      console.error("Failed to fetch job details", error);
    }
  };

  useEffect(() => {
    fetchJob();
  }, [jobId]);

  const updateField = (section: string, field: string, value: string) => {
    setJob((prev: any) => {
      if (!prev) return prev;

      return {
        ...prev,
        details: {
          ...prev.details,
          [section]: {
            ...prev.details[section],
            [field]: value
          }
        }
      };
    });
  };

  const handleSave = async () => {
    if (!job) return;

    try {
      const payload = {
        title: job.title,
        status: job.status || "Active",
        positionStatus: job.positionStatus || "Open",
        details: {
          basic: job.details.basic,
          technical: job.details.technical,
          qualifications: job.details.qualifications,
          additional: job.details.additional
        },
        scoringStrategy: (job as any).scoringStrategy || "balanced",
        strongThreshold: (job as any).strongThreshold || 75,
        minimumInterviewThreshold: (job as any).minimumInterviewThreshold || 50
      };

      const response = await axios.put(`${API_URL}/jobs/${job.id}`, payload, {
        headers: getAuthHeaders()
      });

      setJob(response.data);
      setIsEditing(false);
      setHasSaved(true);
      setTimeout(() => setHasSaved(false), 3000);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        handleUnauthorized();
        return;
      }

      console.error("Failed to save job details", error);
      alert("Something went wrong. Please try again.");
    }
  };

  if (!job) return <div className="p-20 text-center font-black text-gray-400">Loading Details...</div>;

  return (
    <div className="bg-[#F8FAFC] min-h-screen pb-20">
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
      <div className="max-w-7xl mx-auto px-10 pt-10">
        <PageBreadcrumb
          items={[
            { label: "Job List", onClick: () => navigate("/jobs") },
            { label: "Job Dashboard", onClick: () => navigate(`/job/${job.id}`) },
            { label: "Job Full Details", active: true }
          ]}
        />

        {/* PAGE HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <h1 className="text-5xl font-black text-gray-800 mb-2">
              {job.title}
            </h1>
            <p className="text-sm text-gray-400 font-bold italic">
              Review and adjust structured job requirements before screening candidates.
            </p>
          </div>

          <div className="flex items-center gap-4">
            {hasSaved && (
              <div className="flex items-center gap-2 text-emerald-500 font-black text-[10px] uppercase tracking-widest animate-pulse">
                <CheckCircle className="w-4 h-4" /> Changes Saved
              </div>
            )}

            <button 
              onClick={isEditing ? handleSave : () => setIsEditing(true)}
              className={`flex items-center gap-2 px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg
                ${isEditing 
                  ? 'bg-emerald-500 text-white shadow-emerald-100' 
                  : 'bg-blue-600 text-white shadow-blue-100'
                }`}
            >
              {isEditing ? (
                <>
                  <Save className="w-4 h-4" /> Save Changes
                </>
              ) : (
                <>
                  <Edit3 className="w-4 h-4" /> Edit Details
                </>
              )}
            </button>
          </div>
        </div>

        {/* BASIC DETAILS */}
        <Section title="Basic Details" icon={Info}>
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Job Title
            </span>

            {isEditing ? (
              <input 
                value={job.title} 
                onChange={(e) => setJob({ ...job, title: e.target.value })} 
                className="w-full p-4 bg-gray-50 border border-blue-100 rounded-xl text-sm font-bold text-gray-700"
              />
            ) : (
              <p className="text-sm text-gray-600 font-bold">
                {job.title}
              </p>
            )}
          </div>

          <EditableRow 
            label="Employment Type" 
            section="basic" 
            field="employmentType" 
            value={job.details.basic.employmentType} 
            isEditing={isEditing} 
            updateField={updateField} 
          />

          <EditableRow 
            label="Experience Level" 
            section="basic" 
            field="expLevel" 
            value={job.details.basic.expLevel} 
            isEditing={isEditing} 
            updateField={updateField} 
          />

          <EditableRow 
            label="Location" 
            section="basic" 
            field="location" 
            value={job.details.basic.location} 
            isEditing={isEditing} 
            updateField={updateField} 
          />
        </Section>

        {/* ROLE REQUIREMENTS */}
        <Section title="Role Requirements" icon={ShieldCheck}>
          <EditableRow 
            label="Role-Specific Skills / Capabilities" 
            section="technical" 
            field="skills" 
            value={job.details.technical.skills} 
            isEditing={isEditing} 
            updateField={updateField} 
            isTextArea 
          />

          <EditableRow 
            label="Tools, Software, Equipment, or Methods" 
            section="technical" 
            field="tools" 
            value={job.details.technical.tools} 
            isEditing={isEditing} 
            updateField={updateField} 
            isTextArea 
          />

          <EditableRow 
            label="Certifications, Licenses, or Credentials" 
            section="technical" 
            field="certs" 
            value={job.details.technical.certs} 
            isEditing={isEditing} 
            updateField={updateField} 
            isTextArea 
          />
        </Section>

        {/* QUALIFICATIONS */}
        <Section title="Qualifications" icon={GraduationCap}>
          <EditableRow 
            label="Education / Qualification Level"
            section="qualifications" 
            field="education" 
            value={job.details.qualifications.education} 
            isEditing={isEditing} 
            updateField={updateField} 
          />

          <EditableRow 
            label="Required Experience"
            section="qualifications" 
            field="experience" 
            value={job.details.qualifications.experience} 
            isEditing={isEditing} 
            updateField={updateField} 
          />

          <EditableRow 
            label="Languages" 
            section="qualifications" 
            field="languages" 
            value={job.details.qualifications.languages} 
            isEditing={isEditing} 
            updateField={updateField} 
          />
        </Section>

        {/* ADDITIONAL CONTEXT */}
        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm p-10 mb-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
              <Layout className="w-5 h-5" />
            </div>
            <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight">
              Additional Context
            </h3>
          </div>

          <div className="space-y-8">
            <EditableRow 
              label="Key Responsibilities" 
              section="additional" 
              field="responsibilities" 
              value={job.details.additional.responsibilities} 
              isEditing={isEditing} 
              updateField={updateField} 
              isTextArea 
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <EditableRow 
                label="Professional / Interpersonal Skills"
                section="additional" 
                field="softSkills" 
                value={job.details.additional.softSkills} 
                isEditing={isEditing} 
                updateField={updateField} 
                isTextArea 
              />

              <EditableRow 
                label="Additional Must-Haves / Work Context"
                section="additional" 
                field="culturalFit" 
                value={job.details.additional.culturalFit} 
                isEditing={isEditing} 
                updateField={updateField} 
                isTextArea 
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobFullDetails;
