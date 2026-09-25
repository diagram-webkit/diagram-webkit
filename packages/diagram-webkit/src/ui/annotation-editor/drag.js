// Drag, resize and arrow-end dragging of user annotations. The
// move/up listeners on the owner document exist only while a drag lasts.
import { childSignal, getScale } from "../../dom/context.js";

function pointerOf(event) {
  return event.touches && event.touches[0] ? event.touches[0] : event;
}

function clampUnit(value) {
  return Math.max(0, Math.min(1, value));
}

export function createAnnotationDrag(ctx) {
  const s = ctx.s;
  const sv = ctx.services;
  const frame = () => sv.annotationPositioning.getImageFrameInWrapper();
  const scale = () => getScale(ctx.els.wrapper);

  // Binds move/end on the owner document until the gesture ends.
  function track(onMove, onEnd) {
    const controller = childSignal(ctx.signal);
    const options = { signal: controller.signal, passive: false };
    const end = (event) => {
      controller.abort();
      onEnd(event);
    };
    ctx.doc.addEventListener("mousemove", onMove, options);
    ctx.doc.addEventListener("touchmove", onMove, options);
    ctx.doc.addEventListener("mouseup", end, options);
    ctx.doc.addEventListener("touchend", end, options);
  }

  function updateUserAnnotationDragState() {
    const editing = s.editModeEnabled;
    if (editing) ctx.root.querySelectorAll(".tooltip-box").forEach((tooltip) => (tooltip.style.display = "none"));
    ctx.els.wrapper.querySelectorAll(".user-annotation-marker").forEach((marker) => {
      marker.style.cursor = editing ? "move" : "pointer";
      marker.style.opacity = editing ? "0.9" : "0.8";
    });
    ctx.els.wrapper.querySelectorAll(".arrow-annotation-handle").forEach((handle) => {
      handle.style.display = editing ? "block" : "none";
      handle.style.pointerEvents = editing ? "auto" : "none";
    });
    ctx.els.wrapper.querySelectorAll(".arrow-annotation-hit").forEach((hit) => {
      hit.style.cursor = editing ? "move" : "pointer";
    });
    ctx.els.wrapper.querySelectorAll(".area-annotation").forEach((area) => {
      area.classList.toggle("edit-mode", editing);
      area.style.cursor = editing ? "move" : "pointer";
      area.style.pointerEvents = editing ? "auto" : "none";
      if (editing && area.querySelectorAll(".resize-handle").length === 0) {
        const index = Number.parseInt(area.getAttribute("data-user-index"), 10);
        if (!Number.isNaN(index) && s.userAnnotations[index]) addAreaResizeHandles(area, s.userAnnotations[index], index, ctx.signal);
      }
      area.querySelectorAll(".resize-handle").forEach((handle) => {
        handle.style.display = editing ? "block" : "none";
      });
    });
  }

  function addUserAnnotationDragListeners(wrapperEl, marker, index, signal) {
    const start = (event) => {
      if (event.target !== marker || !s.editModeEnabled) return;
      const pointer = pointerOf(event);
      const factor = scale();
      const startX = pointer.clientX;
      const startY = pointer.clientY;
      const startLeft = Number.parseInt(wrapperEl.style.left, 10) || 0;
      const startTop = Number.parseInt(wrapperEl.style.top, 10) || 0;
      const rect = wrapperEl.getBoundingClientRect();
      const width = rect.width / factor || Number.parseInt(wrapperEl.style.width, 10) || wrapperEl.offsetWidth;
      const height = rect.height / factor || Number.parseInt(wrapperEl.style.height, 10) || wrapperEl.offsetHeight;
      wrapperEl.style.zIndex = "100";
      marker.style.opacity = "0.7";
      event.preventDefault();

      track(
        (moveEvent) => {
          const current = pointerOf(moveEvent);
          const imageFrame = frame();
          const left = startLeft + (current.clientX - startX) / factor;
          const top = startTop + (current.clientY - startY) / factor;
          wrapperEl.style.left = `${Math.max(imageFrame.left + width / 2, Math.min(left, imageFrame.right - width / 2))}px`;
          wrapperEl.style.top = `${Math.max(imageFrame.top + height / 2, Math.min(top, imageFrame.bottom - height / 2))}px`;
          moveEvent.preventDefault();
        },
        (endEvent) => {
          wrapperEl.style.zIndex = "15";
          marker.style.opacity = "";
          const imageFrame = frame();
          const x = ((Number.parseFloat(wrapperEl.style.left) || 0) - imageFrame.left) / imageFrame.width;
          const y = ((Number.parseFloat(wrapperEl.style.top) || 0) - imageFrame.top) / imageFrame.height;
          if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
            s.userAnnotations[index].x = x;
            s.userAnnotations[index].y = y;
            sv.urlSync.updateURLState();
          }
          sv.overlays.scheduleMarkerPositioning();
          endEvent.preventDefault();
        },
      );
    };
    marker.addEventListener("mousedown", start, { signal });
    marker.addEventListener("touchstart", start, { signal, passive: false });
  }

  function addAreaAnnotationDragListeners(wrapperEl, areaElement, index, signal) {
    const start = (event) => {
      if (!s.editModeEnabled || event.target.classList.contains("resize-handle")) return;
      const pointer = pointerOf(event);
      const factor = scale();
      const startX = pointer.clientX;
      const startY = pointer.clientY;
      const startLeft = Number.parseInt(wrapperEl.style.left, 10) || 0;
      const startTop = Number.parseInt(wrapperEl.style.top, 10) || 0;
      const rect = wrapperEl.getBoundingClientRect();
      const width = Number.parseInt(areaElement.style.width, 10) || rect.width / factor || wrapperEl.offsetWidth;
      const height = Number.parseInt(areaElement.style.height, 10) || rect.height / factor || wrapperEl.offsetHeight;
      wrapperEl.style.zIndex = "100";
      areaElement.style.opacity = "0.7";
      event.preventDefault();

      track(
        (moveEvent) => {
          const current = pointerOf(moveEvent);
          const imageFrame = frame();
          const left = startLeft + (current.clientX - startX) / factor;
          const top = startTop + (current.clientY - startY) / factor;
          wrapperEl.style.left = `${Math.max(imageFrame.left, Math.min(left, imageFrame.right - width))}px`;
          wrapperEl.style.top = `${Math.max(imageFrame.top, Math.min(top, imageFrame.bottom - height))}px`;
          moveEvent.preventDefault();
        },
        (endEvent) => {
          wrapperEl.style.zIndex = "5";
          areaElement.style.opacity = "";
          const imageFrame = frame();
          const x = ((Number.parseFloat(wrapperEl.style.left) || 0) - imageFrame.left) / imageFrame.width;
          const y = ((Number.parseFloat(wrapperEl.style.top) || 0) - imageFrame.top) / imageFrame.height;
          if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
            s.userAnnotations[index].x = x;
            s.userAnnotations[index].y = y;
            sv.urlSync.updateURLState();
          }
          sv.overlays.scheduleMarkerPositioning();
          endEvent.preventDefault();
        },
      );
    };
    areaElement.addEventListener("mousedown", start, { signal });
    areaElement.addEventListener("touchstart", start, { signal, passive: false });
  }

  function addAreaResizeHandles(areaElement, ann, index, signal) {
    const style = ctx.annotationStyle(ann.type);
    ["nw", "ne", "sw", "se"].forEach((position) => {
      const handle = ctx.doc.createElement("div");
      handle.className = `resize-handle ${position}`;
      handle.style.borderColor = style.border;
      addResizeHandleListeners(handle, areaElement, ann, index, position, signal);
      areaElement.appendChild(handle);
    });
  }

  function addResizeHandleListeners(handle, areaElement, ann, index, position, signal) {
    const start = (event) => {
      const pointer = pointerOf(event);
      const factor = scale();
      const startX = pointer.clientX;
      const startY = pointer.clientY;
      const startWidth = Number.parseInt(areaElement.style.width, 10);
      const startHeight = Number.parseInt(areaElement.style.height, 10);
      const wrapperEl = areaElement.parentElement;
      const startLeft = Number.parseInt(wrapperEl.style.left, 10) || 0;
      const startTop = Number.parseInt(wrapperEl.style.top, 10) || 0;
      event.preventDefault();
      event.stopPropagation();

      track(
        (moveEvent) => {
          const current = pointerOf(moveEvent);
          const deltaX = (current.clientX - startX) / factor;
          const deltaY = (current.clientY - startY) / factor;
          const style = ctx.annotationStyle(ann.type);
          let width = startWidth;
          let height = startHeight;
          let left = startLeft;
          let top = startTop;
          if (position.includes("e")) width = startWidth + deltaX;
          if (position.includes("w")) {
            width = startWidth - deltaX;
            left = startLeft + deltaX;
          }
          if (position.includes("s")) height = startHeight + deltaY;
          if (position.includes("n")) {
            height = startHeight - deltaY;
            top = startTop + deltaY;
          }

          const imageFrame = frame();
          let constrainedWidth = Math.max(style.minSize.width, Math.min(Math.min(style.maxSize.width, imageFrame.width * 0.8), width));
          let constrainedHeight = Math.max(style.minSize.height, Math.min(Math.min(style.maxSize.height, imageFrame.height * 0.8), height));
          if (position.includes("e")) constrainedWidth = Math.min(constrainedWidth, imageFrame.right - startLeft);
          if (position.includes("s")) constrainedHeight = Math.min(constrainedHeight, imageFrame.bottom - startTop);
          if (position.includes("w")) {
            constrainedWidth = Math.min(constrainedWidth, startLeft - imageFrame.left + startWidth);
            left = Math.max(imageFrame.left, startLeft + (startWidth - constrainedWidth));
          }
          if (position.includes("n")) {
            constrainedHeight = Math.min(constrainedHeight, startTop - imageFrame.top + startHeight);
            top = Math.max(imageFrame.top, startTop + (startHeight - constrainedHeight));
          }
          left = Math.max(imageFrame.left, Math.min(left, imageFrame.right - constrainedWidth));
          top = Math.max(imageFrame.top, Math.min(top, imageFrame.bottom - constrainedHeight));

          areaElement.style.width = `${constrainedWidth}px`;
          areaElement.style.height = `${constrainedHeight}px`;
          wrapperEl.style.left = `${left}px`;
          wrapperEl.style.top = `${top}px`;
          moveEvent.preventDefault();
        },
        (endEvent) => {
          const imageFrame = frame();
          const annotation = s.userAnnotations[index];
          annotation.widthRel = Number.parseInt(areaElement.style.width, 10) / imageFrame.width;
          annotation.heightRel = Number.parseInt(areaElement.style.height, 10) / imageFrame.height;
          const x = ((Number.parseFloat(wrapperEl.style.left) || 0) - imageFrame.left) / imageFrame.width;
          const y = ((Number.parseFloat(wrapperEl.style.top) || 0) - imageFrame.top) / imageFrame.height;
          if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
            annotation.x = x;
            annotation.y = y;
          }
          sv.urlSync.updateURLState();
          endEvent.preventDefault();
        },
      );
    };
    handle.addEventListener("mousedown", start, { signal });
    handle.addEventListener("touchstart", start, { signal, passive: false });
  }

  function addArrowDragListeners(ann, signal) {
    const parts = ann._arrow;
    if (!parts) return;
    const begin = (end) => (event) => {
      if (!s.editModeEnabled) return;
      const pointer = pointerOf(event);
      const factor = scale();
      const start = {
        clientX: pointer.clientX,
        clientY: pointer.clientY,
        x: ann.x,
        y: ann.y,
        x2: Number.isFinite(ann.x2) ? ann.x2 : ann.x,
        y2: Number.isFinite(ann.y2) ? ann.y2 : ann.y,
      };
      event.preventDefault();
      event.stopPropagation();
      track(
        (moveEvent) => {
          const current = pointerOf(moveEvent);
          const imageFrame = frame();
          const deltaX = (current.clientX - start.clientX) / factor / imageFrame.width;
          const deltaY = (current.clientY - start.clientY) / factor / imageFrame.height;
          if (end === "tail") {
            ann.x = clampUnit(start.x + deltaX);
            ann.y = clampUnit(start.y + deltaY);
          } else if (end === "head") {
            ann.x2 = clampUnit(start.x2 + deltaX);
            ann.y2 = clampUnit(start.y2 + deltaY);
          } else {
            // The shaft moves both ends, and stops as soon as either would
            // leave the diagram, so the arrow never deforms while moving.
            const limitedX = Math.max(-Math.min(start.x, start.x2), Math.min(deltaX, 1 - Math.max(start.x, start.x2)));
            const limitedY = Math.max(-Math.min(start.y, start.y2), Math.min(deltaY, 1 - Math.max(start.y, start.y2)));
            ann.x = start.x + limitedX;
            ann.y = start.y + limitedY;
            ann.x2 = start.x2 + limitedX;
            ann.y2 = start.y2 + limitedY;
          }
          sv.annotations.updateArrowLayout(ann, imageFrame);
          moveEvent.preventDefault();
        },
        (endEvent) => {
          sv.urlSync.updateURLState();
          endEvent.preventDefault();
        },
      );
    };
    const options = { signal, passive: false };
    parts.handles[0].addEventListener("mousedown", begin("tail"), options);
    parts.handles[0].addEventListener("touchstart", begin("tail"), options);
    parts.handles[1].addEventListener("mousedown", begin("head"), options);
    parts.handles[1].addEventListener("touchstart", begin("head"), options);
    parts.hit.addEventListener("mousedown", begin("shaft"), options);
    parts.hit.addEventListener("touchstart", begin("shaft"), options);
  }

  return {
    updateUserAnnotationDragState,
    addUserAnnotationDragListeners,
    addAreaAnnotationDragListeners,
    addAreaResizeHandles,
    addArrowDragListeners,
  };
}
