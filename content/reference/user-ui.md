---
title: "User console"
section: "reference"
slug: "user-ui"
summary: "Where members edit their profile, avatar and mini-cards."
---

The user console is where a signed-in member looks after their own account: their
profile and avatar, their cards (small pages they publish, run in a sandbox), their block
list and who can see them, the outside apps connected to their account, and their
notifications. It works on the member's own account and no one else's.

## Where it appears

It is the member's home in the host shell. The first view is a getting-started guide;
the others are the profile editor, the card manager and the block list, among others.

## Who can open it

Any signed-in member. The connected-apps view also needs a Matrix or fediverse client
role; without one, it says so instead of showing the list.

## What it talks to

Everything it does goes through the [User API](/reference/user-bff), which checks on
every request that the member owns what they are changing.

## More detail

The [`hugmesh-user-ui` README](https://github.com/hugmesh/hugmesh-user-ui/blob/main/README.md) has the architecture, the full API and how to build and test it.
