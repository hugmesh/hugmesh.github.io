---
title: "User API"
section: "reference"
slug: "user-bff"
summary: "The API behind the user console, for any signed-in user."
---

The user API is the back end for the [user console](/reference/user-ui) and for signing
in. Every path it serves is under `/bff/user/`, and every one checks that the signed-in
member owns what they ask for: profile, preferences, cards, blocks, connected apps,
sign-in sessions, media and notifications, including a live notification stream.

It also runs sign-in itself. The [sign-in web app](/reference/login-ui) posts the
member's username and password to `/bff/login`. This service signs them in with Casdoor
on the server, keeps the resulting token on the server, and gives the browser only a
session cookie. It also creates a member's Matrix and fediverse accounts.

It reads the member's cards from the federation API, and account data from the
[admin API](/reference/admin-bff) over an internal, mutually authenticated connection.

## Where it runs

In the backend namespace, behind the gateway. It is never reachable from outside
directly.

## Who can use it

Any signed-in member, for their own data. Paths under `/bff/user/internal/` are for other
services only. Creating a Matrix account needs the Matrix role, and a fediverse account
the fediverse role.

## Settings

The generator's cluster manifests set these. Sign-in through this service needs
`APP_BFF_OIDC_ENABLED=true`, `APP_BFF_OIDC_LOGIN_BASE` (the cluster's Casdoor),
`APP_BFF_CUSTODY_KEY` (the key that protects stored tokens, from a Kubernetes Secret)
and `INTERNAL_TOKEN`.

## More detail

The [`hugmesh-user-bff-api` README](https://github.com/hugmesh/hugmesh-user-bff-api/blob/main/README.md) has the architecture, the full API and how to build and test it.
