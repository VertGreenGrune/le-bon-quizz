import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import './index.css';
import { Home } from './Home';
import { JoinPage } from './player/JoinPage';
import { PlayPage } from './player/PlayPage';

// Routes are added by their owning tasks: /host/:pin (T2), /join + /play (T3), /editor (T6).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/play" element={<PlayPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
