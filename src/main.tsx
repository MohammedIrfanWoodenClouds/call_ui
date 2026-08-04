import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import WcAi from "./pages/WcAi.tsx";
import AdminLogin from "./pages/AdminLogin.tsx";
import RequireAuth from "./layout/RequireAuth.tsx";
import AdminShell from "./layout/AdminShell.tsx";
import DashboardPage from "./pages/DashboardPage.tsx";
import AdminBotPage from "./pages/AdminBotPage.tsx";
import RequirementsPage from "./pages/RequirementsPage.tsx";
import ResponsesPage from "./pages/ResponsesPage.tsx";
import CallDashboard from "./pages/CallDashboard.tsx";
import LogsPage from "./pages/LogsPage.tsx";
import SettingsPage from "./pages/SettingsPage.tsx";
import ContactsPage from "./pages/ContactsPage.tsx";
import ImportWizardPage from "./pages/ImportWizardPage.tsx";
import CampaignsPage from "./pages/CampaignsPage.tsx";
import LiveCallsPage from "./pages/LiveCallsPage.tsx";
import CallTimelinePage from "./pages/CallTimelinePage.tsx";
import ConversationViewerPage from "./pages/ConversationViewerPage.tsx";
import RecordingViewerPage from "./pages/RecordingViewerPage.tsx";
import AgentsPage from "./pages/AgentsPage.tsx";
import KnowledgeBasePage from "./pages/KnowledgeBasePage.tsx";
import AnalyticsPage from "./pages/AnalyticsPage.tsx";
import ReportsPage from "./pages/ReportsPage.tsx";
import NotificationsPage from "./pages/NotificationsPage.tsx";
import UsersPage from "./pages/UsersPage.tsx";
import { ThemeProvider } from "./theme/ThemeProvider.tsx";
import "./index.css";
import "./enterprise.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<WcAi />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<RequireAuth />}>
            <Route element={<AdminShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="bot" element={<AdminBotPage />} />
              <Route path="contacts" element={<ContactsPage />} />
              <Route path="import" element={<ImportWizardPage />} />
              <Route path="requirements" element={<RequirementsPage />} />
              <Route path="responses" element={<ResponsesPage />} />
              <Route path="campaigns" element={<CampaignsPage />} />
              <Route path="live" element={<LiveCallsPage />} />
              <Route path="calls" element={<CallDashboard />} />
              <Route path="timeline" element={<CallTimelinePage />} />
              <Route path="conversations" element={<ConversationViewerPage />} />
              <Route path="recordings" element={<RecordingViewerPage />} />
              <Route path="agents" element={<AgentsPage />} />
              <Route path="knowledge" element={<KnowledgeBasePage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="logs" element={<LogsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </ThemeProvider>
  </React.StrictMode>
);
