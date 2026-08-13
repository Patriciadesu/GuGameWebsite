import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import MainMenu from './pages/MainMenu';
import AdminPage from './pages/AdminPage';
import Shop from './pages/Shop';
import HamsterLink from './pages/HamsterLink';
import Inventory from './pages/Inventory';
import ThemeToggle from './components/ThemeToggle';

function App() {
  return (
    <Router basename="/gugame">
      <ThemeToggle />
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/mainmenu" element={<MainMenu />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/hamster-link" element={<HamsterLink />} />
        <Route path="/leaderboard" element={<Navigate to="/mainmenu" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
