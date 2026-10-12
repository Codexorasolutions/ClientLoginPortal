import { Navigate } from 'react-router-dom';

// blocks a route unless there's a saved JWT, and optionally a matching role
export default function PrivateRoute({ children, role }) {
  const token = localStorage.getItem('cx_token');
  if (!token) return <Navigate to="/login" replace />;

  if (role) {
    try {
      const user = JSON.parse(localStorage.getItem('cx_user') || '{}');
      if (user.role !== role) return <Navigate to="/login" replace />;
    } catch {
      return <Navigate to="/login" replace />;
    }
  }

  return children;
}
