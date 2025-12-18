import type { EventType } from './EventType';

export type EditResult = {
  applied: boolean;
  warning?: string;
};

export type HistoryEvent = {
  step: number;
  type: EventType;
  payload: Record<string, unknown>;
};

