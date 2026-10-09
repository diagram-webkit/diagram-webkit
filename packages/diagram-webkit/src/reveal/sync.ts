import type { CameraView } from "../core/state";
import type { DiagramInstance } from "../types";

// The speaker view leads, the presentation follows. When the reader zooms or
// pans in the speaker view's preview of the current slide, it sends where it
// looks (centre and visible height, camerainput) over a BroadcastChannel; the
// presentation sets exactly that view. Each message is the whole view, so a
// lost or late one is corrected by the next and nothing drifts. Only the
// height is matched: the windows have different shapes, so the wider one
// shows more on the sides. The upcoming-slide preview neither sends nor
// follows; any window that is not a speaker view follows.
export const CAMERA_SYNC_CHANNEL = "diagram-webkit-reveal-camera";
// reveal.js's notes plugin puts the current-slide preview in this element.
export const SPEAKER_CURRENT_SLIDE_ID = "current-slide";

export type CameraSyncRole = "lead" | "follow" | "none";

interface CameraMessage {
  step: string;
  view: CameraView;
}

export interface CameraSyncOptions {
  win: Window & typeof globalThis;
  // Separates decks on one origin.
  scope: string;
  // Speaker view window (reveal's ?receiver), or the presentation.
  speakerView: boolean;
  instances: DiagramInstance[];
  // The instance on screen, or null while no diagram slide is shown.
  current(): DiagramInstance | null;
  // The slide and fragment on screen, e.g. "3.0.1".
  step(): string;
}

export function cameraSyncRole(win: Window, speakerView: boolean): CameraSyncRole {
  if (!speakerView) return "follow";
  const frame = win.frameElement;
  return frame && frame.closest(`#${SPEAKER_CURRENT_SLIDE_ID}`) ? "lead" : "none";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCameraMessage(data: unknown): data is CameraMessage {
  if (!data || typeof data !== "object") return false;
  const { step, view } = data as Record<string, unknown>;
  if (typeof step !== "string" || !view || typeof view !== "object") return false;
  const { cx, cy, h } = view as Record<string, unknown>;
  return isFiniteNumber(cx) && isFiniteNumber(cy) && isFiniteNumber(h) && h > 0;
}

export function createCameraSync(options: CameraSyncOptions): () => void {
  const { win } = options;
  const role = cameraSyncRole(win, options.speakerView);
  if (role === "none") return () => {};
  if (typeof win.BroadcastChannel !== "function") {
    throw new Error("diagram-webkit reveal: syncCamera needs BroadcastChannel, which this browser does not have");
  }
  const channel = new win.BroadcastChannel(`${CAMERA_SYNC_CHANNEL}:${options.scope}`);

  if (role === "lead") {
    const offs = options.instances.map((instance) =>
      instance.on("camerainput", () => {
        if (instance !== options.current()) return;
        const view = instance.camera.getView();
        if (view) channel.postMessage({ step: options.step(), view } satisfies CameraMessage);
      }),
    );
    return () => {
      offs.forEach((off) => off());
      channel.close();
    };
  }

  channel.onmessage = (event: MessageEvent) => {
    if (!isCameraMessage(event.data)) return;
    const instance = options.current();
    if (!instance || event.data.step !== options.step()) return;
    instance.camera.setView(event.data.view);
  };
  return () => channel.close();
}
