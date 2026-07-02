export function attachCanvasInteraction(renderer, element) {
  const pointers = new Map();
  let lastPoint = null;
  let pinchDistance = 0;
  let editingPointerId = null;
  let panningPointerId = null;
  let gestureMoved = false;
  let activePress = null;
  let tooltipTimer = null;

  function getDistance() {
    const values = Array.from(pointers.values());
    if (values.length < 2) return 0;
    const dx = values[0].x - values[1].x;
    const dy = values[0].y - values[1].y;
    return Math.hypot(dx, dy);
  }

  function getLocalPoint(event) {
    const rect = element.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function clearPressTimer() {
    if (tooltipTimer) {
      clearTimeout(tooltipTimer);
      tooltipTimer = null;
    }
  }

  function showTooltipAtPoint(point, locked = false) {
    const hit = renderer.screenToGrid(point.x, point.y);
    if (!hit) {
      renderer.hideCellTooltip(true);
      return;
    }
    renderer.showCellTooltip(hit.gridX, hit.gridY, {
      screenX: point.x,
      screenY: point.y,
      locked
    });
    clearPressTimer();
    if (!locked) {
      tooltipTimer = setTimeout(() => {
        renderer.hideCellTooltip();
      }, 1500);
    }
  }

  element.addEventListener("wheel", (event) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.12 : 0.9;
    const point = getLocalPoint(event);
    renderer.zoomBy(factor, point);
  }, { passive: false });

  element.addEventListener("pointerdown", (event) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const point = getLocalPoint(event);
    gestureMoved = false;

    if (pointers.size === 2) {
      clearPressTimer();
      pinchDistance = getDistance();
      editingPointerId = null;
      panningPointerId = event.pointerId;
      renderer.hideCellTooltip(true);
      return;
    }

    activePress = {
      pointerId: event.pointerId,
      point,
      screenX: event.clientX,
      screenY: event.clientY,
      longPressed: false
    };

    clearPressTimer();
    tooltipTimer = setTimeout(() => {
      if (!activePress || activePress.pointerId !== event.pointerId || gestureMoved) return;
      activePress.longPressed = true;
      showTooltipAtPoint(activePress.point, true);
    }, 420);

    if (renderer.toolMode === "pan" || renderer.mode === "preview" || renderer.mode === "ironed") {
      panningPointerId = event.pointerId;
      lastPoint = { x: event.clientX, y: event.clientY };
    } else {
      const started = renderer.beginEdit(point.x, point.y);
      if (started) {
        editingPointerId = event.pointerId;
      } else {
        panningPointerId = event.pointerId;
        lastPoint = { x: event.clientX, y: event.clientY };
      }
    }

    element.setPointerCapture(event.pointerId);
  });

  element.addEventListener("pointermove", (event) => {
    const point = getLocalPoint(event);
    renderer.setHoverFromScreen(point.x, point.y);

    if (!pointers.has(event.pointerId)) return;
    const previous = pointers.get(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (previous && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) > 2) {
      gestureMoved = true;
    }
    if (activePress && activePress.pointerId === event.pointerId) {
      const delta = Math.hypot(event.clientX - activePress.screenX, event.clientY - activePress.screenY);
      if (delta > 6) {
        gestureMoved = true;
        clearPressTimer();
      }
    }

    if (pointers.size === 2) {
      clearPressTimer();
      const nextDistance = getDistance();
      if (pinchDistance > 0 && nextDistance > 0) {
        const factor = nextDistance / pinchDistance;
        const values = Array.from(pointers.values());
        const rect = element.getBoundingClientRect();
        renderer.zoomBy(factor, {
          x: ((values[0].x + values[1].x) / 2) - rect.left,
          y: ((values[0].y + values[1].y) / 2) - rect.top
        });
      }
      pinchDistance = nextDistance;
      return;
    }

    if (editingPointerId === event.pointerId && (event.buttons & 1) === 1) {
      renderer.continueEdit(point.x, point.y);
      return;
    }

    if (panningPointerId === event.pointerId && lastPoint) {
      const deltaX = event.clientX - lastPoint.x;
      const deltaY = event.clientY - lastPoint.y;
      renderer.panBy(deltaX, deltaY);
      lastPoint = { x: event.clientX, y: event.clientY };
    }
  });

  function release(event) {
    const point = getLocalPoint(event);
    const wasTap = activePress && activePress.pointerId === event.pointerId && !gestureMoved;
    const wasLongPress = activePress && activePress.pointerId === event.pointerId && activePress.longPressed;

    clearPressTimer();

    if (wasTap && !wasLongPress) {
      showTooltipAtPoint(point, false);
    }

    pointers.delete(event.pointerId);
    if (editingPointerId === event.pointerId) {
      editingPointerId = null;
    }
    if (panningPointerId === event.pointerId) {
      panningPointerId = null;
    }
    if (activePress?.pointerId === event.pointerId) {
      activePress = null;
    }
    if (pointers.size <= 1) {
      pinchDistance = 0;
    }
    if (pointers.size === 1) {
      const [remaining] = pointers.values();
      lastPoint = remaining ? { ...remaining } : null;
    } else {
      lastPoint = null;
    }
    if (element.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId);
    }
  }

  element.addEventListener("pointerup", release);
  element.addEventListener("pointercancel", release);
  element.addEventListener("pointerleave", () => {
    renderer.clearHover();
  });
}
