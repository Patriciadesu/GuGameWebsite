import { useEffect, useState } from 'react';
import { ArrowLeft, CircleAlert, Link2, LoaderCircle } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from '../config/axios';
import './HamsterLink.css';

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

  const hasError = Boolean(error);

  return (
    <main className="hlink-page">
      <div className="hlink-stars" aria-hidden="true" />
      <section className={`hlink-panel${hasError ? ' hlink-panel-error' : ''}`} aria-labelledby="hlink-title">
        <header className="hlink-brand">
          <span className="hlink-sigil" aria-hidden="true" />
          <span>GuGame</span>
          <span className="hlink-divider" aria-hidden="true" />
          <span>External Link</span>
        </header>

        <div className="hlink-status-icon" aria-hidden="true">
          {hasError ? <CircleAlert /> : <LoaderCircle className="hlink-spinner" />}
        </div>

        <div className="hlink-copy" role="status" aria-live="polite">
          <span className="hlink-kicker">{hasError ? 'Connection interrupted' : 'Account connection'}</span>
          <h1 id="hlink-title">{hasError ? 'Link failed' : 'Linking HamsterQuest'}</h1>
          <p>{error || 'Syncing your account and inventory. Keep this window open.'}</p>
        </div>

        <div className="hlink-route" aria-hidden="true">
          <span>GuGame</span>
          <span className="hlink-route-line"><i /><Link2 /></span>
          <span>HamsterQuest</span>
        </div>

        {hasError && (
          <button type="button" className="hlink-back" onClick={() => navigate('/mainmenu', { replace: true })}>
            <ArrowLeft aria-hidden="true" />
            Back to Main Menu
          </button>
        )}
      </section>
    </main>
  );
}

export default HamsterLink;
