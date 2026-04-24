import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import axios from 'axios';
import { FileText } from 'lucide-react';
import { setToken, getToken } from '../Utils/auth';

const API_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://127.0.0.1:8000';

function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (getToken()) {
    return <Navigate to="/jobs" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const response = await axios.post(`${API_URL}/token`, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      setToken(response.data.access_token);
      navigate('/jobs');
    } catch (err) {
      console.error('Login failed', err);
      setError('Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-white rounded-[2rem] border border-gray-100 shadow-sm p-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-blue-600 p-2 rounded-xl text-white">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-[#2c3e50]">ResuLens Login</h1>
            <p className="text-xs text-gray-400 font-bold">Sign in to continue</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-4 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-200"
              required
            />
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-4 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-200"
              required
            />
          </div>

          {error && (
            <p className="text-xs font-bold text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 disabled:bg-slate-300 transition-all"
          >
            {loading ? 'Signing In...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
