import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { applyVariant } from './variant';
import { applyTimeTheme } from './theme';
import { getLanguage } from './i18n';
import './index.scss';

applyVariant();
applyTimeTheme();
document.documentElement.setAttribute('lang', getLanguage());

// The app used HashRouter, so every link shared before the move to
// BrowserRouter looks like https://…/#/borsch/<id>. Rewrite those to a real
// path before React Router reads the location, so old links keep resolving.
if (window.location.hash.startsWith('#/')) {
  const target = window.location.hash.slice(1);
  window.history.replaceState(null, '', target + window.location.search);
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={process.env.REACT_APP_API_KEY_AUTH}>
      <App />
    </GoogleOAuthProvider>    
  </React.StrictMode>
);



