(function() {
    'use strict';

    const BAR_ID = 'datasette-horizontal-scroll-bar';

    let scrollBar = null;
    let scrollThumb = null;

    let tableWrapper = null;
    let table = null;

    let hideTimeout = null;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartScrollLeft = 0;

    let ro = null; // ResizeObserver (if available)

    // rAF throttle for thumb updates (keeps drag feeling "locked" without
    // doing layout work on every single mousemove)
    let thumbRafPending = false;
    function requestThumbUpdate() {
        if (thumbRafPending) return;
        thumbRafPending = true;
        requestAnimationFrame(() => {
            thumbRafPending = false;
            updateThumbPosition();
        });
    }

    // CSS is served as a static plugin asset (datasette_horizontal_scroll.css).
    // We intentionally do not inject styles here to stay CSP-friendly.

    function ensureBarExists() {
        // Defensive: avoid duplicates if init() runs more than once
        const existing = document.getElementById(BAR_ID);
        if (existing) existing.remove();

        scrollBar = document.createElement('div');
        scrollBar.id = BAR_ID;
        scrollBar.className = 'datasette-horizontal-scroll-bar';

        scrollThumb = document.createElement('div');
        scrollThumb.className = 'datasette-horizontal-scroll-thumb';

        scrollBar.appendChild(scrollThumb);
        document.body.appendChild(scrollBar);
    }

    function findBestTableWrapper() {
        const wrappers = Array.from(document.querySelectorAll('.table-wrapper'));
        const viewportH = window.innerHeight;

        // Fallback for template variations
        if (!wrappers.length) {
            const t = document.querySelector('table.rows-and-columns') || document.querySelector('table');
            if (!t) return { wrapper: null, table: null };
            return { wrapper: t.parentElement, table: t };
        }

        const scored = wrappers.map(w => {
            const t = w.querySelector('table.rows-and-columns') || w.querySelector('table');
            if (!t) return null;

            const rect = w.getBoundingClientRect();
            const visible = rect.bottom > 0 && rect.top < viewportH;
            const overflow = t.scrollWidth - w.clientWidth;

            return { w, t, visible, overflow };
        }).filter(Boolean);

        if (!scored.length) return { wrapper: null, table: null };

        scored.sort((a, b) => {
            if (a.visible !== b.visible) return (b.visible ? 1 : 0) - (a.visible ? 1 : 0);
            return b.overflow - a.overflow;
        });

        return { wrapper: scored[0].w, table: scored[0].t };
    }

    function hasOverflow() {
        if (!tableWrapper || !table) return false;
        return table.scrollWidth > tableWrapper.clientWidth;
    }

    function updateThumbPosition() {
        if (!scrollThumb || !tableWrapper || !table || !scrollBar) return;

        const scrollableWidth = table.scrollWidth - tableWrapper.clientWidth;
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

        // Clamp and snap to ends to avoid “almost zero” offsets
        const epsilon = 1; // px threshold
        const clampedScrollLeft = Math.max(0, Math.min(tableWrapper.scrollLeft, scrollableWidth));

        let scrollRatio;
        if (clampedScrollLeft <= epsilon) {
            scrollRatio = 0;
        } else if ((scrollableWidth - clampedScrollLeft) <= epsilon) {
            scrollRatio = 1;
        } else {
            scrollRatio = clampedScrollLeft / scrollableWidth;
        }

        scrollThumb.style.left = (scrollRatio * maxThumbLeft) + 'px';
    }

    function updateScrollBarDimensions() {
        if (!scrollBar || !tableWrapper || !table) return;

        const wrapperRect = tableWrapper.getBoundingClientRect();
        const viewportHeight = window.innerHeight;

        // Keep bar aligned with table wrapper horizontally
        scrollBar.style.left = wrapperRect.left + 'px';
        scrollBar.style.width = wrapperRect.width + 'px';

        // Thumb size proportional to visible area; clamp to track width
        const trackWidth = wrapperRect.width;
        const visibleRatio = tableWrapper.clientWidth / Math.max(1, table.scrollWidth);
        const rawThumbWidth = Math.max(40, trackWidth * visibleRatio);
        const thumbWidth = Math.max(40, Math.min(trackWidth, rawThumbWidth));
        scrollThumb.style.width = thumbWidth + 'px';

        updateThumbPosition();

        // Hide if no overflow or wrapper not visible
        const isTableVisible = wrapperRect.bottom > 0 && wrapperRect.top < viewportHeight;
        if (!hasOverflow() || !isTableVisible) {
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
            if (scrollBar && !isDragging) {
                scrollBar.classList.remove('visible');
            }
        }, delay);
    }

    function stopDragging() {
        if (!isDragging) return;
        isDragging = false;
        scrollThumb.classList.remove('dragging');
        scheduleHide();
    }

    function bindToCurrentWrapper() {
        const found = findBestTableWrapper();
        tableWrapper = found.wrapper;
        table = found.table;

        if (!tableWrapper || !table) return false;

        // Sync thumb to wrapper scrolling (always)
        tableWrapper.addEventListener('scroll', function() {
            requestThumbUpdate();
            showScrollBar();
        }, { passive: true });

        tableWrapper.addEventListener('mouseenter', function() {
            if (hasOverflow()) showScrollBar();
        });

        tableWrapper.addEventListener('mouseleave', function() {
            if (!isDragging) scheduleHide();
        });

        // Robust to layout/size changes (fonts, column toggles, etc.)
        if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(updateScrollBarDimensions);
            ro.observe(tableWrapper);
            ro.observe(table);
        }

        return true;
    }

    function init() {
        ensureBarExists();

        if (!bindToCurrentWrapper()) return;

        // Click track to jump
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

            const scrollableWidth = table.scrollWidth - tableWrapper.clientWidth;
            const scrollRatio = newThumbLeft / maxThumbLeft;
            tableWrapper.scrollLeft = scrollRatio * scrollableWidth;
        });

        // Drag handling
        scrollThumb.addEventListener('mousedown', function(e) {
            isDragging = true;
            dragStartX = e.clientX;
            dragStartScrollLeft = tableWrapper.scrollLeft;
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
            const scrollableWidth = table.scrollWidth - tableWrapper.clientWidth;

            const scrollDelta = (deltaX / maxThumbLeft) * scrollableWidth;
            tableWrapper.scrollLeft = dragStartScrollLeft + scrollDelta;

            // Improves perceived smoothness during drag
            requestThumbUpdate();
            showScrollBar();
        }, { passive: true });

        // Unified drag stop paths
        document.addEventListener('mouseup', stopDragging);
        window.addEventListener('blur', stopDragging);
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) stopDragging();
        });
        document.addEventListener('mouseleave', stopDragging);

        // Show scrollbar on mouse movement near bottom edge
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

        // Initial visibility check
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