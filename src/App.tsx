import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import PublicStatus from "./pages/PublicStatus";
import SuperAdminLogin from "./pages/SuperAdminLogin";
import SuperAdminWorkspace from "./pages/SuperAdminWorkspace";
import TenantOnboarding from "./pages/TenantOnboarding";
import SuperAdminDebug from "./pages/SuperAdminDebug";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import HybridSettings from "./pages/HybridSettings";
import { SuperAdminProvider } from "./contexts/SuperAdminContext";
import { AppShell } from "./components/layout/AppShell";
import ChatScreen from "./pages/admin/ChatScreen";
import Chats from "./pages/admin/Chats";
import Projects from "./pages/admin/Projects";
import Users from "./pages/admin/Users";
import System from "./pages/admin/System";

const App = () => (
  <SuperAdminProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/super-admin/login" element={<SuperAdminLogin />} />
        <Route path="/super-admin/workspace" element={<SuperAdminWorkspace />} />
        <Route path="/super-admin/dashboard" element={<SuperAdminDashboard />} />
        <Route path="/super-admin/debug" element={<SuperAdminDebug />} />
        <Route path="/super-admin/hybrid" element={<HybridSettings />} />

        {/* New mobile-first shell */}
        <Route path="/super-admin/app" element={<AppShell />}>
          <Route index element={<Navigate to="chats" replace />} />
          <Route path="chats" element={<ChatScreen />} />
          <Route path="conversations" element={<Chats />} />
          <Route path="projects" element={<Projects />} />
          <Route path="users" element={<Users />} />
          <Route path="system" element={<System />} />
        </Route>

        <Route path="/tenant-onboarding" element={<TenantOnboarding />} />
        <Route path="*" element={<PublicStatus />} />
      </Routes>
    </BrowserRouter>
  </SuperAdminProvider>
);

export default App;
