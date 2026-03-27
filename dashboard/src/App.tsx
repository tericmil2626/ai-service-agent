import { Routes, Route } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Conversations } from './pages/Conversations';
import { Technicians } from './pages/Technicians';
import { Appointments } from './pages/Appointments';
import { Leads } from './pages/Leads';
import { Calendar } from './pages/Calendar';
import { VoiceCalls } from './pages/VoiceCalls';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/conversations" element={<Conversations />} />
      <Route path="/technicians" element={<Technicians />} />
      <Route path="/appointments" element={<Appointments />} />
      <Route path="/leads" element={<Leads />} />
      <Route path="/calendar" element={<Calendar />} />
      <Route path="/voice-calls" element={<VoiceCalls />} />
    </Routes>
  );
}

export default App;
