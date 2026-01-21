# datasette-horizontal-scroll

[![PyPI](https://img.shields.io/pypi/v/datasette-horizontal-scroll.svg)](https://pypi.org/project/datasette-horizontal-scroll/)
[![Changelog](https://img.shields.io/github/v/release/rayvoelker/datasette-horizontal-scroll?include_prereleases&label=changelog)](https://github.com/rayvoelker/datasette-horizontal-scroll/releases)
[![Tests](https://github.com/rayvoelker/datasette-horizontal-scroll/actions/workflows/test.yml/badge.svg)](https://github.com/rayvoelker/datasette-horizontal-scroll/actions/workflows/test.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](https://github.com/rayvoelker/datasette-horizontal-scroll/blob/main/LICENSE)

A Datasette plugin that adds a fixed horizontal scrollbar at the bottom of the viewport when a visible results table is wider than the screen. This makes it easier to horizontally navigate wide tables without needing to hit the native scrollbar on the table itself.

![View port with horizontal scroll](image.png)

## Installation

Install this plugin in the same environment as Datasette.

```bash
datasette install datasette-horizontal-scroll
```

## Usage

Install the plugin and reload Datasette. On table, query, database, and row views, a bottom-of-viewport scrollbar will appear when the active table overflows horizontally.

This plugin serves its assets as packaged static files (CSS/JS) under Datasette's `/-/static-plugins/` mechanism.

## Development

To set up this plugin locally, first checkout the code. You can confirm it is available like this:
```bash
cd datasette-horizontal-scroll
# Confirm the plugin is visible
uv run datasette plugins
```
To run the tests:
```bash
uv run pytest
```
