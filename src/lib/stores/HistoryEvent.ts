import type { EventType } from "./EventType";

export type HistoryEvent = {
  step: number;
  type: EventType;
  payload: Record<string, unknown>;
};

