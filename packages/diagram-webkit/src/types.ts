import type { Rect } from "./core/codec/camera";
import type { DiagramDefinition } from "./core/definition";
import type { FeaturesSpec } from "./core/presets";
import type { DiagramState, DiagramView, ElementQuery } from "./core/state";

export interface MountOptions {
  features?: FeaturesSpec;
  initialState?: Partial<DiagramState>;
  ownerDocument?: Document;
  source?: { url: string } | { svgText: string } | { svg: SVGSVGElement };
  debug?: boolean;
  // ms for cell show/hide, dim and highlight changes. Default: 120 ms show/hide, instant dim/highlight.
  fade?: number;
}

export interface SetStateOptions {
  transition?: number | false;
  replace?: boolean;
}

export interface TagInfo {
  tag: string;
  parent: string | null;
  label: string;
  group: string;
  description: string;
  count: number;
  hidden: boolean;
}

export interface DiagramEvents {
  ready: undefined;
  error: Error;
  statechange: DiagramState;
  camerachange: Rect | null;
  elementactivate: { element: Element; slug: string; id: string | null };
}

export interface DiagramInstance {
  readonly root: HTMLElement;
  readonly definition: DiagramDefinition;
  readonly ready: Promise<void>;
  getState(): DiagramState;
  setState(patch: { view?: Partial<Record<keyof DiagramView, unknown>>; ui?: DiagramState["ui"] }, options?: SetStateOptions): Promise<void>;
  camera: {
    fit(options?: SetStateOptions): Promise<void>;
    showRect(rect: Rect, options?: SetStateOptions): Promise<void>;
    focus(target: ElementQuery, options?: SetStateOptions & { padding?: number }): Promise<void>;
    zoomBy(factor: number, at?: { x: number; y: number }): boolean;
    get(): Rect | null;
  };
  query(query: ElementQuery): Element[];
  tags(): TagInfo[];
  levels(): { max: number };
  setInput(input: { wheel?: boolean; drag?: boolean; pinch?: boolean }): void;
  on<K extends keyof DiagramEvents>(event: K, listener: (payload: DiagramEvents[K]) => void): () => void;
  serialize(format: "url" | "json" | "slide", options?: { base?: DiagramView; title?: string; viewName?: string }): string;
  suspend(): void;
  resume(): void;
  resize(): void;
  destroy(): void;
}
