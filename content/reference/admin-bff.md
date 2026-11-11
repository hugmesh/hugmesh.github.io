---
title: "Admin API"
section: "reference"
slug: "admin-bff"
summary: "The API behind the admin console: the platform's control plane."
---

The admin API is the platform's control plane and the back end of the
[admin console](/reference/admin-ui). It owns:

- the registration allowlist (Google, Discord and admin invitations) and per-user
  namespace grants, written through to Casdoor;
- the account and session store that sign-in reads and writes;
- the Matrix and fediverse service tokens, so no web page ever holds a server admin
  credential;
- the gateways' route access rules ([Route access control](/architecture/route-access-control));
- bans, timed suspensions and domain locks;
- default roles for members who sign in through an outside provider;
- the superadmin service catalog and Service Store
  ([Service catalog console](/reference/service-catalog-ui));
- the backup and restore jobs ([Backup and restore jobs](/operations/backup-recovery-worker)).

## Where it runs

In the backend namespace, behind the gateways. Its paths are under `/bff/admin/` and
`/bff/superadmin/`.

## Who can use it

Admins, for their own domain. Paths under `/bff/superadmin/` need `superadmin`.

## Settings

Every outside integration is off by default.

| Variable | What it does |
|---|---|
| `CASDOOR_ISSUER_URI` | The Casdoor address whose tokens it accepts. |
| `SPRING_R2DBC_URL`, `SPRING_LIQUIBASE_URL` | Its Postgres database. |
| `CLICKHOUSE_URL`, `APP_KAFKA_ENABLED` | The usage figures store and event bus. |
| `CASDOOR_ADMIN_ENABLED`, `PKI_GATEWAY_BASE` | Writing users and roles to Casdoor, through the identity gateway. |

## More detail

The [`hugmesh-admin-bff-api` README](https://github.com/hugmesh/hugmesh-admin-bff-api/blob/main/README.md) has the architecture, the full API and how to build and test it.
