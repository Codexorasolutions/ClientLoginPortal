// Small toast system: const { push, node } = useToasts();  push('Saved'); push('Could not save', 'error'); … render {node} once.
import { useCallback, useRef, useState } from 'react';

export function useToasts() {
  const [items, setItems] = useState([]);
  const id = useRef(0);
  const dismiss = useCallback((i) => setItems((list) => list.filter((t) => t.id !== i)), []);
  const push = useCallback((text, type = 'ok') => {
    const n = ++id.current;
    setItems((list) => [...list.slice(-3), { id: n, text, type }]);
    setTimeout(() => dismiss(n), type === 'error' ? 7000 : 4000);
  }, [dismiss]);
  const node = (
    <div className="toast-stack" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>
          <span>{t.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)}>✕</button>
        </div>
      ))}
    </div>
  );
  return { push, node };
}
