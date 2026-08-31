import { createRoot } from 'react-dom/client';
import { setBaseUrl, setAuthTokenGetter } from '@workspace/api-client-react';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

// Automatically connect to your live Render backend URL
const backendUrl = import.meta.env.VITE_API_URL || 'https://vocalis-ti2p.onrender.com';

if (backendUrl && (!import.meta.env.DEV || !backendUrl.includes('localhost'))) {
  setBaseUrl(backendUrl);
}

// Ensure authorization token is automatically attached to all API requests across domains
setAuthTokenGetter(() => {
  return localStorage.getItem('vocalis_token');
});

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
