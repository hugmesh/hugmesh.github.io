---
title: "Character forge (3D)"
section: "reference"
slug: "character-forge-bff"
summary: "Map a 2D visual-novel character onto a 3D character."
---

Character Forge turns a member's 2D visual-novel character into a 3D one. The member
picks a character from a card pack, maps it onto an adjustable 3D figure, edits it in a
Godot maker, and marks one character as active. The *Shadows of the Net* chat room then
dresses them in it.

The repository holds the API, its web app, and the pipeline that builds the 3D model
packs. The Godot maker itself now lives in `hugmesh-games` and is a game in the
[Game Studio](/games/overview) catalog. The models' licences are listed on
[Third-party assets and licences](/reference/third-party-licences).

## Where it runs

In the backend namespace, behind the frontend gateway, at `/bff/character-forge/`.

## Who can use it

Any signed-in member, for their own characters.

## Settings

| Variable | What it does |
|---|---|
| `CASDOOR_ISSUER_URI`, `CASDOOR_JWKS_URI` | The Casdoor whose tokens it accepts. |
| `APP_TENANCY_ISSUERS` | Turns on serving several brands, as `issuer=domain` pairs. |
| `SPRING_R2DBC_URL` | Its Postgres database. |

## More detail

The [`hugmesh-character-forge-bff-api` README](https://github.com/hugmesh/hugmesh-character-forge-bff-api/blob/main/README.md) has the architecture, the full API and how to build and test it.
