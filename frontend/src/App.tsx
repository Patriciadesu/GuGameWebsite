import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import MainMenu from './pages/MainMenu';

function App() {
  return (
    <Router basename="/gugame">
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/mainmenu" element={<MainMenu />} />
      </Routes>
    </Router>
  );
}

export default App;
