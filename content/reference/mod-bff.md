---
title: "Moderator API"
section: "reference"
slug: "mod-bff"
summary: "The moderator API, a deliberately narrow version of the admin API."
---

The moderator API is the back end of the [moderator console](/reference/mod-ui), and a
deliberately narrow version of the [admin API](/reference/admin-bff). A moderator can
triage reports, record a recommendation, escalate to an admin, block a member across the
server, ban a member's access and keep a member's social accounts local-only.

It has no infrastructure or server admin controls, and it cannot remove a member: a
moderator can request a removal, and only an admin can grant it. Findings raised
automatically, for example by the edge AI node, arrive in their own queue here.

## Where it runs

In the backend namespace, behind the gateway, at `/bff/mod/`.

## Who can use it

Members with the `mod` or `admin` role; `superadmin` passes too. A moderator cannot act
on themselves, on another moderator or admin, or on a member outside their own domain.

## More detail

The [`hugmesh-mod-bff-api` README](https://github.com/hugmesh/hugmesh-mod-bff-api/blob/main/README.md) has the architecture, the full API and how to build and test it.
