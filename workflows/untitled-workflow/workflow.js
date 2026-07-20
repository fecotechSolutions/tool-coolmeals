import { START, Workflow } from '@kapso/workflows';

/** Desactivado: reemplazado por coolmeals-leads. No borrar remoto aún. */
const workflow = new Workflow("untitled-workflow", {
  name: "Untitled workflow (disabled)",
  status: "archived",
});

workflow.addNode(START, {
  position: { x: 100, y: 100 },
});

workflow.addTrigger({
  active: false,
  type: "inbound_message",
  phoneNumberId: "597907523413541",
});

export default workflow;
