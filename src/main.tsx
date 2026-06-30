import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.tsx";
import ClientView from "./components/ClientView.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/client/:projectId" element={<ClientView />} />
      <Route path="*" element={<App />} />
    </Routes>
  </BrowserRouter>
);
