# transport · the moving dot

The professional transport hub of [themovingdot.com](https://themovingdot.com) —
surveys, traffic analysis, and living maps of how cities move.

The hero is an interactive Three.js globe: a dot-matrix Earth with the global
route network, where clicking any of 45 major cities dives down to street
level — real coastlines and lakes (Natural Earth 10m), with the city's moving
dots scattered inside its true urban footprint.

## Structure

```
index.html              the page
assets/globe.js         the globe scene (ES module)
assets/city-shapes.js   baked geometry: city footprints, coastlines, lakes
assets/three.module.min.js  three.js r169, vendored
assets/theme.js         light/dark toggle
```

Everything is static and self-contained — no build step, no API keys.

## Develop

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

(A server is needed because the globe loads as an ES module.)

## Deploy

Cloudflare Pages → Create project → connect this repo → no build command,
output directory `/`. Point a custom domain (e.g. transport.themovingdot.com
or themovingdot.com/transport via a proxy rule) when ready.

## Data sources

City footprints, land, coastlines and lakes derive from
[Natural Earth](https://www.naturalearthdata.com/) (public domain), processed
into `assets/city-shapes.js`.
