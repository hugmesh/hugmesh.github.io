---
title: "Wiki web app"
section: "reference"
slug: "wiki-ui"
summary: "The wiki and who may read it. Admins, and moderators with the wiki role, can open it."
---

The wiki web app is where the wiki is read and written, and where access to it is
managed. Admins can grant, time out or ban a member's wiki access, per domain, and a
superadmin can manage access across all domains.

## Where it appears

The host shell mounts it at `/wiki` and lists it in its menu for members who can open
it.

## Who can open it

The gateway lets through members with the `wiki` role. Inside, reading needs `admin` or
`superadmin`, or `mod` together with `wiki`.

## Settings

None are required. Its optional settings are listed in the README.

## What it talks to

The [wiki API](/reference/wiki-bff).

## More detail

The [`hugmesh-wiki-ui` README](https://github.com/hugmesh/hugmesh-wiki-ui/blob/main/README.md) has the architecture, the full API and how to build and test it.
