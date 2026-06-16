import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { FullReportEmbed } from '../components/FullReportEmbed';

interface LocationState {
  name?: string;
}

export function ReportPage() {
  const { key } = useParams<{ key: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;

  if (!key) {
    navigate('/', { replace: true });
    return null;
  }

  return (
    <div className="report-page">
      <header className="report-header">
        <button className="back-btn" onClick={() => navigate('/')} type="button">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M11.25 13.5L6.75 9L11.25 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All reports
        </button>
        {state.name && <span className="report-header__name">{state.name}</span>}
      </header>
      <FullReportEmbed reportKey={key} />
    </div>
  );
}
