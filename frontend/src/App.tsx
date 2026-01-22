import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import MainMenu from './pages/MainMenu';
import AdminPage from './pages/AdminPage';
import Shop from './pages/Shop';

function App() {
  return (
    <Router basename="/gugame">
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/mainmenu" element={<MainMenu />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/shop" element={<Shop />} />
      </Routes>
    </Router>
  );
}

export default App;
