import { useEffect, useRef, useState } from 'react';
import api from '../api/axios.js';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const wrapRef = useRef(null);

  const load = async () => {
    try {
      const { data } = await api.get('/notifications');
      setItems(data.notifications);
      setUnread(data.unreadCount);
    } catch {
      // stay quiet — a failed notification fetch shouldn't break the page
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000); // poll every 30s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', onClickOutside);
    return () => document.removeEventListener('click', onClickOutside);
  }, []);

  const markOne = async (id) => {
    await api.patch(`/notifications/${id}/read`);
    setItems((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
  };

  const markAll = async () => {
    await api.patch('/notifications/read-all');
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
  };

  return (
    <div className="bell-wrap" ref={wrapRef}>
      <button className="bell-btn" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        🔔
        {unread > 0 && <span className="bell-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="bell-dropdown">
          <div className="head">
            <span>Notifications</span>
            {unread > 0 && <a onClick={markAll}>Mark all read</a>}
          </div>
          {items.length === 0 ? (
            <div className="bell-item"><span className="m">Nothing yet.</span></div>
          ) : (
            items.map((n) => (
              <div
                key={n._id}
                className={`bell-item ${n.read ? '' : 'unread'}`}
                onClick={() => !n.read && markOne(n._id)}
                style={{ cursor: n.read ? 'default' : 'pointer' }}
              >
                <div className="t">{n.title}</div>
                <div className="m">{n.message}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
