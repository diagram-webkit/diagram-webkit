// Hover states and tooltips of user annotations.

/** @param {import("../context").Context & Record<string, any>} ctx */
export function createAnnotationHover(ctx) {
  const s = ctx.s;
  const hideDelay = () => ctx.config.ui.tooltipHideDelay;
  const tooltipService = () => ctx.services.tooltip;

  function bindTooltipHide(tooltip, getTimeout, setTimeoutId, signal) {
    tooltip.addEventListener("mouseenter", () => ctx.timers.clearTimeout(getTimeout()), { signal });
    tooltip.addEventListener(
      "mouseleave",
      () => setTimeoutId(ctx.timers.setTimeout(() => (tooltip.style.display = "none"), hideDelay())),
      { signal },
    );
  }

  function addPointAnnotationHoverEvents(wrapperEl, tooltip, ann, signal) {
    let hideTimeout = 0;
    wrapperEl.addEventListener(
      "mouseenter",
      () => {
        if (s.editModeEnabled) return;
        ctx.timers.clearTimeout(hideTimeout);
        tooltipService().showForUserAnnotation(tooltip, ann);
      },
      { signal },
    );
    wrapperEl.addEventListener(
      "mouseleave",
      () => {
        hideTimeout = ctx.timers.setTimeout(() => (tooltip.style.display = "none"), hideDelay());
      },
      { signal },
    );
    wrapperEl.addEventListener(
      "touchstart",
      (event) => {
        if (s.editModeEnabled) return;
        if (event.cancelable) event.preventDefault();
        ctx.timers.clearTimeout(hideTimeout);
        tooltipService().showForUserAnnotation(tooltip, ann);
      },
      { passive: false, signal },
    );
    ctx.root.addEventListener(
      "touchstart",
      (event) => {
        if (!wrapperEl.contains(event.target) && !tooltip.contains(event.target)) {
          tooltip.style.display = "none";
          ctx.timers.clearTimeout(hideTimeout);
        }
      },
      { signal },
    );
    bindTooltipHide(tooltip, () => hideTimeout, (id) => (hideTimeout = id), signal);
  }

  function addAreaAnnotationHoverEvents(areaElement, tooltip, ann, signal) {
    let hideTimeout = 0;
    const borderWidth = Number.parseInt(ctx.win.getComputedStyle(areaElement).borderWidth, 10) || 3;
    const tolerance = ctx.config.annotations.area.minHoverDistance;
    const hitboxSize = Math.max(4, borderWidth + tolerance);

    const createBorderHitbox = (edge) => {
      const hitbox = ctx.doc.createElement("div");
      hitbox.className = `area-border-hitbox area-border-hitbox-${edge}`;
      Object.assign(hitbox.style, { position: "absolute", zIndex: "1", background: "transparent", pointerEvents: "auto" });
      const size = `${hitboxSize}px`;
      if (edge === "top") Object.assign(hitbox.style, { left: "0", top: "0", width: "100%", height: size });
      else if (edge === "right") Object.assign(hitbox.style, { right: "0", top: "0", width: size, height: "100%" });
      else if (edge === "bottom") Object.assign(hitbox.style, { left: "0", bottom: "0", width: "100%", height: size });
      else Object.assign(hitbox.style, { left: "0", top: "0", width: size, height: "100%" });

      const show = (event) => {
        if (s.editModeEnabled) return;
        ctx.timers.clearTimeout(hideTimeout);
        tooltipService().showAtPointer(tooltip, ann, event);
      };
      hitbox.addEventListener("mouseenter", show, { signal });
      hitbox.addEventListener("mousemove", show, { signal });
      hitbox.addEventListener(
        "mouseleave",
        () => {
          hideTimeout = ctx.timers.setTimeout(() => (tooltip.style.display = "none"), hideDelay());
        },
        { signal },
      );
      hitbox.addEventListener(
        "touchstart",
        (event) => {
          if (s.editModeEnabled) return;
          if (event.cancelable) event.preventDefault();
          ctx.timers.clearTimeout(hideTimeout);
          tooltipService().showAtPointer(tooltip, ann, event.touches && event.touches[0] ? event.touches[0] : event);
        },
        { passive: false, signal },
      );
      return hitbox;
    };

    ["top", "right", "bottom", "left"].forEach((edge) => areaElement.appendChild(createBorderHitbox(edge)));
    bindTooltipHide(tooltip, () => hideTimeout, (id) => (hideTimeout = id), signal);
  }

  function addArrowHoverEvents(ann, tooltip, signal) {
    const parts = ann._arrow;
    if (!parts) return;
    let hideTimeout = 0;
    const show = (event) => {
      if (s.editModeEnabled) return;
      ctx.timers.clearTimeout(hideTimeout);
      tooltipService().showAtPointer(tooltip, ann, event.touches && event.touches[0] ? event.touches[0] : event);
    };
    const hide = () => {
      hideTimeout = ctx.timers.setTimeout(() => (tooltip.style.display = "none"), hideDelay());
    };
    parts.hit.addEventListener("mouseenter", show, { signal });
    parts.hit.addEventListener("mousemove", show, { signal });
    parts.hit.addEventListener("mouseleave", hide, { signal });
    parts.hit.addEventListener(
      "touchstart",
      (event) => {
        if (s.editModeEnabled) return;
        if (event.cancelable) event.preventDefault();
        show(event);
      },
      { passive: false, signal },
    );
    bindTooltipHide(tooltip, () => hideTimeout, (id) => (hideTimeout = id), signal);
  }

  return { addPointAnnotationHoverEvents, addAreaAnnotationHoverEvents, addArrowHoverEvents };
}
