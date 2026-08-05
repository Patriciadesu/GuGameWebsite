import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import Login from './pages/Login';
import MainMenu from './pages/MainMenu';
import AdminPage from './pages/AdminPage';
import Shop from './pages/Shop';
import HamsterLink from './pages/HamsterLink';

function TestLogin() {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const key = searchParams.get('key');
    if (key) {
      window.location.replace(`${import.meta.env.VITE_API_URL}/api/auth/test-login?key=${encodeURIComponent(key)}`);
    }
  }, [searchParams]);

  return <main>Test access requires a valid key.</main>;
}

function App() {
  return (
    <Router basename="/gugame">
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/mainmenu" element={<MainMenu />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/hamster-link" element={<HamsterLink />} />
        <Route path="/test" element={<TestLogin />} />
        <Route path="/leaderboard" element={<Navigate to="/mainmenu" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
