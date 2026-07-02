import { useEffect } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import Track from './pages/Track.jsx';
import Dashboard from './pages/Dashboard.jsx';
import History from './pages/History.jsx';
import Timeline from './pages/Timeline.jsx';
import BabySelector from './components/BabySelector.jsx';
import BabyForm from './forms/BabyForm.jsx';
import { useBaby } from './context/BabyContext.jsx';
import { useToast } from './components/Toast.jsx';
import { PlusCircleFill, GraphUp, ClockHistory, Calendar3, CupStraw } from './icons.jsx';

function BottomNav() {
  const items = [
    { to: '/', Icon: PlusCircleFill, label: 'Track', end: true },
    { to: '/dashboard', Icon: GraphUp, label: 'Dashboard' },
    { to: '/timeline', Icon: Calendar3, label: 'Timeline' },
    { to: '/history', Icon: ClockHistory, label: 'History' },
  ];
  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {items.map(({ to, Icon, label, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon size={21} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function Brand() {
  return (
    <div className="header-left">
      <img className="brand-icon" src="/icons/icon-192.png" alt="BabyTrak" width="28" height="28" />
      <h1>BabyTrak</h1>
    </div>
  );
}

// First-run / no-baby state: collect the first baby before anything else.
function Welcome() {
  const { addBaby } = useBaby();
  const notify = useToast();
  return (
    <div className="app">
      <header className="app-header">
        <Brand />
      </header>
      <main className="app-main">
        <div className="empty" style={{ paddingBottom: 10 }}>
          <CupStraw className="empty-icon" size={48} />
          <p>Welcome to BabyTrak. Add your little one to get started.</p>
        </div>
        <div className="card">
          <BabyForm notify={notify} hideCancel onSave={(data) => addBaby(data)} />
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const { loading, loadError, retry, babies, caregivers, selectedBaby } = useBaby();

  // Theme the whole app to the selected baby's gender.
  useEffect(() => {
    const g = selectedBaby?.gender;
    if (g === 'boy' || g === 'girl') {
      document.documentElement.dataset.theme = g;
    } else {
      delete document.documentElement.dataset.theme;
    }
  }, [selectedBaby]);

  if (loading) {
    return (
      <div className="app">
        <main className="app-main">
          <p className="empty">Loading…</p>
        </main>
      </div>
    );
  }

  // Couldn't reach the server (e.g. it's still restarting). Never fall through
  // to the add-baby screen here — your data is safe, we just can't load it yet.
  if (loadError) {
    return (
      <div className="app">
        <header className="app-header">
          <Brand />
        </header>
        <main className="app-main">
          <div className="empty">
            <CupStraw className="empty-icon" size={48} />
            <p>Can't reach the server. Retrying…</p>
            <button className="btn btn-primary" style={{ maxWidth: 200 }} onClick={() => retry().catch(() => {})}>
              Try again
            </button>
          </div>
        </main>
      </div>
    );
  }

  // First run only: no babies and no caregivers yet. The welcome flow collects
  // the first baby; caregivers are added later from the selector.
  if (babies.length === 0 && caregivers.length === 0) {
    return <Welcome />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <Brand />
        <BabySelector />
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Track />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}
