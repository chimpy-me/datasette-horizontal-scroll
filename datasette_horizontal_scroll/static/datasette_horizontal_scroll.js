(function() {
  'use strict';

  const BAR_ID = 'datasette-horizontal-scroll-bar';

  let scrollBar = null;
  let scrollThumb = null;

  // wrapperEl: used for bar geometry (left/width alignment)
  // scrollEl: the element whose scrollLeft actually changes (wrapper OR table)
  // tableEl: the table inside the wrapper (or the table itself if no wrapper)
  let wrapperEl = null;
  let scrollEl = null;
  let tableEl = null;

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

    scrollBar = document.createElement('div');
    scrollBar.id = BAR_ID;
    scrollBar.className = 'datasette-horizontal-scroll-bar';

    scrollThumb = document.createElement('div');
    scrollThumb.className = 'datasette-horizontal-scroll-thumb';

    scrollBar.appendChild(scrollThumb);
    document.body.appendChild(scrollBar);
  }

  function hasOverflow() {
    if (!scrollEl) return false;
    return scrollEl.scrollWidth > scrollEl.clientWidth + 1;
  }

  function getGeometryEl() {
    return wrapperEl || scrollEl;
  }

  function observeCurrent() {
    if (typeof ResizeObserver === 'undefined') return;

    if (!ro) ro = new ResizeObserver(updateScrollBarDimensions);
    ro.disconnect();

    const geom = getGeometryEl();
    if (geom) ro.observe(geom);
    if (tableEl && tableEl !== geom) ro.observe(tableEl);
    if (scrollEl && scrollEl !== geom && scrollEl !== tableEl) ro.observe(scrollEl);
  }

  function setActiveTargets(nextWrapper, nextTable, nextScroller) {
    wrapperEl = nextWrapper || null;
    tableEl = nextTable || null;
    scrollEl = nextScroller || null;

    observeCurrent();
    updateScrollBarDimensions();
    requestThumbUpdate();
  }

  function findBestInitialTarget() {
    const wrappers = Array.from(document.querySelectorAll('.table-wrapper'));
    const viewportH = window.innerHeight;

    if (!wrappers.length) {
      const t =
        document.querySelector('table.rows-and-columns') ||
        document.querySelector('table');
      if (!t) return { wrapper: null, table: null, scroller: null };
      return { wrapper: null, table: t, scroller: t };
    }

    const candidates = wrappers.map(w => {
      const t = w.querySelector('table.rows-and-columns') || w.querySelector('table');
      if (!t) return null;

      // Prefer wrapper as initial scroller; we will correct on first captured scroll event.
      const geomRect = w.getBoundingClientRect();
      const visible = geomRect.bottom > 0 && geomRect.top < viewportH;

      // Overflow could be on wrapper or table depending on CSS; estimate both.
      const wrapperOverflow = w.scrollWidth - w.clientWidth;
      const tableOverflow = t.scrollWidth - t.clientWidth;
      const overflow = Math.max(wrapperOverflow, tableOverflow);

      return { w, t, visible, overflow };
    }).filter(Boolean);

    if (!candidates.length) return { wrapper: null, table: null, scroller: null };

    candidates.sort((a, b) => {
      if (a.visible !== b.visible) return (b.visible ? 1 : 0) - (a.visible ? 1 : 0);
      return b.overflow - a.overflow;
    });

    const best = candidates[0];
    return { wrapper: best.w, table: best.t, scroller: best.w };
  }

  function updateThumbPosition() {
    if (!scrollThumb || !scrollEl || !scrollBar) return;

    const scrollableWidth = scrollEl.scrollWidth - scrollEl.clientWidth;
    if (scrollableWidth <= 0) {
      scrollThumb.style.left = '0px';
      return;
    }

    const trackWidth = scrollBar.offsetWidth;
    const thumbWidth = scrollThumb.offsetWidth;
    const maxThumbLeft = trackWidth - thumbWidth;

    if (maxThumbLeft <= 0) {
      scrollThumb.style.left = '0px';
      return;
    }

    const epsilon = 1;
    const clampedScrollLeft = Math.max(0, Math.min(scrollEl.scrollLeft, scrollableWidth));

    let scrollRatio;
    if (clampedScrollLeft <= epsilon) scrollRatio = 0;
    else if ((scrollableWidth - clampedScrollLeft) <= epsilon) scrollRatio = 1;
    else scrollRatio = clampedScrollLeft / scrollableWidth;

    scrollThumb.style.left = (scrollRatio * maxThumbLeft) + 'px';
  }

  function updateScrollBarDimensions() {
    if (!scrollBar) return;

    const geom = getGeometryEl();
    if (!geom) return;

    const rect = geom.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    scrollBar.style.left = rect.left + 'px';
    scrollBar.style.width = rect.width + 'px';

    // Thumb width based on actual scroller’s visible fraction.
    if (scrollEl) {
      const trackWidth = rect.width;
      const visibleRatio = scrollEl.clientWidth / Math.max(1, scrollEl.scrollWidth);
      const rawThumbWidth = Math.max(40, trackWidth * visibleRatio);
      const thumbWidth = Math.max(40, Math.min(trackWidth, rawThumbWidth));
      scrollThumb.style.width = thumbWidth + 'px';
    }

    updateThumbPosition();

    const isVisible = rect.bottom > 0 && rect.top < viewportHeight;
    if (!scrollEl || !hasOverflow() || !isVisible) {
      scrollBar.classList.remove('visible');
    }
  }

  function showScrollBar() {
    if (!scrollBar || !scrollEl) return;
    if (!hasOverflow()) return;

    clearTimeout(hideTimeout);
    scrollBar.classList.add('visible');
  }

  function scheduleHide(delay) {
    delay = delay || 1500;
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(function() {
      if (!isDragging) scrollBar.classList.remove('visible');
    }, delay);
  }

  function stopDragging() {
    if (!isDragging) return;
    isDragging = false;
    scrollThumb.classList.remove('dragging');
    scheduleHide();
  }

  // Capture scroll events from whichever element is actually scrolling.
  // This corrects the wrapper-vs-table ambiguity automatically.
  function onCapturedScroll(e) {
    const target = e.target;
    if (!target) return;

    // Only react to tables and .table-wrapper scrolls (avoid page/body scroll).
    let w = null;
    let t = null;

    if (target.classList && target.classList.contains('table-wrapper')) {
      w = target;
      t = w.querySelector('table.rows-and-columns') || w.querySelector('table');
      if (!t) return;

      // If wrapper scrolls, wrapper is the scroller.
      setActiveTargets(w, t, target);
      showScrollBar();
      requestThumbUpdate();
      return;
    }

    if (target.tagName === 'TABLE') {
      t = target;
      w = t.closest('.table-wrapper');

      // If a table scrolls, the table is the scroller; geometry still comes from wrapper if present.
      setActiveTargets(w, t, target);
      showScrollBar();
      requestThumbUpdate();
      return;
    }
  }

  function init() {
    ensureBarExists();

    const initial = findBestInitialTarget();
    if (!initial.table || !initial.scroller) return;

    setActiveTargets(initial.wrapper, initial.table, initial.scroller);

    // Global capturing scroll listener: robust across wrapper/table scrollers and multiple tables.
    document.addEventListener('scroll', onCapturedScroll, true);

    scrollBar.addEventListener('click', function(e) {
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
      const scrollRatio = newThumbLeft / maxThumbLeft;
      scrollEl.scrollLeft = scrollRatio * scrollableWidth;

      requestThumbUpdate();
      showScrollBar();
    });

    scrollThumb.addEventListener('mousedown', function(e) {
      if (!scrollEl) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartScrollLeft = scrollEl.scrollLeft;
      scrollThumb.classList.add('dragging');
      showScrollBar();
      e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
      if (!isDragging || !scrollEl) return;

      const trackWidth = scrollBar.offsetWidth;
      const thumbWidth = scrollThumb.offsetWidth;
      const maxThumbLeft = trackWidth - thumbWidth;
      if (maxThumbLeft <= 0) return;

      const deltaX = e.clientX - dragStartX;
      const scrollableWidth = scrollEl.scrollWidth - scrollEl.clientWidth;

      const scrollDelta = (deltaX / maxThumbLeft) * scrollableWidth;
      scrollEl.scrollLeft = dragStartScrollLeft + scrollDelta;

      requestThumbUpdate();
      showScrollBar();
    });

    document.addEventListener('mouseup', stopDragging);
    window.addEventListener('blur', stopDragging);
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) stopDragging();
    });
    document.addEventListener('mouseleave', stopDragging);

    // Show bar when cursor approaches bottom of viewport
    document.addEventListener('mousemove', function(e) {
      if (!scrollEl) return;
      const windowHeight = window.innerHeight;
      if (e.clientY > windowHeight - 80 && hasOverflow()) {
        showScrollBar();
      }
    }, { passive: true });

    scrollBar.addEventListener('mouseenter', showScrollBar);
    scrollBar.addEventListener('mouseleave', function() {
      if (!isDragging) scheduleHide();
    });

    window.addEventListener('resize', updateScrollBarDimensions, { passive: true });
    window.addEventListener('scroll', updateScrollBarDimensions, { passive: true });

    setTimeout(function() {
      updateScrollBarDimensions();
      if (scrollEl && hasOverflow()) {
        showScrollBar();
        scheduleHide(2500);
      }
    }, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
