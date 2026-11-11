---
title: "Forum API"
section: "reference"
slug: "forum-bff"
summary: "The only path to phpBB. No browser or gateway reaches it directly."
---

The forum API is the only way into phpBB. No browser and no gateway route reaches phpBB
directly: the [forum web app](/reference/forum-ui) talks to this service, and this
service talks to phpBB through the [forum phpBB extension](/reference/forum-api). It
keeps a small Postgres database of its own.

## Where it runs

In the backend namespace, behind the gateway, at `/bff/forum/`.

## Who can use it

Members with the forum role. Each operation then checks the role it needs, and the
privileged ones ask for a second sign-in factor.

## Settings

| Variable | What it does |
|---|---|
| `CASDOOR_ISSUER_URI`, `CASDOOR_JWKS_URI` | The Casdoor whose tokens it accepts. |
| `SPRING_R2DBC_URL`, `SPRING_LIQUIBASE_URL` | Its Postgres database. |
| `PHPBB_ENABLED` | Connects it to a real phpBB. Default `false`. |

## More detail

The [`hugmesh-forum-bff-api` README](https://github.com/hugmesh/hugmesh-forum-bff-api/blob/main/README.md) has the architecture, the full API and how to build and test it.
