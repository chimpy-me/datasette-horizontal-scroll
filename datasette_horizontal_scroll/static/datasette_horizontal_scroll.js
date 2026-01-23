(function () {
  "use strict";

  const BAR_ID = "datasette-horizontal-scroll-bar";

  let scrollBar = null;
  let scrollThumb = null;

  // geomEl: element we align the bar to (prefer wrapper)
  // scrollEl: element whose scrollLeft changes (wrapper OR table)
  let geomEl = null;
  let scrollEl = null;

  let hideTimeout = null;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartScrollLeft = 0;

  let ro = null;
  let thumbRafPending = false;

  function requestThumbUpdate() {
    if (thumbRafPending) return;
    thumbRafPending = true;
    requestAnimationFrame(() => {
      thumbRafPending = false;
      updateThumbPosition();
    });
  }

  function ensureBarExists() {
    if (scrollBar) return;

    scrollBar = document.createElement("div");
    scrollBar.id = BAR_ID;
    scrollBar.className = "datasette-horizontal-scroll-bar";

    scrollThumb = document.createElement("div");
    scrollThumb.className = "datasette-horizontal-scroll-thumb";

    scrollBar.appendChild(scrollThumb);
    document.body.appendChild(scrollBar);
  }

  function pickScrollEl(wrapper, table) {
    if (wrapper && wrapper.scrollWidth > wrapper.clientWidth + 1) return wrapper;
    if (table && table.scrollWidth > table.clientWidth + 1) return table;
    return wrapper || table || null;
  }

  function findBestTarget() {
    const wrappers = Array.from(document.querySelectorAll(".table-wrapper"));
    const viewportH = window.innerHeight;

    if (!wrappers.length) {
      const t =
        document.querySelector("table.rows-and-columns") ||
        document.querySelector("table");
      if (!t) return null;
      return { wrapper: null, table: t };
    }

    const candidates = wrappers
      .map((w) => {
        const t =
          w.querySelector("table.rows-and-columns") ||
          w.querySelector("table");
        if (!t) return null;

        const rect = w.getBoundingClientRect();
        const visible = rect.bottom > 0 && rect.top < viewportH;

        const overflow = Math.max(
          (w.scrollWidth - w.clientWidth),
          (t.scrollWidth - t.clientWidth)
        );

        return { wrapper: w, table: t, visible, overflow };
      })
      .filter(Boolean);

    if (!candidates.length) return null;

    candidates.sort((a, b) => {
      if (a.visible !== b.visible) return (b.visible ? 1 : 0) - (a.visible ? 1 : 0);
      return b.overflow - a.overflow;
    });

    return { wrapper: candidates[0].wrapper, table: candidates[0].table };
  }

  function hasOverflow() {
    return !!(scrollEl && scrollEl.scrollWidth > scrollEl.clientWidth + 1);
  }

  function updateThumbPosition() {
    if (!scrollThumb || !scrollBar || !scrollEl) return;

    const scrollableWidth = scrollEl.scrollWidth - scrollEl.clientWidth;
    if (scrollableWidth <= 0) {
      scrollThumb.style.left = "0px";
      return;
    }

    const trackWidth = scrollBar.offsetWidth;
    const thumbWidth = scrollThumb.offsetWidth;
    const maxThumbLeft = trackWidth - thumbWidth;

    if (maxThumbLeft <= 0) {
      scrollThumb.style.left = "0px";
      return;
    }

    const ratio = Math.max(0, Math.min(1, scrollEl.scrollLeft / scrollableWidth));
    scrollThumb.style.left = (ratio * maxThumbLeft) + "px";
  }

  function updateScrollBarDimensions() {
    if (!scrollBar || !scrollThumb || !geomEl) return;

    const rect = geomEl.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    scrollBar.style.left = rect.left + "px";
    scrollBar.style.width = rect.width + "px";

    if (scrollEl) {
      const trackWidth = rect.width;
      const visibleRatio = scrollEl.clientWidth / Math.max(1, scrollEl.scrollWidth);
      const rawThumbWidth = Math.max(40, trackWidth * visibleRatio);
      const thumbWidth = Math.max(40, Math.min(trackWidth, rawThumbWidth));
      scrollThumb.style.width = thumbWidth + "px";
    }

    updateThumbPosition();

    const isVisible = rect.bottom > 0 && rect.top < viewportHeight;
    if (!scrollEl || !hasOverflow() || !isVisible) {
      scrollBar.classList.remove("visible");
    }
  }

  function showScrollBar() {
    if (!scrollBar || !scrollEl) return;
    if (!hasOverflow()) return;

    clearTimeout(hideTimeout);
    scrollBar.classList.add("visible");
  }

  function scheduleHide(delay) {
    delay = delay || 1500;
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      if (!isDragging) scrollBar.classList.remove("visible");
    }, delay);
  }

  function stopDragging() {
    if (!isDragging) return;
    isDragging = false;
    scrollThumb.classList.remove("dragging");
    scheduleHide();
  }

  function attachScrollerListeners() {
    if (!scrollEl) return;

    scrollEl.addEventListener("scroll", () => {
      requestThumbUpdate();
      showScrollBar();
    }, { passive: true });

    scrollEl.addEventListener("mouseenter", () => {
      if (hasOverflow()) showScrollBar();
    });

    scrollEl.addEventListener("mouseleave", () => {
      if (!isDragging) scheduleHide();
    });
  }

  function init() {
    ensureBarExists();

    const best = findBestTarget();
    if (!best) return;

    // Align bar to wrapper when present (looks like vanilla)
    geomEl = best.wrapper || best.table;

    // Choose actual scroller (wrapper OR table)
    scrollEl = pickScrollEl(best.wrapper, best.table);

    // Observe geometry and scroller for resizes
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(updateScrollBarDimensions);
      ro.observe(geomEl);
      if (scrollEl && scrollEl !== geomEl) ro.observe(scrollEl);
    }

    attachScrollerListeners();

    scrollBar.addEventListener("click", (e) => {
      if (!scrollEl) return;
      if (e.target === scrollThumb) return;

      const thumbWidth = scrollThumb.offsetWidth;
      const trackWidth = scrollBar.offsetWidth;
      const maxThumbLeft = trackWidth - thumbWidth;
      if (maxThumbLeft <= 0) return;

      const rect = scrollBar.getBoundingClientRect();
      const clickX = e.clientX - rect.left;

      let newThumbLeft = clickX - thumbWidth / 2;
      newThumbLeft = Math.max(0, Math.min(newThumbLeft, maxThumbLeft));

      const scrollableWidth = scrollEl.scrollWidth - scrollEl.clientWidth;
      const ratio = newThumbLeft / maxThumbLeft;
      scrollEl.scrollLeft = ratio * scrollableWidth;

      requestThumbUpdate();
      showScrollBar();
    });

    scrollThumb.addEventListener("mousedown", (e) => {
      if (!scrollEl) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartScrollLeft = scrollEl.scrollLeft;
      scrollThumb.classList.add("dragging");
      showScrollBar();
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging || !scrollEl) return;

      const trackWidth = scrollBar.offsetWidth;
      const thumbWidth = scrollThumb.offsetWidth;
      const maxThumbLeft = trackWidth - thumbWidth;
      if (maxThumbLeft <= 0) return;

      const deltaX = e.clientX - dragStartX;
      const scrollableWidth = scrollEl.scrollWidth - scrollEl.clientWidth;

      scrollEl.scrollLeft = dragStartScrollLeft + (deltaX / maxThumbLeft) * scrollableWidth;

      requestThumbUpdate();
      showScrollBar();
    }, { passive: true });

    document.addEventListener("mouseup", stopDragging);
    window.addEventListener("blur", stopDragging);

    scrollBar.addEventListener("mouseenter", showScrollBar);
    scrollBar.addEventListener("mouseleave", () => {
      if (!isDragging) scheduleHide();
    });

    window.addEventListener("resize", updateScrollBarDimensions, { passive: true });

    setTimeout(() => {
      updateScrollBarDimensions();
      if (hasOverflow()) {
        showScrollBar();
        scheduleHide(2500);
      }
    }, 300);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
