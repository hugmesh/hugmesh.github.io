---
title: "Video API (LocalTube)"
section: "reference"
slug: "tube-bff"
summary: "Who may use LocalTube, and how it is controlled."
---

The video API decides who may use LocalTube, and controls it. It never handles a video
file itself. It covers:

- access: an admin grants, times out or bans a member's use, and the default is no;
- connecting a member's Google account and syncing their YouTube subscriptions;
- the download queue and each member's storage budget;
- short-lived signed links, so only a video's owner can watch it.

The download worker script is in the repository, but the scheduled job that would run it
against the queue is not built yet, so downloads do not run on their own.

## Where it runs

In the backend namespace, behind the gateway, at `/bff/tube/`.

## Who can use it

Members with the `tube` role. Access controls need `admin` or `superadmin`.

## More detail

The [`hugmesh-tube-bff-api` README](https://github.com/hugmesh/hugmesh-tube-bff-api/blob/main/README.md) has the architecture, the full API and how to build and test it.
