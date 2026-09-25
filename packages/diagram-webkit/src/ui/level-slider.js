// The detail-level slider.
import { formatText } from "../core/texts";

export function getLevelLabel(texts, level, maxLevel) {
  const normalizedLevel = Math.max(0, Number.parseInt(level, 10) || 0);
  const normalizedMax = Math.max(0, Number.parseInt(maxLevel, 10) || 0);
  return normalizedLevel >= normalizedMax ? texts.levelMax : `${normalizedLevel}`;
}

export function createLevelSlider(ctx, signal) {
  const s = ctx.s;
  const texts = ctx.texts;
  const max = s.maxDiagramLevel;
  const wrap = ctx.doc.createElement("div");
  wrap.className = "level-filter-control";
  const header = ctx.doc.createElement("div");
  header.className = "level-filter-header";
  const title = ctx.doc.createElement("div");
  title.className = "tag-group-title";
  title.textContent = texts.levelTitle;
  const value = ctx.doc.createElement("strong");
  value.className = "level-filter-value";
  const input = ctx.doc.createElement("input");
  input.type = "range";
  input.className = "level-filter-slider";
  input.min = "0";
  input.max = `${max}`;
  input.step = "1";

  function render() {
    const level = Math.max(0, Math.min(max, s.selectedLevel));
    input.value = `${level}`;
    value.textContent = formatText(texts.levelValue, { level: getLevelLabel(texts, level, max) });
  }

  const handleLevelChange = () => {
    const next = Math.max(0, Math.min(max, Number.parseInt(input.value, 10) || 0));
    value.textContent = formatText(texts.levelValue, { level: getLevelLabel(texts, next, max) });
    s.selectedLevel = next;
    ctx.services.filter.applyAnnotationFilter();
    ctx.services.urlSync.updateURLState();
  };
  input.addEventListener("input", handleLevelChange, { signal });
  input.addEventListener("change", handleLevelChange, { signal });

  header.append(title, value);
  wrap.append(header, input);
  render();
  return { element: wrap, render };
}
