import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import LoginPage from "./pages/login";
import ProjectsPage from "./pages/projects";
import ProjectDetailRouter from "./pages/project-detail-v2";
import LanderEditorRouter from "./pages/lander-editor-router";
import BrandsProductsPage from "./pages/brands-products";
import ImageBankPage from "./pages/image-bank";
import SettingsPage from "./pages/settings";
import TemplatesPage from "./pages/templates";
import MagazinesPage from "./pages/magazines";
import { AppShell } from "./components/AppShell";

function Gate() {
  const { email, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (!email) return <LoginPage />;
  return (
    <AppShell>
      <Switch>
        <Route path="/projects/:id/landers/:landerId" component={LanderEditorRouter} />
        <Route path="/projects/:id" component={ProjectDetailRouter} />
        <Route path="/projects" component={ProjectsPage} />
        <Route path="/brands" component={BrandsProductsPage} />
        <Route path="/templates" component={TemplatesPage} />
        <Route path="/magazines" component={MagazinesPage} />
        <Route path="/image-bank" component={ImageBankPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/" component={ProjectsPage} />
        <Route component={ProjectsPage} />
      </Switch>
    </AppShell>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router hook={useHashLocation}>
          <Gate />
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}
