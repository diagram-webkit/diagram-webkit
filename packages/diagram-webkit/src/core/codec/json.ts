import { canonicalView, normalizeState, stableStringify, type DiagramState } from "../state";

export function stateToJson(state: DiagramState): string {
  return stableStringify({ version: 1, view: canonicalView(state.view), ui: state.ui });
}

export function stateFromJson(json: string): DiagramState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`Invalid state JSON: ${(error as Error).message}`);
  }
  return normalizeState(parsed);
}
