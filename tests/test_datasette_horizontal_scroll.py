from datasette.app import Datasette
import pytest


PLUGIN_NAME = "datasette-horizontal-scroll"
CSS_PATH = f"/-/static-plugins/{PLUGIN_NAME}/datasette_horizontal_scroll.css"
JS_PATH = f"/-/static-plugins/{PLUGIN_NAME}/datasette_horizontal_scroll.js"


@pytest.mark.asyncio
async def test_plugin_is_installed():
    datasette = Datasette(memory=True)
    response = await datasette.client.get("/-/plugins.json")
    assert response.status_code == 200
    installed_plugins = {p["name"] for p in response.json()}
    assert PLUGIN_NAME in installed_plugins


@pytest.mark.asyncio
async def test_static_assets_are_served():
    datasette = Datasette(memory=True)

    css = await datasette.client.get(CSS_PATH)
    assert css.status_code == 200
    assert "datasette-horizontal-scroll-bar" in css.text

    js = await datasette.client.get(JS_PATH)
    assert js.status_code == 200
    assert "datasette-horizontal-scroll-bar" in js.text


@pytest.mark.asyncio
async def test_assets_are_injected_on_query_page():
    datasette = Datasette(memory=True)
    response = await datasette.client.get("/_memory?sql=SELECT+1+as+col1,+2+as+col2")
    assert response.status_code == 200
    html = response.text

    # For modular assets, HTML should reference our static plugin assets
    assert CSS_PATH in html
    assert JS_PATH in html


@pytest.mark.asyncio
async def test_no_assets_on_homepage():
    datasette = Datasette(memory=True)
    response = await datasette.client.get("/")
    assert response.status_code == 200
    html = response.text

    assert CSS_PATH not in html
    assert JS_PATH not in html
