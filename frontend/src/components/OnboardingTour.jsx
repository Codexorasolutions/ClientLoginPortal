import { useEffect, useState } from 'react';

// A first-login walkthrough that advances the REAL dashboard tab underneath
// it as it goes, so each step shows the actual section being described
// instead of a disconnected floating box. Dismiss state is a localStorage
// flag per browser — simple and dependency-free, at the cost of showing
// again if the same client logs in from a different device/browser.
export default function OnboardingTour({ steps, activeKey, onStepChange, storageKey = 'cx_tour_done' }) {
  const [visible, setVisible] = useState(() => !localStorage.getItem(storageKey));
  const [i, setI] = useState(0);

  useEffect(() => {
    if (visible) onStepChange(steps[i].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, visible]);

  const finish = () => {
    localStorage.setItem(storageKey, '1');
    setVisible(false);
  };

  if (!visible) return null;
  const step = steps[i];
  const isLast = i === steps.length - 1;

  return (
    <div className="tour-overlay">
      <div className="tour-card">
        <div className="tour-dots">
          {steps.map((s, idx) => <span key={s.key} className={`tour-dot ${idx === i ? 'on' : ''}`} />)}
        </div>
        <h4>{step.title}</h4>
        <p>{step.text}</p>
        <div className="tour-actions">
          <button className="btn-sm ghost" onClick={finish}>Skip tour</button>
          <div style={{ display: 'flex', gap: 8 }}>
            {i > 0 && <button className="btn-sm ghost" onClick={() => setI((n) => n - 1)}>Back</button>}
            <button className="btn-sm primary" onClick={() => (isLast ? finish() : setI((n) => n + 1))}>
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
