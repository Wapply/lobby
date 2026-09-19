export type AppStatus = "off" | "starting" | "running" | "error";

export interface AppDefinition {
  /** Unique id, used as the route namespace. */
  id: string;
  name: string;
  description: string;
  icon: string;
  port: number;
  /** Shell command to spawn. Executed in the app's own directory. */
  command: string[];
  /** Path to the app's HTML UI (served on the main lobby page). */
  ui: string;
  favorite?: boolean;
}

export interface AppState {
  id: string;
  status: AppStatus;
  pid?: number;
  port?: number;
  startedAt?: number;
  lastError?: string;
}