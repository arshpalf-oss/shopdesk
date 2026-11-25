import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <>
      <div className="aurora-field" aria-hidden="true">
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="blob b3" />
      </div>
      <div className="grid-overlay" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <App />
    </>
  </React.StrictMode>
);
