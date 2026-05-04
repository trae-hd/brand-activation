/* global React, ReactDOM, DesignCanvas, DCSection, DCArtboard, ParticipantScreens, AdminScreens */

const { useState, useEffect } = React;

const SURFACES = {
  participant: {
    label: 'Participant',
    screens: [
      { id: 'landing', label: 'Landing' },
      { id: 'verify', label: 'Verify' },
      { id: 'success', label: 'Success' },
      { id: 'states', label: 'Edge states' },
    ],
  },
  admin: {
    label: 'Admin',
    screens: [
      { id: 'signin', label: 'Sign-in' },
      { id: 'list', label: 'Activations' },
      { id: 'builder', label: 'Builder' },
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'registrations', label: 'Registrations' },
      { id: 'transitions', label: 'Status transition' },
      { id: 'users', label: 'Users & Roles' },
      { id: 'audit', label: 'Audit Log' },
      { id: 'compliance', label: 'Erasure' },
      { id: 'settings', label: 'Settings' },
      { id: 'feedback', label: 'Feedback' },
      { id: 'support', label: 'Support' },
    ],
  },
};

function App() {
  const [surface, setSurface] = useState('participant');
  const [screen, setScreen] = useState('landing');

  useEffect(() => {
    const t = document.getElementById('surface-toggle');
    const handler = (e) => {
      const b = e.target.closest('button[data-surface]');
      if (!b) return;
      const s = b.dataset.surface;
      setSurface(s);
      setScreen(SURFACES[s].screens[0].id);
    };
    t.addEventListener('click', handler);
    return () => t.removeEventListener('click', handler);
  }, []);

  useEffect(() => {
    document.querySelectorAll('#surface-toggle button').forEach((b) => {
      b.classList.toggle('on', b.dataset.surface === surface);
    });
  }, [surface]);

  useEffect(() => {
    const tabs = document.getElementById('screen-tabs');
    tabs.innerHTML = '';
    SURFACES[surface].screens.forEach((s) => {
      const b = document.createElement('button');
      b.textContent = s.label;
      if (s.id === screen) b.classList.add('on');
      b.addEventListener('click', () => setScreen(s.id));
      tabs.appendChild(b);
    });
  }, [surface, screen]);

  const Screens = surface === 'participant' ? ParticipantScreens : AdminScreens;
  const screenDef = Screens[screen];
  if (!screenDef) return null;

  return (
    <DesignCanvas key={`${surface}:${screen}`}>
      <DCSection
        id={`${surface}-${screen}`}
        title={screenDef.title}
        subtitle={screenDef.subtitle}
      >
        {screenDef.variations.map((v) => (
          <DCArtboard key={v.id} id={v.id} label={v.label} width={v.width} height={v.height}>
            {v.render()}
          </DCArtboard>
        ))}
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
