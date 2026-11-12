---
title: "Forum web app"
section: "reference"
slug: "forum-ui"
summary: "The forum, backed by a headless phpBB."
---

The forum web app is the whole forum members see: the index, categories, topics, new
topics, member profiles and a moderation page. It has no search yet. It runs on top of phpBB, but no
phpBB page, admin panel or login form ever reaches the browser; phpBB stays on the
server behind the [forum API](/reference/forum-bff). The forum is on by default.

## Where it appears

The host shell mounts it at `/social/forum`.

## Who can open it

Members with the `forum` role, and admins. The moderation page is for admins and for
moderators who also hold the `forum` role, and moderation actions ask for a second
sign-in factor.

## More detail

For how it is put together and how to build and test it, see the [`hugmesh-forum-ui` README](https://github.com/hugmesh/hugmesh-forum-ui/blob/main/README.md).
