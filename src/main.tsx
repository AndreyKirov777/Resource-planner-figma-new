import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.tsx";
import ClientView from "./components/ClientView.tsx";
import { api, Me } from "./services/api";
import "./index.css";

function AuthGate() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMe()
      .then(setMe)
      .catch((err) => {
        // A 401 already redirected the browser to /auth/login (see apiFetch);
        // anything else here is a real, unexpected failure.
        setError(err instanceof Error ? err.message : 'Failed to load session');
      });
  }, []);

  if (error) {
    return <div style={{ padding: '2rem' }}>Error: {error}</div>;
  }
  if (!me) {
    return <div style={{ padding: '2rem' }}>Loading…</div>;
  }
  return <App me={me} />;
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/client/:projectId" element={<ClientView />} />
      <Route path="*" element={<AuthGate />} />
    </Routes>
  </BrowserRouter>
);
