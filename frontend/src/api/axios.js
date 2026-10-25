import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// attach the saved JWT (if any) to every request automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cx_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// If the server says the account was suspended / terminated, or the session was ended (signed out everywhere,
// password changed elsewhere), clear the login and go to the sign-in page with the reason.
// The login/signup calls themselves are skipped so their own error messages are shown normally.
const FORCED_LOGOUT = ['account_suspended', 'account_terminated', 'session_revoked', 'token_invalid'];
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const code = error.response?.data?.code;
    const url = error.config?.url || '';
    if (FORCED_LOGOUT.includes(code) && !/\/auth\//.test(url) && localStorage.getItem('cx_token')) {
      localStorage.removeItem('cx_token');
      localStorage.removeItem('cx_user');
      sessionStorage.setItem('cx_logout_reason', error.response.data.message || 'You were signed out. Please sign in again.');
      window.location.assign('/login');
    }
    return Promise.reject(error);
  }
);

export default api;
