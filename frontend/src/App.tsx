import type { ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import JobList from './pages/JobList';
import JobDashboard from './pages/JobDashboard';
import CandidateDetail from './pages/CandidateDetail';
import JobFullDetails from './pages/JobFullDetails';
import Results from './pages/Results'; // Keeping your current results page for compatibility
import Login from './pages/Login';
import { getToken } from './Utils/auth';

function ProtectedRoute({ children }: { children: ReactNode }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/jobs" element={<ProtectedRoute><JobList /></ProtectedRoute>} />
        <Route path="/job/:jobId" element={<ProtectedRoute><JobDashboard /></ProtectedRoute>} />
        <Route path="/job/:jobId/candidate/:candidateId" element={<ProtectedRoute><CandidateDetail /></ProtectedRoute>} />
        <Route path="/job/:jobId/details" element={<ProtectedRoute><JobFullDetails /></ProtectedRoute>} />
        
        {/* Legacy route in case you still need the old results view */}
        <Route path="/results" element={<Results />} />
      </Routes>
    </Router>
  );
}

export default App;
