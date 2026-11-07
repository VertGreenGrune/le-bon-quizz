import './lib/sentry';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import './index.css';
import { Home } from './Home';
import { AuthLayout, RequireAuth } from './auth/AuthContext';
import { AuthPage } from './auth/AuthPage';
import { AccountPage } from './auth/AccountPage';
import { ForgotPasswordPage } from './auth/ForgotPasswordPage';
import { ResetPasswordPage } from './auth/ResetPasswordPage';
import { QuizEditorPage } from './editor/QuizEditorPage';
import { QuizListPage } from './editor/QuizListPage';
import { HostPage } from './host/HostPage';
import { LibraryPage } from './library/LibraryPage';
import { GameListPage } from './reports/GameListPage';
import { GameReportPage } from './reports/GameReportPage';
import { JoinPage } from './player/JoinPage';
import { PlayPage } from './player/PlayPage';
import { RemotePage } from './remote/RemotePage';
import { TvPage } from './tv/TvPage';

// Routes are added by their owning tasks: /host/:pin (T2), /join + /play (T3), /editor (T6), /reports (T12), /library (T16), /remote/:pin (T39).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/host/:pin" element={<HostPage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/play" element={<PlayPage />} />
        <Route path="/remote/:pin" element={<RemotePage />} />
        <Route path="/tv" element={<TvPage />} />
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/account"
            element={
              <RequireAuth>
                <AccountPage />
              </RequireAuth>
            }
          />
          <Route
            path="/editor"
            element={
              <RequireAuth>
                <QuizListPage />
              </RequireAuth>
            }
          />
          <Route
            path="/editor/:quizId"
            element={
              <RequireAuth>
                <QuizEditorPage />
              </RequireAuth>
            }
          />
          <Route
            path="/library"
            element={
              <RequireAuth>
                <LibraryPage />
              </RequireAuth>
            }
          />
          <Route
            path="/reports"
            element={
              <RequireAuth>
                <GameListPage />
              </RequireAuth>
            }
          />
          <Route
            path="/reports/:gameId"
            element={
              <RequireAuth>
                <GameReportPage />
              </RequireAuth>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
