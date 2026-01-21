# ----------------------------------------------------------------------------
# Datasette Horizontal Scroll
# ----------------------------------------------------------------------------
# Injects a fixed horizontal scrollbar at the bottom of the viewport when a
# visible Datasette table overflows horizontally.
#
# Features:
# - Thumb size proportional to visible width vs total table width
# - Thumb position synchronized with table wrapper scrollLeft
# - Click track to jump; drag thumb to scroll
# - Robust to resize / layout changes via ResizeObserver (if available)
# - Defensive against multiple init runs (dedupes style + bar element)
# ----------------------------------------------------------------------------

from datasette import hookimpl

# Datasette serves plugin static assets under:
#   /-/static-plugins/<plugin-name>/<file>
# The <plugin-name> is the installed plugin name as reported by:
#   python -m datasette plugins --all
#
# For this project, the installed plugin name is the same as the PyPI package
# name: "datasette-horizontal-scroll".
PLUGIN_NAME = "datasette-horizontal-scroll"

@hookimpl
def extra_css_urls(datasette, view_name, **_):
    if view_name in ("table", "query", "database", "row"):
        return [datasette.urls.static_plugins(PLUGIN_NAME, "datasette_horizontal_scroll.css")]
    return []

@hookimpl
def extra_js_urls(datasette, view_name, **_):
    if view_name in ("table", "query", "database", "row"):
        return [datasette.urls.static_plugins(PLUGIN_NAME, "datasette_horizontal_scroll.js")]
    return []