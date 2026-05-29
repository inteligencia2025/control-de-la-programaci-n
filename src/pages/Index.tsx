import { useState, Component, ErrorInfo, ReactNode } from 'react';
import { BarChart3, CalendarRange, ClipboardCheck, GanttChart as GanttIcon, LayoutDashboard } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProjectProvider, useProject } from '@/context/ProjectContext';
import { ProjectToolbar } from '@/components/ProjectToolbar';
import { LOBPanel } from '@/components/LOBPanel';
import { LOBChart } from '@/components/LOBChart';
import { LookaheadTable } from '@/components/LookaheadTable';
import { ProductionControl } from '@/components/ProductionControl';
import { GanttChart } from '@/components/GanttChart';
import { AdminDashboard } from '@/components/AdminDashboard';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Navigate } from 'react-router-dom';

class ChartErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('Chart recovered from render error:', error.message);
    setTimeout(() => this.setState({ hasError: false }), 50);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function LOBChartWrapper() {
  const { project } = useProject();
  return (
    <ChartErrorBoundary key={project.activities.length}>
      <LOBChart />
    </ChartErrorBoundary>
  );
}

const baseTabs = [
  { id: 'lob', label: 'Líneas de Balance', icon: BarChart3 },
  { id: 'lookahead', label: 'Lookahead', icon: CalendarRange },
  { id: 'pac', label: 'Control PAC', icon: ClipboardCheck },
  { id: 'gantt', label: 'Gantt', icon: GanttIcon },
];

const Index = () => {
  const { user, loading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const tabs = isAdmin
    ? [...baseTabs, { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }]
    : baseTabs;

  return (
    <ProjectProvider>
      <div className="flex flex-col h-screen bg-background">
        <ProjectToolbar />

        <Tabs defaultValue="lob" className="flex-1 flex flex-col min-h-0">
          <div className="border-b border-border bg-card px-4">
            <TabsList className="bg-transparent h-10 gap-1">
              {tabs.map(t => (
                <TabsTrigger
                  key={t.id}
                  value={t.id}
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5 text-xs px-4 rounded-md"
                >
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 relative min-h-0">
            <TabsContent value="lob" className="absolute inset-0 flex overflow-hidden mt-0 data-[state=inactive]:hidden">
              <LOBPanel />
              <LOBChartWrapper />
            </TabsContent>

            <TabsContent value="lookahead" className="absolute inset-0 flex flex-col overflow-hidden mt-0 data-[state=inactive]:hidden">
              <LookaheadTable />
            </TabsContent>

            <TabsContent value="pac" className="absolute inset-0 flex flex-col overflow-hidden mt-0 data-[state=inactive]:hidden">
              <ProductionControl />
            </TabsContent>

            <TabsContent value="gantt" className="absolute inset-0 flex flex-col overflow-hidden mt-0 data-[state=inactive]:hidden">
              <GanttChart />
            </TabsContent>

            {isAdmin && (
              <TabsContent value="dashboard" className="absolute inset-0 flex flex-col overflow-auto mt-0 data-[state=inactive]:hidden">
                <AdminDashboard />
              </TabsContent>
            )}
          </div>
        </Tabs>
      </div>
    </ProjectProvider>
  );
};

export default Index;

