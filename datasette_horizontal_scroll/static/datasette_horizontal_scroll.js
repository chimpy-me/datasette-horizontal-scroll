(function() {
  'use strict';

  const BAR_ID = 'datasette-horizontal-scroll-bar';

  let scrollBar = null;
  let scrollThumb = null;

  // scrollEl is the *actual* horizontal scroll container (wrapper OR table)
  let scrollEl = null;
  // table is the content element used to choose targets; scroll width is taken from scrollEl
  let table = null;

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

  function isXScrollable(el) {
    if (!el) return false;
    const ox = getComputedStyle(el).overflowX;
    if (ox === 'visible' || ox === 'clip') return false;
    return el.scrollWidth > el.clientWidth + 1;
  }

  function findBestScrollTarget() {
    const wrappers = Array.from(document.querySelectorAll('.table-wrapper'));
    const viewportH = window.innerHeight;

    // Fallback for template variations or pages without table-wrapper
    if (!wrappers.length) {
      const t =
        document.querySelector('table.rows-and-columns') ||
        document.querySelector('table');
      if (!t) return { scrollEl: null, table: null };
      // In compact layouts the table itself is often the scroller
      return { scrollEl: t, table: t };
    }

    const scored = wrappers.map(w => {
      const t =
        w.querySelector('table.rows-and-columns') ||
        w.querySelector('table');
      if (!t) return null;

      // Choose the element that actually scrolls horizontally.
      // Prefer wrapper if it truly scrolls; otherwise fall back to the table.
      let scroller;
      if (isXScrollable(w)) {
        scroller = w;
      } else if (isXScrollable(t)) {
        scroller = t;
      } else {
        // Fallback: if neither is currently scrollable, keep wrapper for geometry.
        scroller = w;
      }

      const rect = scroller.getBoundingClientRect();
      const visible = rect.bottom > 0 && rect.top < viewportH;
      const overflow = scroller.scrollWidth - scroller.clientWidth;

      return { scroller, t, visible, overflow };
    }).filter(Boolean);

    if (!scored.length) return { scrollEl: null, table: null };

    scored.sort((a, b) => {
      if (a.visible !== b.visible) return (b.visible ? 1 : 0) - (a.visible ? 1 : 0);
      return b.overflow - a.overflow;
    });

    return { scrollEl: scored[0].scroller, table: scored[0].t };
  }

  function hasOverflow() {
    if (!scrollEl || !table) return false;
    return scrollEl.scrollWidth > scrollEl.clientWidth + 1;
  }

  function updateThumbPosition() {
    if (!scrollThumb || !scrollEl || !table || !scrollBar) return;

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
    if (!scrollBar || !scrollEl || !table) return;

    const rect = scrollEl.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    scrollBar.style.left = rect.left + 'px';
    scrollBar.style.width = rect.width + 'px';

    const trackWidth = rect.width;
    const visibleRatio = scrollEl.clientWidth / Math.max(1, scrollEl.scrollWidth);
    const rawThumbWidth = Math.max(40, trackWidth * visibleRatio);
    const thumbWidth = Math.max(40, Math.min(trackWidth, rawThumbWidth));
    scrollThumb.style.width = thumbWidth + 'px';

    updateThumbPosition();

    const isVisible = rect.bottom > 0 && rect.top < viewportHeight;
    if (!hasOverflow() || !isVisible) {
      scrollBar.classList.remove('visible');
    }
  }

  function showScrollBar() {
    if (!scrollBar || !hasOverflow()) return;
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

  function bindToCurrentTarget() {
    const found = findBestScrollTarget();
    scrollEl = found.scrollEl;
    table = found.table;
    if (!scrollEl || !table) return false;

    scrollEl.addEventListener('scroll', function() {
      requestThumbUpdate();
      showScrollBar();
    }, { passive: true });

    scrollEl.addEventListener('mouseenter', function() {
      if (hasOverflow()) showScrollBar();
    });

    scrollEl.addEventListener('mouseleave', function() {
      if (!isDragging) scheduleHide();
    });

    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(updateScrollBarDimensions);
      ro.observe(scrollEl);
      ro.observe(table);
    }

    return true;
  }

  function init() {
    ensureBarExists();
    if (!bindToCurrentTarget()) return;

    scrollBar.addEventListener('click', function(e) {
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
    });

    scrollThumb.addEventListener('mousedown', function(e) {
      isDragging = true;
      dragStartX = e.clientX;
      dragStartScrollLeft = scrollEl.scrollLeft;
      scrollThumb.classList.add('dragging');
      showScrollBar();
      e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
      if (!isDragging) return;

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
    }, { passive: true });

    document.addEventListener('mouseup', stopDragging);
    window.addEventListener('blur', stopDragging);
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) stopDragging();
    });
    document.addEventListener('mouseleave', stopDragging);

    // Show bar when cursor approaches bottom of viewport
    document.addEventListener('mousemove', function(e) {
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
      if (hasOverflow()) {
        showScrollBar();
        scheduleHide(2500);
      }
    }, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { init(); });
  } else {
    init();
  }
})();
