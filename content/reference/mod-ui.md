---
title: "Moderator console"
section: "reference"
slug: "mod-ui"
summary: "Moderation queue, findings, bans, domain lock and the audit trail."
---

The moderator console is where moderators work through reports. It has the moderation
queue, a queue of findings raised automatically, controls to ban a member, block them
across the server or keep their social accounts local-only, and the audit trail of every
action.

It does less than the [admin console](/reference/admin-ui) on purpose. A moderator
cannot remove a member; they can ask an admin to.

## Where it appears

The host shell mounts it at `/mod`, with the moderation console at `/mod/console` and
the findings queue at `/mod/findings`.

## Who can open it

Members with the `mod`, `admin` or `superadmin` role.

## What it talks to

The [moderator API](/reference/mod-bff), which checks every action again.

## More detail

The [`hugmesh-mod-ui` README](https://github.com/hugmesh/hugmesh-mod-ui/blob/main/README.md) has the architecture, the full API and how to build and test it.
