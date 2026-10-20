import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import './index.css';
import { Home } from './Home';
import { HostPage } from './host/HostPage';

// Routes are added by their owning tasks: /host/:pin (T2), /join + /play (T3), /editor (T6).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/host/:pin" element={<HostPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
