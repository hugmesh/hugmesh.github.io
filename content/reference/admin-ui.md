---
title: "Admin console"
section: "reference"
slug: "admin-ui"
summary: "The admin console, loaded by the host shell."
---

The admin console is where admins run a domain. It holds no power of its own: every
change goes through the [admin API](/reference/admin-bff), which checks the admin's
roles again.

Its screens cover, among others:

- who may register, and namespace access grants;
- granting and revoking roles, suspending or banning access, and keeping a member's
  social accounts local-only;
- the gateways' route access rules and route definitions;
- backups and restores, including cloud backups;
- announcements, per-domain themes, and appeals against moderation decisions;
- the ArgoCD dashboard, usage figures and test reports.

## Where it appears

The host shell mounts it at `/admin`.

## Who can open it

Members with the `admin` role. Some screens are for `superadmin` only.

## More detail

The [`hugmesh-admin-ui` README](https://github.com/hugmesh/hugmesh-admin-ui/blob/main/README.md) has the architecture, the full API and how to build and test it.
