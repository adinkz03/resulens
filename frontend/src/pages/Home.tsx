import { useNavigate } from 'react-router-dom';
import { FileText, ArrowRight, Search, ShieldCheck, Zap } from 'lucide-react';
import { getToken, removeToken } from '../Utils/auth';

function Home() {
  const navigate = useNavigate();
  const isLoggedIn = !!getToken();

  return (
    <div className="font-sans text-gray-800 bg-white min-h-screen flex flex-col">
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

        <button
          onClick={() => {
            if (isLoggedIn) {
              const shouldLogout = window.confirm("Are you sure you want to log out?");
              if (!shouldLogout) return;

              removeToken();
              navigate('/');
              return;
            }

            navigate('/login');
          }}
          className={`px-5 py-2 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all ${
            isLoggedIn
              ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isLoggedIn ? 'Logout' : 'Login'}
        </button>
      </nav>

      {/* MINIMALIST HERO */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-6">
          <Zap className="w-3 h-3" /> AI-Driven Recruitment
        </div>

        <h1 className="text-5xl md:text-7xl font-black text-[#2c3e50] mb-6 leading-[1.1]">
          Audit Candidates with <br />
          <span className="text-blue-600">Total Clarity.</span>
        </h1>

        <p className="text-lg text-gray-400 mb-10 max-w-xl leading-relaxed">
          ResuLens uses Gemini-based extraction and local scoring logic to analyze
          resumes against structured job profiles with auditable evidence.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <button
            onClick={() => navigate(isLoggedIn ? '/jobs' : '/login')}
            className="group px-10 py-5 bg-blue-600 text-white font-black rounded-3xl shadow-2xl shadow-blue-100 hover:bg-blue-700 hover:-translate-y-1 transition-all flex items-center justify-center gap-3 text-xs uppercase tracking-widest"
          >
            Get Started
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* QUICK FEATURE FOOTER */}
        <div className="mt-20 grid grid-cols-1 sm:grid-cols-2 gap-8 text-left border-t border-gray-100 pt-12">
          <div className="flex gap-4">
            <div className="p-3 bg-gray-50 rounded-2xl text-blue-600 h-fit">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-gray-800 text-sm">
                Evidence-Based Matching
              </h4>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                AI analyzes and proves candidate fit with verified resume snippets.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="p-3 bg-gray-50 rounded-2xl text-blue-600 h-fit">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-gray-800 text-sm">
                Structured Pipeline
              </h4>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                View candidate screening stages and audit results in a structured
                workflow.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* UNIMAS BRANDING */}
      <footer className="py-8 text-center">
        <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.5em]">
          UNIMAS // FYP
        </p>
      </footer>
    </div>
  );
}

export default Home;
