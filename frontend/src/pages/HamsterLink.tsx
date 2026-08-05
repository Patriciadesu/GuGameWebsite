import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from '../config/axios';
import './MainMenu.css';

function HamsterLink() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    const authError = searchParams.get('error');
    window.history.replaceState({}, '', '/gugame/hamster-link');

    if (authError || !token) {
      setError('HamsterQuest login was not completed.');
      return;
    }

    axios.post('/api/inventory/hamsterquest/link', { token })
      .then(() => navigate('/mainmenu', { replace: true }))
      .catch((requestError) => {
        setError(requestError.response?.data?.error || 'Unable to link HamsterQuest.');
      });
  }, [navigate, searchParams]);

  return (
    <main className="hamster-link-page">
      <section className="hamster-link-panel">
        <div className="hamster-link-spinner" aria-hidden="true" />
        <h1>{error ? 'Link failed' : 'Linking HamsterQuest'}</h1>
        <p>{error || 'Syncing your account and inventory...'}</p>
        {error && <button type="button" onClick={() => navigate('/mainmenu', { replace: true })}>Back to Main Menu</button>}
      </section>
    </main>
  );
}

export default HamsterLink;
