// Where user annotations sit on the image. Positions are wrapper-local layout px.
import { getScale } from "../context.js";

function isValidBounds(bounds) {
  return Boolean(
    bounds &&
      [bounds.left, bounds.top, bounds.width, bounds.height].every((value) => typeof value === "number" && !Number.isNaN(value)) &&
      bounds.width > 0 &&
      bounds.height > 0,
  );
}

/** @param {import("../context").Context & Record<string, any>} ctx */
export function createAnnotationPositioning(ctx) {
  const s = ctx.s;
  const wrapper = ctx.els.wrapper;
  let frameId = 0;

  // The displayed image in wrapper-local px.
  function getImageFrameInWrapper() {
    const scale = getScale(wrapper);
    const wrapperBounds = wrapper.getBoundingClientRect();
    const imageBounds = ctx.services.geometry.getImageBounds(true);
    let left = (imageBounds.left - wrapperBounds.left) / scale;
    let top = (imageBounds.top - wrapperBounds.top) / scale;
    let width = imageBounds.width;
    let height = imageBounds.height;
    const imageRect = ctx.els.image.getBoundingClientRect();
    if (imageRect && imageRect.width > 0 && imageRect.height > 0) {
      left = (imageRect.left - wrapperBounds.left) / scale;
      top = (imageRect.top - wrapperBounds.top) / scale;
      width = imageRect.width / scale;
      height = imageRect.height / scale;
    }
    width = Math.max(1, width);
    height = Math.max(1, height);
    return { left, top, width, height, right: left + width, bottom: top + height };
  }

  function positionUserAnnotationMarkers() {
    // A hidden container (a slide off screen, a closed tab panel) has nothing
    // to position against; that is not an error.
    if (!(ctx.root.clientWidth > 0) || !(ctx.root.clientHeight > 0)) return;
    const bounds = ctx.services.geometry.getImageBounds();
    if (!isValidBounds(bounds)) {
      console.warn("Invalid bounds detected, skipping user annotation positioning");
      return;
    }
    const scale = getScale(wrapper);
    const wrapperRect = wrapper.getBoundingClientRect();
    const markerScale = ctx.config.annotations.markerScale;

    s.userAnnotations.forEach((ann) => {
      if (!ann._el) return;
      const style = ctx.annotationStyle(ann.type);
      if (!style) return;
      // An arrow spans the diagram rather than sitting at one point, so it is
      // laid out from the image frame instead of a single anchor.
      if (style.annotationType === "arrow") {
        ctx.services.annotations.updateArrowLayout(ann, getImageFrameInWrapper());
        return;
      }

      const zoom = s.currentZoom;
      const left = (bounds.left - wrapperRect.left) / scale + wrapper.scrollLeft + ann.x * bounds.width * zoom;
      const top = (bounds.top - wrapperRect.top) / scale + wrapper.scrollTop + ann.y * bounds.height * zoom;
      ann._el.style.left = `${left}px`;
      ann._el.style.top = `${top}px`;

      if (style.annotationType === "area") {
        const areaElement = ann._el.querySelector(".area-annotation");
        if (areaElement) {
          areaElement.style.width = `${ann.widthRel * bounds.width * zoom}px`;
          areaElement.style.height = `${ann.heightRel * bounds.height * zoom}px`;
        }
      } else {
        const marker = ann._el.querySelector(".marker");
        if (marker) {
          const userSize = bounds.width * markerScale * (style.scale || 2.0) * zoom;
          marker.style.width = `${userSize}px`;
          marker.style.height = `${userSize}px`;
          marker.style.fontSize = `${userSize * 0.4}px`;
        }
      }
    });
  }

  function scheduleMarkerPositioning(immediate = false) {
    if (immediate || s.isTouchActive) {
      ctx.timers.cancelAnimationFrame(frameId);
      frameId = 0;
      positionUserAnnotationMarkers();
      return;
    }
    if (frameId) return;
    frameId = ctx.timers.requestAnimationFrame(() => {
      frameId = 0;
      positionUserAnnotationMarkers();
    });
  }

  return { getImageFrameInWrapper, positionUserAnnotationMarkers, scheduleMarkerPositioning };
}
