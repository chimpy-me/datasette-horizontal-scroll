(function () {
  "use strict";

  const PROXY_ID = "dhs-proxy-scrollbar";
  const SPACER_CLASS = "dhs-proxy-spacer";

  let proxy = null;
  let spacer = null;

  // Current active elements
  let geomEl = null;    // align the proxy to this (prefer wrapper)
  let scrollEl = null;  // the element that actually scrolls horizontally (wrapper OR table)

  let activeScrollListenerEl = null;
  let syncing = false;

  function ensureProxy() {
    if (proxy) return;

    proxy = document.createElement("div");
    proxy.id = PROXY_ID;
    proxy.className = "dhs-proxy-scrollbar";

    spacer = document.createElement("div");
    spacer.className = SPACER_CLASS;

    proxy.appendChild(spacer);
    document.body.appendChild(proxy);

    proxy.addEventListener(
      "scroll",
      () => {
        if (!scrollEl || syncing) return;
        syncing = true;
        scrollEl.scrollLeft = proxy.scrollLeft;
        syncing = false;
      },
      { passive: true }
    );
  }

  function detachActiveScrollListener() {
    if (!activeScrollListenerEl) return;
    activeScrollListenerEl.removeEventListener("scroll", onActiveScroll, { passive: true });
    activeScrollListenerEl = null;
  }

  function attachActiveScrollListener(el) {
    if (!el || activeScrollListenerEl === el) return;
    detachActiveScrollListener();
    activeScrollListenerEl = el;
    el.addEventListener("scroll", onActiveScroll, { passive: true });
  }

  function onActiveScroll() {
    if (!proxy || !scrollEl || syncing) return;
    syncing = true;
    proxy.scrollLeft = scrollEl.scrollLeft;
    syncing = false;
  }

  function pickScrollEl(wrapper, table) {
    // Choose the element whose scrollLeft actually changes / can overflow.
    if (wrapper && wrapper.scrollWidth > wrapper.clientWidth + 1) return wrapper;
    if (table && table.scrollWidth > table.clientWidth + 1) return table;
    return wrapper || table || null;
  }

  function findBestCandidate() {
    const wrappers = Array.from(document.querySelectorAll(".table-wrapper"));
    const viewportH = window.innerHeight;

    // Normal Datasette pages: wrappers exist
    const candidates = wrappers
      .map((w) => {
        const t = w.querySelector("table.rows-and-columns") || w.querySelector("table");
        if (!t) return null;

        const sc = pickScrollEl(w, t);
        if (!sc) return null;

        const overflow = sc.scrollWidth - sc.clientWidth;
        if (overflow <= 1) return null;

        const rect = w.getBoundingClientRect();
        const visible = rect.bottom > 0 && rect.top < viewportH;

        // Prefer visible, then largest overflow, then closest to bottom
        const distanceToBottom = Math.abs(viewportH - rect.bottom);

        return { wrapper: w, table: t, scroller: sc, visible, overflow, distanceToBottom };
      })
      .filter(Boolean);

    if (candidates.length) {
      candidates.sort((a, b) => {
        if (a.visible !== b.visible) return (b.visible ? 1 : 0) - (a.visible ? 1 : 0);
        if (b.overflow !== a.overflow) return b.overflow - a.overflow;
        return a.distanceToBottom - b.distanceToBottom;
      });
      return candidates[0];
    }

    // Fallback: no wrappers found (rare/custom templates)
    const t = document.querySelector("table.rows-and-columns") || document.querySelector("table");
    if (!t) return null;

    const overflow = t.scrollWidth - t.clientWidth;
    if (overflow <= 1) return null;

    return { wrapper: null, table: t, scroller: t, visible: true, overflow, distanceToBottom: 0 };
  }

  function update() {
    const best = findBestCandidate();

    if (!best) {
      if (proxy) proxy.style.display = "none";
      detachActiveScrollListener();
      geomEl = null;
      scrollEl = null;
      return;
    }

    ensureProxy();
    proxy.style.display = "";

    // Geometry element: align to wrapper (vanilla look), else scroller
    geomEl = best.wrapper || best.scroller;
    scrollEl = best.scroller;

    // Keep proxy aligned to the table area
    const rect = geomEl.getBoundingClientRect();
    proxy.style.left = rect.left + "px";
    proxy.style.width = rect.width + "px";

    // The spacer width drives the native scrollbar range
    spacer.style.width = scrollEl.scrollWidth + "px";

    // Sync scroll positions both ways
    attachActiveScrollListener(scrollEl);

    if (!syncing) {
      syncing = true;
      proxy.scrollLeft = scrollEl.scrollLeft;
      syncing = false;
    }
  }

  function init() {
    // Run often enough to handle page changes, but not expensive
    update();
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("scroll", update, { passive: true });

    // Keep up with dynamic table loads / query navigation
    setInterval(update, 200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
