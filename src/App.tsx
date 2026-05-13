import { BrowserRouter, Routes, Route } from "react-router-dom";
import PublicStatus from "./pages/PublicStatus";
import SuperAdminLogin from "./pages/SuperAdminLogin";
import SuperAdminWorkspace from "./pages/SuperAdminWorkspace";
import TenantOnboarding from "./pages/TenantOnboarding";
import SuperAdminDebug from "./pages/SuperAdminDebug";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import { SuperAdminProvider } from "./contexts/SuperAdminContext";

const App = () => (
  <SuperAdminProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/super-admin/login" element={<SuperAdminLogin />} />
        <Route path="/super-admin/workspace" element={<SuperAdminWorkspace />} />
        <Route path="/super-admin/dashboard" element={<SuperAdminDashboard />} />
        <Route path="/super-admin/debug" element={<SuperAdminDebug />} />
        <Route path="/tenant-onboarding" element={<TenantOnboarding />} />
        <Route path="*" element={<PublicStatus />} />
      </Routes>
    </BrowserRouter>
  </SuperAdminProvider>
);

export default App;
