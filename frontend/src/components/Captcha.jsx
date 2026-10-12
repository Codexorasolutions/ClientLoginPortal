import { useEffect, useRef, useState } from 'react';

let scriptLoadingPromise = null;

const loadRecaptchaScript = () => {
  if (window.grecaptcha && window.grecaptcha.render) return Promise.resolve();
  if (scriptLoadingPromise) return scriptLoadingPromise;

  scriptLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('script-blocked'));
    document.body.appendChild(script);
  });
  return scriptLoadingPromise;
};

// real Google reCAPTCHA v2 checkbox widget. Drop it anywhere and read the
// token via onChange — pass that token as `captchaToken` in the API call.
// Fails LOUDLY (visible message) instead of rendering nothing, and logs the
// specific reason to the console, so a missing site key, a domain that
// isn't authorized, or a blocked script are each easy to tell apart.
export default function Captcha({ onChange }) {
  const containerRef = useRef(null);
  const widgetId = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [reason, setReason] = useState(''); // 'no-key' | 'script-blocked' | 'timeout' | 'render-error'

  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

  useEffect(() => {
    if (!siteKey) {
      console.error('[Captcha] VITE_RECAPTCHA_SITE_KEY is not set. Copy frontend/.env.example to .env and restart `npm run dev`.');
      setStatus('error');
      setReason('no-key');
      return;
    }

    let mounted = true;
    let attempts = 0;

    loadRecaptchaScript()
      .then(() => {
        const tryRender = () => {
          if (!mounted) return;
          attempts += 1;

          if (window.grecaptcha && window.grecaptcha.render && containerRef.current && widgetId.current === null) {
            try {
              // guard against React StrictMode's double-invoked effects (or
              // Vite HMR) leaving a stale widget in this div from a previous
              // mount — grecaptcha.render() throws if the target isn't empty
              if (containerRef.current.firstChild) {
                containerRef.current.innerHTML = '';
              }
              widgetId.current = window.grecaptcha.render(containerRef.current, {
                sitekey: siteKey,
                callback: (token) => onChange(token),
                'expired-callback': () => onChange(''),
              });
              setStatus('ready');
            } catch (err) {
              console.error('[Captcha] grecaptcha.render() threw — this usually means the site key is malformed, or this domain is not authorized for it in the reCAPTCHA admin console:', err);
              setStatus('error');
              setReason('render-error');
            }
          } else if (!window.grecaptcha || !window.grecaptcha.render) {
            if (attempts > 25) {
              console.error('[Captcha] grecaptcha never became available after ~5s. Most likely google.com/recaptcha is blocked on this network, or an ad-blocker/extension is stripping the script.');
              setStatus('error');
              setReason('timeout');
              return;
            }
            setTimeout(tryRender, 200);
          }
        };
        tryRender();
      })
      .catch((err) => {
        console.error('[Captcha] the reCAPTCHA script itself failed to load:', err);
        setStatus('error');
        setReason('script-blocked');
      });

    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'error') {
    const messages = {
      'no-key': 'CAPTCHA is not configured: VITE_RECAPTCHA_SITE_KEY is missing from the frontend .env file. Copy .env.example to .env and restart the dev server.',
      'script-blocked': "Google's reCAPTCHA script couldn't load — check your internet connection, or whether google.com is blocked on this network/by an extension.",
      'timeout': "CAPTCHA never initialized. If you're using a real (non-test) site key, make sure the domain you're viewing this on — " + window.location.hostname + " — is added under that key's authorized domains in the reCAPTCHA admin console (add \"localhost\" there for local testing).",
      'render-error': 'CAPTCHA failed to render. This usually means the site key is malformed, or ' + window.location.hostname + ' is not an authorized domain for this key — check the reCAPTCHA admin console.',
    };

    return (
      <div
        style={{
          marginTop: 20,
          padding: '10px 12px',
          border: '1px solid var(--rust)',
          borderRadius: 8,
          background: '#FBE4D3',
          color: 'var(--rust)',
          fontSize: 12.5,
        }}
      >
        {messages[reason] || messages['timeout']}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 20 }}>
      {status === 'loading' && (
        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 6 }}>Loading CAPTCHA…</div>
      )}
      {/* this div must stay completely empty — grecaptcha.render() throws
          "placeholder element must be empty" if it has any content in it,
          which is why the loading text above lives outside it instead */}
      <div ref={containerRef}></div>
    </div>
  );
}
