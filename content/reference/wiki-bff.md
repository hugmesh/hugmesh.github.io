---
title: "Wiki API"
section: "reference"
slug: "wiki-bff"
summary: "The wiki's write path and content store."
---

The wiki API is the wiki's write path. It owns the Postgres store authors write to,
decides who may read and edit, and turns Markdown into HTML when a page is saved. Pages
are drafts until an admin publishes them. Serving the published pages read-only through
Kiwix is planned, not built.

## Where it runs

In the backend namespace, behind the gateway, at `/bff/wiki/`.

## Who can use it

The gateway requires the `wiki` role. Reading then needs `admin` or `superadmin`, or
`mod` together with `wiki`. Paths under `/bff/wiki/admin/` need `admin`, and under
`/bff/wiki/superadmin/` need `superadmin`.

## Settings

A mesh that serves several brands needs two settings, in order:
`APP_TENANCY_ISSUERS` switches it on, and
`SPRING_LIQUIBASE_PARAMETERS_WIKI_RESTAMP_TARGET_DOMAIN` must then stay set for good.
Read the cut-over steps in the README before changing either.

## More detail

The [`hugmesh-wiki-bff-api` README](https://github.com/hugmesh/hugmesh-wiki-bff-api/blob/main/README.md) has the architecture, the full API and how to build and test it.
