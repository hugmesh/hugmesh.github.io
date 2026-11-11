---
title: "Live streaming API (Owncast)"
section: "reference"
slug: "owncast-bff"
summary: "Who may broadcast on Owncast."
---

The live streaming API decides who may broadcast on Owncast. It carries no video. It
holds the grants, timeouts and bans, each streamer's public or private setting, and the
moderation actions. The default answer is no: broadcasting needs a grant, and no role
gives it on its own.

## Where it runs

In the backend namespace, behind the gateway, at `/bff/owncast/`.

## Who can use it

| Path | Who | What |
|---|---|---|
| `/bff/owncast/user/stream` | members with the `owncast` role | their own stream's details and visibility |
| `/bff/owncast/mod` | moderators | list, hide, ban and restore streams |
| `/bff/owncast/admin/access` | `admin`, `superadmin` | grant, time out, ban, restore |
| `/bff/owncast/superadmin/access` | `superadmin` | every grant, with its history |

## More detail

The [`hugmesh-owncast-bff-api` README](https://github.com/hugmesh/hugmesh-owncast-bff-api/blob/main/README.md) has the architecture, the full API and how to build and test it.
