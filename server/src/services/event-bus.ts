import { EventEmitter } from "node:events";

export type RunEvent = {
  runId: string;
  step: string;
  message: string;
  actor?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
};

class RunEventBus extends EventEmitter {
  emitRunEvent(event: RunEvent) {
    this.emit(`run:${event.runId}`, event);
    this.emit("run:*", event);
  }

  subscribe(runId: string, listener: (event: RunEvent) => void) {
    const key = `run:${runId}`;
    this.on(key, listener);
    return () => this.off(key, listener);
  }
}

export const runEventBus = new RunEventBus();
