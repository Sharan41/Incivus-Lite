import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));

// **PRODUCTION MODE**: StrictMode removed to prevent duplicate API calls
// StrictMode causes intentional double-mounting in development, which triggers
// duplicate API calls even with caching/deduplication. Removing it provides
// production-like behavior and eliminates unnecessary duplicate requests.
root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
); 