import { AppLayout } from "@/components/AppLayout";
import { AgentWorkspace } from "@/components/agent/AgentWorkspace";

export default function AgentOperations() {
  return (
    <AppLayout title="Operations Agent" contentVariant="conversation">
      <AgentWorkspace />
    </AppLayout>
  );
}
