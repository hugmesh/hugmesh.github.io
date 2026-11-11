---
title: "Fediverse web app (Mastodon and Akkoma)"
section: "reference"
slug: "mastodon-ui"
summary: "A fediverse client for the mesh's Mastodon or Akkoma server."
---

The fediverse web app is the mesh's client for its fediverse server. It speaks the
Mastodon client API, so it works with either server: a cluster runs Akkoma, and the
local Docker stack can run Mastodon or Akkoma.

Members post, follow and reply across the fediverse. Moderation actions appear in tiers
by role, and an admin can keep a member's fediverse account local-only. Images a member
uploads can pass through the optional
[AI cloak](/developer-guide/media-poisoner-worker) first.

## Where it appears

The host shell mounts it at `/social/mastodon`.

## Who can open it

Signed-in members who also hold the fediverse role (`mastodon`).

## More detail

The [`hugmesh-mastodon-ui` README](https://github.com/hugmesh/hugmesh-mastodon-ui/blob/main/README.md) has the architecture, the full API and how to build and test it.
