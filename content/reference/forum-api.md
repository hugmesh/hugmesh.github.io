---
title: "Forum phpBB extension"
section: "reference"
slug: "forum-api"
summary: "A phpBB extension that adds the routes the forum API calls."
---

phpBB has no REST API, so this phpBB extension adds one for the
[forum API](/reference/forum-bff) to call. Its routes are under `/api/v1/hugmesh/`.

It checks the caller's Casdoor token itself and works out their permissions on the
server. Reads and writes go through phpBB's own functions, so phpBB's permission checks
always apply, and the database schema stays phpBB's. Role names in the token become
roles here; any attempt to smuggle in a role through another claim is dropped.

## Where it runs

Inside phpBB, installed at `ext/hugmesh/forumapi/`. The cluster's phpBB image has it
built in.

## Who can use it

The forum API, on behalf of a signed-in member. Admin routes need the admin role. The
route that sends a private message from the system account accepts only the `system`
role.

## Settings

| Variable | What it does |
|---|---|
| `HUGMESH_JWT_ISSUER` | The Casdoor issuer to accept. Required. |
| `HUGMESH_JWKS_URI` | Where to fetch the issuer's signing keys. |
| `HUGMESH_JWT_AUDIENCE` | An audience to require. Optional. |

## More detail

The [`hugmesh-forum-api` README](https://github.com/hugmesh/hugmesh-forum-api/blob/main/README.md) has the architecture, the full API and how to build and test it.
