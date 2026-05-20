# Software Requirements Specification (SRS)
## WUD — "What U Doing?"

| Field | Value |
|---|---|
| Document version | 1.0 |
| Date | 2026-05-18 |
| Status | Draft for review |
| Product | WUD — friends-only spontaneous-plans social app |
| Prepared for | Engineering, Product, QA |
| Standard basis | ISO/IEC/IEEE 29148:2018 |

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Overall Description](#2-overall-description)
3. [System Architecture](#3-system-architecture)
4. [Data Model](#4-data-model)
5. [Functional Requirements](#5-functional-requirements)
6. [External Interface Requirements (API)](#6-external-interface-requirements-api)
7. [Real-Time & Messaging Requirements](#7-real-time--messaging-requirements)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [Security & Privacy Requirements](#9-security--privacy-requirements)
10. [Backend Services To Be Implemented](#10-backend-services-to-be-implemented)
11. [Implementation Roadmap](#11-implementation-roadmap)
12. [Acceptance Criteria & Traceability](#12-acceptance-criteria--traceability)
13. [Appendices](#13-appendices)

---

## 1. Introduction

### 1.1 Purpose

This document specifies the complete software requirements for **WUD ("What U Doing?")**, a mobile-first social application for coordinating spontaneous, friends-only hangouts. It covers:

- The full product behavior expected of the shipping application.
- The **current state**: a functional, animated front-end prototype with an in-memory data layer (no server).
- The **target state**: a production system backed by real services, persistence, real-time infrastructure, authentication, and push notifications.

The document explicitly distinguishes **implemented** behavior from **to-be-implemented** behavior so it can drive backend and infrastructure work directly.

### 1.2 Scope

WUD lets a user broadcast what they are about to do ("Going surfing in 30 min"), see a feed of what friends and friends-of-friends are doing, join those plans, coordinate via per-plan chat, broadcast "pings" to the squad, and share a live "right now" status.

**In scope:**
- Native-feel mobile client (currently a React/TypeScript PWA-style prototype).
- Backend API, database, real-time messaging, media storage, push notifications.
- OAuth + email authentication and account lifecycle.
- Social graph (friends, squads), activities, RSVPs, chat, polls, reactions, live presence, discovery, reminders.

**Out of scope (v1):**
- Public/discoverable events beyond the friend graph.
- Payments, ticketing, or monetization.
- Web/desktop clients (architecture must not preclude them).
- Calendar provider sync (deferred; see §11).
- Machine-learning recommendation models (heuristic suggestions only in v1).

### 1.3 Definitions, Acronyms, Abbreviations

| Term | Meaning |
|---|---|
| **Activity / Plan** | A thing a user is doing or about to do, posted to the app. |
| **Host** | The user who created an activity (or who accepted host transfer). |
| **Joiner** | A user with a `going` RSVP on an activity. |
| **RSVP** | A user's response to an activity: `going`, `maybe`, `cant`, or `none`. |
| **FoF** | Friend-of-friend. A non-friend made visible because a mutual friend joined a plan. |
| **Squad** | A named, host-owned subset of a user's friends. |
| **Ping** | A lightweight broadcast notification ("I'm bored", "WUD?"). |
| **Live status / Now mode** | An ephemeral, auto-expiring "what I'm doing right now" status. |
| **Open invite** | An activity visible to all friends (+ FoF), in addition to any tagged squads. |
| **Host transfer** | Reassignment of host when the current host leaves. |
| APNs / FCM | Apple Push Notification service / Firebase Cloud Messaging. |
| JWT | JSON Web Token. |
| TTL | Time to live. |
| SRS | Software Requirements Specification. |
| FR / NFR | Functional Requirement / Non-Functional Requirement. |

### 1.4 References

- ISO/IEC/IEEE 29148:2018 — Requirements engineering.
- OAuth 2.0 (RFC 6749), PKCE (RFC 7636), OpenID Connect Core 1.0.
- Apple "Sign in with Apple" REST API; Google Identity Services; Facebook Login.
- APNs (Apple) and FCM (Google) push notification specifications.
- Project source: this repository (`/src`), TypeScript domain model in `src/types.ts`, client state in `src/store.ts`.

### 1.5 Document Overview

Sections 2–4 describe the system, architecture, and data model. Section 5 enumerates functional requirements with stable IDs. Sections 6–7 define the API and real-time contracts. Sections 8–9 cover quality and security. Section 10 details the backend that must be built. Section 11 is the phased roadmap. Section 12 maps requirements to acceptance tests.

---

## 2. Overall Description

### 2.1 Product Perspective

WUD is a **new, self-contained product**. The current repository contains a complete, interactive **front-end prototype**:

- **Stack:** Vite + React 19 + TypeScript, TailwindCSS v3, Zustand (state), Framer Motion (animation), canvas-confetti, lucide-react.
- **Data layer:** a single in-memory Zustand store (`src/store.ts`). Seed data lives in `src/data/seed.ts` and is loaded **only** by the admin/demo login. A real sign-up starts with an empty account.
- **Persistence:** none. State resets on page reload.
- **Networking:** none. All "actions" mutate local state synchronously.

The target product keeps this client (evolving it toward React Native or a packaged PWA) and adds a **server tier**: API gateway, domain services, database, cache, real-time gateway, object storage, and push infrastructure.

```
┌────────────────────────────────────────────────────────────────┐
│  CURRENT STATE (implemented)                                     │
│  React client  ──►  Zustand in-memory store  ──►  seed data      │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  TARGET STATE (to be implemented)                                │
│  Client  ──HTTPS──►  API Gateway  ──►  Domain Services           │
│     │                                   │                       │
│     └──────WSS───►  Realtime Gateway     ├─► PostgreSQL          │
│                                          ├─► Redis (cache/pub-sub)│
│                                          ├─► Object Storage (S3) │
│                                          └─► Push (APNs/FCM)     │
└────────────────────────────────────────────────────────────────┘
```

### 2.2 Product Functions (summary)

| Area | Capability |
|---|---|
| Auth | Splash → Welcome → Sign up (Google/Apple/Facebook/email) → Onboarding → App; Log in; Admin demo login; Sign out. |
| Feed | Chronological list of visible plans; scope toggle (Friends / +FoF); discovery filters; trending; smart suggestions; map view. |
| Activities | Create (category incl. custom, time, place, notes, banner image, max size, recurrence, multi-squad + open-invite audience); join/maybe/can't; host transfer; "over" lifecycle. |
| Engagement | Emoji reactions; per-activity chat (text, photos, polls). |
| Presence | Live "Now" status with place, duration, open-to-join. |
| Social graph | Friends (add/remove/discover); squads (create/edit/delete, host & member roles, add/remove/leave, squad chat, squad plans/history). |
| Broadcast | Pings to all friends, selected friends, or a squad. |
| Notifications | Joins, host offers/transfers, pings, reminders; in-app inbox; (target) push. |
| Profile | Avatar (emoji or photo), color, name, handle, stats, history. |
| Settings | Notification toggles, privacy, appearance, default reminder lead time. |
| Discovery | Global search (plans/people/categories); feed filters; trending; "for you" suggestions. |

### 2.3 User Classes and Characteristics

| User class | Description | Key needs |
|---|---|---|
| **End user (member)** | Primary user. Posts plans, joins, chats, pings. Mobile-first, expects instant feedback. | Speed, low friction, real-time updates, reliable notifications. |
| **Host** | A member hosting a plan or owning a squad. | Control over the plan/squad, transfer/leave flows. |
| **New user** | Just signed up, empty account. | Smooth onboarding, friend discovery, clear empty states. |
| **Admin / internal** | Demo and support staff. | Demo login with sample data; (target) moderation & support tooling. |
| **System actors** | Scheduler (reminders, recurrence, live-status expiry), push dispatcher. | Reliable background execution. |

### 2.4 Operating Environment

- **Client (current):** Modern evergreen browsers; rendered inside a phone-frame for desktop preview; responsive to true mobile viewport.
- **Client (target):** iOS 16+ and Android 11+ (React Native or packaged PWA). Architecture must remain client-agnostic via a versioned HTTP/WebSocket API.
- **Server (target):** Linux containers orchestrated by Kubernetes (or equivalent); PostgreSQL 15+; Redis 7+; S3-compatible object storage; CDN.

### 2.5 Design and Implementation Constraints

- **DC-1** The API must be versioned (`/v1/…`) and backward-compatible within a major version.
- **DC-2** All client↔server traffic over TLS 1.2+.
- **DC-3** The domain model defined in `src/types.ts` is the canonical client contract; server schemas must serialize to it (see §4).
- **DC-4** The client must degrade gracefully offline (read-only cached feed; queued writes — target).
- **DC-5** No personally identifying data in logs or analytics events.
- **DC-6** Media (photos) must never be embedded as data URIs server-side; use object storage + signed URLs. (The prototype uses `blob:`/`picsum.photos` URLs — a known stub.)
- **DC-7** Image uploads limited to common raster formats (JPEG, PNG, WebP, HEIC) and a max size (see NFR-PERF).

### 2.6 Assumptions and Dependencies

- **AS-1** Users authenticate with a Google, Apple, or Facebook account, or email + password.
- **AS-2** Third-party OAuth providers and APNs/FCM are available and reliable.
- **AS-3** Users grant push-notification permission for reminders/pings to be effective; the app remains usable without it.
- **AS-4** Location for the map view is approximate; precise GPS is not required in v1 (see FR-MAP).
- **DEP-1** Push delivery depends on APNs/FCM. **DEP-2** Social login depends on provider SDKs/endpoints. **DEP-3** Media depends on the object-storage provider + CDN.

---

## 3. System Architecture

### 3.1 Current State (implemented — front-end prototype)

| Layer | Implementation | Status |
|---|---|---|
| UI | React components in `src/screens` and `src/components` | ✅ Implemented |
| State | Zustand store `src/store.ts` (single global store) | ✅ Implemented |
| Domain types | `src/types.ts` | ✅ Implemented |
| Seed data | `src/data/seed.ts` (admin/demo only) | ✅ Implemented |
| Animation | Framer Motion, canvas-confetti | ✅ Implemented |
| Persistence | None (in-memory; resets on reload) | ⬜ To be implemented |
| Networking | None (synchronous local mutations) | ⬜ To be implemented |
| Auth | UI flow only; `signUp`/`logIn` create a local user; OAuth buttons are stubs | ⬜ Real auth to be implemented |
| Media | `URL.createObjectURL` blobs / placeholder URLs | ⬜ Real upload to be implemented |
| Push / reminders | `ReminderEngine` polls local state every 30 s and raises in-app toasts | ⬜ Real push to be implemented |

### 3.2 Target Architecture (to be implemented)

A service-oriented backend behind an API gateway:

| Component | Responsibility | Technology (recommended) |
|---|---|---|
| **API Gateway** | TLS termination, routing, auth middleware, rate limiting, request validation | Node.js (NestJS/Fastify) or Go |
| **Auth Service** | OAuth/OIDC, email auth, token issuance/refresh, sessions | Node/Go + provider SDKs |
| **User Service** | Profiles, settings, avatars | Domain service |
| **Social Service** | Friends, friend requests, squads, FoF graph | Domain service |
| **Activity Service** | Activities, RSVPs, host transfer, recurrence, reactions, feed/visibility | Domain service |
| **Chat Service** | Activity & squad messages, photos, polls; emits real-time events | Domain service |
| **Presence Service** | Live status with TTL; presence fan-out | Domain service + Redis |
| **Notification Service** | In-app notifications, pings, push dispatch | Domain service + queue |
| **Discovery Service** | Search, trending, suggestions | Domain service (+ search index) |
| **Media Service** | Upload, transcode/resize, signed URLs | Service + S3 + image pipeline |
| **Realtime Gateway** | WebSocket fan-out for chat/presence/notifications | Dedicated WS service + Redis pub/sub |
| **Scheduler / Workers** | Reminders, recurrence materialization, live-status expiry, push jobs | Queue workers (BullMQ/Sidekiq-equivalent) |
| **PostgreSQL** | System of record | PostgreSQL 15+ |
| **Redis** | Cache, presence, pub/sub, rate-limit counters, job queue | Redis 7+ |
| **Object storage + CDN** | Photos, banners, avatars | S3-compatible + CDN |

> Services may be deployed as a modular monolith initially and split as load demands; the requirement is **logical** separation with clear boundaries, not premature microservices.

### 3.3 Technology Stack Summary

- **Client:** React + TypeScript today; React Native target. State via Zustand; server sync via a data-fetching layer (TanStack Query recommended) + WebSocket client.
- **Backend:** TypeScript (NestJS) or Go; PostgreSQL; Redis; S3-compatible storage; container orchestration.
- **Observability:** structured logging, metrics (Prometheus-style), tracing (OpenTelemetry), error tracking.

---

## 4. Data Model

The canonical client-facing shapes are in `src/types.ts`. The server-side **normalized relational schema** below is what must be implemented. Identifiers are UUIDv7 (time-ordered). All timestamps are UTC `timestamptz`.

### 4.1 Entity overview

```
users ──< friendships >── users
users ──< squad_members >── squads ──< squad_messages
users ──1:N── activities ──< rsvps >── users
activities ──< activity_squads >── squads
activities ──< reactions
activities ──< activity_messages ──< poll_options ──< poll_votes
users ──1:1── live_statuses
users ──< notifications
users ──< devices            (push tokens)
users ──< auth_identities     (OAuth provider links)
```

### 4.2 Tables

**users**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | Display name. |
| handle | citext UNIQUE | `^[a-z0-9_]{2,20}$`. |
| avatar_emoji | text | Fallback emoji avatar. |
| color | text | Gradient token (e.g. `from-rose-400 to-orange-500`). |
| photo_url | text NULL | Object-storage URL; overrides emoji. |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**auth_identities** — one row per linked login method
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users | |
| provider | enum(`google`,`apple`,`facebook`,`email`) | |
| provider_subject | text | Provider's stable user ID; UNIQUE with provider. |
| email | citext NULL | |
| password_hash | text NULL | Argon2id; email provider only. |
| created_at | timestamptz | |

**friendships** — bidirectional friendship, stored once with ordered pair
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_a | uuid FK→users | `user_a < user_b` enforced. |
| user_b | uuid FK→users | |
| created_at | timestamptz | UNIQUE(user_a,user_b). |

**friend_requests**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| requester_id | uuid FK→users | |
| recipient_id | uuid FK→users | |
| status | enum(`pending`,`accepted`,`declined`,`cancelled`) | |
| created_at / resolved_at | timestamptz | |

**squads**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | ≤ 30 chars. |
| emoji | text | |
| host_id | uuid FK→users | Owner. |
| created_at | timestamptz | |

**squad_members**
| Column | Type | Notes |
|---|---|---|
| squad_id | uuid FK→squads | |
| user_id | uuid FK→users | PK(squad_id,user_id). Host is implicit, not a row. |
| joined_at | timestamptz | |

**activities**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| host_id | uuid FK→users | Mutable (host transfer). |
| category | enum | `surf,gym,run,gaming,food,drinks,coffee,study,movie,outdoors,party,other,custom`. |
| custom_emoji | text NULL | When category=`custom`. |
| custom_label | text NULL | When category=`custom`. |
| title | text | |
| description | text | |
| place | text | Free-text place label. |
| lat / lng | double NULL | Real geo (target; prototype uses normalized `mapX/mapY`). |
| starts_at | timestamptz | |
| max_size | int NULL | NULL = unlimited. |
| is_private | boolean | No FoF unlock when true (open-invite plans only). |
| is_open_invite | boolean | Visible to friends/FoF in addition to tagged squads. |
| banner_url | text NULL | Object-storage URL. |
| recurrence | jsonb NULL | `{freq:'daily'}` \| `{freq:'weekly'\|'biweekly',weekday:0-6}`. |
| reminder_lead_minutes | int NULL | Per-plan override; NULL = use user default; `-1`/sentinel = off. |
| created_at / updated_at | timestamptz | |
| dissolved_at | timestamptz NULL | Set when a host leaves with no joiners. |

**activity_squads** — many-to-many activity↔squad tags
| Column | Type | Notes |
|---|---|---|
| activity_id | uuid FK→activities | |
| squad_id | uuid FK→squads | PK(activity_id,squad_id). |

**rsvps**
| Column | Type | Notes |
|---|---|---|
| activity_id | uuid FK→activities | |
| user_id | uuid FK→users | PK(activity_id,user_id). |
| state | enum(`going`,`maybe`,`cant`) | A user appears at most once. Host is not an RSVP row. |
| order_index | int | Join order; drives host-transfer succession. |
| created_at / updated_at | timestamptz | |

**reactions**
| Column | Type | Notes |
|---|---|---|
| activity_id | uuid FK→activities | |
| user_id | uuid FK→users | PK(activity_id,user_id) — one reaction per user. |
| emoji | text | |
| created_at | timestamptz | |

**activity_messages** / **squad_messages** (same shape; separate tables or one polymorphic table)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| activity_id / squad_id | uuid FK | Parent thread. |
| author_id | uuid FK→users NULL | NULL = system message. |
| type | enum(`text`,`photo`,`poll`,`system`) | |
| body | text NULL | Text body or photo caption. |
| photo_url | text NULL | When type=`photo`. |
| created_at | timestamptz | |

**polls** (1:1 with a `poll`-type message)
| Column | Type | Notes |
|---|---|---|
| message_id | uuid PK FK→messages | |
| question | text | |
| closed | boolean | |

**poll_options**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| poll_message_id | uuid FK | |
| label | text | |
| order_index | int | |

**poll_votes**
| Column | Type | Notes |
|---|---|---|
| option_id | uuid FK→poll_options | |
| user_id | uuid FK→users | PK(poll + user) — one vote per poll per user. |
| created_at | timestamptz | |

**live_statuses** — at most one active per user
| Column | Type | Notes |
|---|---|---|
| user_id | uuid PK FK→users | |
| emoji | text | |
| text | text | |
| place | text NULL | |
| open_to_join | boolean | |
| started_at | timestamptz | |
| expires_at | timestamptz | TTL; row is ignored/purged after this. |

**notifications**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users | Recipient. |
| type | enum(`join`,`host_offer`,`host_taken`,`ping`,`invite`,`reminder`) | |
| from_id | uuid FK→users NULL | Actor. |
| activity_id | uuid FK→activities NULL | |
| body | text | Rendered text. |
| read | boolean | |
| resolved | boolean | For actionable types (`host_offer`). |
| created_at | timestamptz | |

**devices** — push registration
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users | |
| platform | enum(`ios`,`android`,`web`) | |
| push_token | text | APNs/FCM token. |
| last_seen_at | timestamptz | |

**user_settings**
| Column | Type | Notes |
|---|---|---|
| user_id | uuid PK FK→users | |
| push_enabled | boolean | |
| pings_enabled | boolean | |
| host_transfer_enabled | boolean | |
| show_me_to_fof | boolean | |
| default_private | boolean | |
| appearance | enum(`system`,`dark`,`light`) | |
| default_reminder_minutes | int NULL | NULL = off. |

### 4.3 Derived / computed data (not stored)

- **Feed visibility** — computed per request (see FR-FEED-02 / §10 Activity Service).
- **FoF set** — computed from `friendships` + RSVPs.
- **Trending / suggestions** — computed (cacheable) from recent activities.
- **"Over" state** — `starts_at < now()`.
- **Recurrence occurrences** — materialized by the scheduler (see FR-ACT-15).

---

## 5. Functional Requirements

Legend: **✅ Implemented** in the prototype (client behavior present) · **⬜ To be implemented** (needs backend/real software) · **◐ Partial** (UI exists, server logic missing).

### 5.1 Authentication & Onboarding (AUTH)

| ID | Requirement | Status |
|---|---|---|
| FR-AUTH-01 | The app shall show an animated splash screen on cold start, then transition to the Welcome screen. | ✅ |
| FR-AUTH-02 | The Welcome screen shall offer "Get started" (sign up) and "Log in". | ✅ |
| FR-AUTH-03 | The Sign-up screen shall offer Continue-with-Google, -Apple, and -Facebook, plus email + password. | ◐ (UI ✅, real OAuth ⬜) |
| FR-AUTH-04 | Sign-up shall proceed to an Onboarding step where the user sets name, handle, avatar emoji, and color. | ✅ |
| FR-AUTH-05 | The system shall create the account on Onboarding completion and enter the app with an **empty** dataset. | ◐ (local ✅, server ⬜) |
| FR-AUTH-06 | Log-in shall accept Google/Apple/Facebook or email + password and enter the app. | ◐ (UI ✅, real auth ⬜) |
| FR-AUTH-07 | The system shall provide an **admin/demo login** that loads the full sample dataset for demonstration. | ✅ |
| FR-AUTH-08 | The system shall validate handle uniqueness and format (`^[a-z0-9_]{2,20}$`). | ⬜ (format ✅ client-side; uniqueness ⬜) |
| FR-AUTH-09 | The system shall issue a short-lived access token and a long-lived refresh token; the client shall transparently refresh. | ⬜ |
| FR-AUTH-10 | Sign-out shall clear the session and return to the Welcome screen. | ◐ (local ✅, token revocation ⬜) |
| FR-AUTH-11 | The system shall support account deletion (erases or anonymizes all personal data). | ⬜ |
| FR-AUTH-12 | OAuth flows shall use Authorization Code + PKCE; the server shall verify provider ID tokens. | ⬜ |
| FR-AUTH-13 | Email passwords shall be hashed with Argon2id; the system shall support password reset by email. | ⬜ |
| FR-AUTH-14 | Multiple auth identities (e.g. Google + email) may link to one account by verified email. | ⬜ |

### 5.2 Feed & Discovery (FEED)

| ID | Requirement | Status |
|---|---|---|
| FR-FEED-01 | The Feed shall list upcoming, visible activities sorted ascending by start time. Past activities are excluded. | ✅ |
| FR-FEED-02 | Visibility: a user can see an activity if they host it, are in any tagged squad, or it is an open invite and they are a friend of the host or (unless `is_private`) a friend has a `going` RSVP (FoF unlock). | ✅ |
| FR-FEED-03 | The Feed shall offer a scope toggle: "Friends only" vs "+ Friends of friends" (shown only when FoF plans exist). | ✅ |
| FR-FEED-04 | The Feed shall offer filter chips: time window (All/Now/Today/Week), "Near me" (distance heuristic), and category. | ✅ |
| FR-FEED-05 | The Feed shall show a "Trending this week" strip of top categories (≥2 plans), linking into the category filter. | ✅ |
| FR-FEED-06 | The Feed shall show up to two "For you" smart suggestions (starting-soon, category cluster, near-me). | ✅ (heuristic) |
| FR-FEED-07 | The Feed shall provide global search across plans, people, and categories. | ✅ (client-side) → ⬜ (server search index for scale) |
| FR-FEED-08 | The Feed shall offer a Map view plotting activities by location, with tappable pins opening the activity. | ✅ (stylized abstract map) → ⬜ (real map + geo) |
| FR-FEED-09 | The Feed shall present a distinct empty state when no plans exist and when filters match nothing. | ✅ |
| FR-FEED-10 | The Feed shall update in near-real-time as visible activities/RSVPs change. | ⬜ |

### 5.3 Activities (ACT)

| ID | Requirement | Status |
|---|---|---|
| FR-ACT-01 | A user shall create an activity with: category (incl. custom emoji+label), title, day+time, place, optional notes, optional banner image, optional max party size. | ✅ |
| FR-ACT-02 | A user shall choose an audience: "All friends" (open invite) and/or any number of squads, in any combination. | ✅ |
| FR-ACT-03 | For open-invite plans, the user shall choose visibility: Public (friends + FoF) or Private (direct friends only). | ✅ |
| FR-ACT-04 | A user shall set a recurrence: none, daily, weekly, or biweekly. | ◐ (label/flag ✅; occurrence generation ⬜) |
| FR-ACT-05 | A non-host user shall set their RSVP to Going, Maybe, or Can't, and clear it. | ✅ |
| FR-ACT-06 | Setting Going shall trigger a celebratory animation (confetti). | ✅ |
| FR-ACT-07 | Only `going` RSVPs count toward FoF visibility and the host-transfer succession order. | ✅ |
| FR-ACT-08 | When the host leaves an activity with ≥1 joiner, host shall transfer to the next joiner by join order; that user receives a `host_offer` notification and may accept or decline. | ✅ (auto-promote) → ◐ (offer/accept flow client-only) |
| FR-ACT-09 | When the host leaves with no joiners, the activity shall be dissolved. | ✅ |
| FR-ACT-10 | An activity is "Over" once `starts_at` has passed; join, leave, RSVP changes, and host transfer shall be disabled; the UI shall label it "Over". | ✅ |
| FR-ACT-11 | Past activities the user hosted or joined shall appear in History. | ✅ |
| FR-ACT-12 | An activity may carry one optional banner image replacing the category gradient in card and detail hero. | ◐ (UI ✅, real upload ⬜) |
| FR-ACT-13 | The activity detail shall show RSVP people grouped as Going / Maybe / Can't and the host. | ✅ |
| FR-ACT-14 | Max party size, when set, shall cap `going` RSVPs (Maybe/Can't still allowed when full). | ✅ |
| FR-ACT-15 | Recurring activities shall be materialized into concrete occurrences by a scheduled job; each occurrence is independently joinable. | ⬜ |
| FR-ACT-16 | Activity create/update/RSVP/host-transfer shall be persisted server-side and survive client restart. | ⬜ |
| FR-ACT-17 | The host shall be able to edit or cancel an activity before it starts. | ⬜ (cancel-by-leave exists; explicit edit ⬜) |

### 5.4 Reactions & Chat (CHAT)

| ID | Requirement | Status |
|---|---|---|
| FR-CHAT-01 | Each activity shall have a chat thread; a chat thread is auto-created with the activity. | ✅ |
| FR-CHAT-02 | The host and joiners shall post text messages to the activity chat. | ✅ |
| FR-CHAT-03 | Users shall attach a photo (with optional caption) to a chat message. | ◐ (UI ✅, real upload ⬜) |
| FR-CHAT-04 | Users shall create polls (question + 2–6 options) in chat; each user has one vote, retractable. | ✅ |
| FR-CHAT-05 | Each squad shall have its own chat thread supporting text and photo messages. | ◐ (UI ✅, real upload ⬜) |
| FR-CHAT-06 | Host-transfer and similar lifecycle events shall be recorded as system messages in the relevant chat. | ✅ |
| FR-CHAT-07 | Users shall add/remove one emoji reaction per activity; reactions aggregate by emoji with counts. | ✅ |
| FR-CHAT-08 | Chat messages shall be delivered in real time to all thread participants. | ⬜ |
| FR-CHAT-09 | Chat history shall be paginated and persisted. | ⬜ |
| FR-CHAT-10 | The system shall enforce that only thread participants can read/post (activity: host + RSVP'd users; squad: host + members). | ◐ (client-gated ✅, server enforcement ⬜) |

### 5.5 Live Presence / "Now" Mode (LIVE)

| ID | Requirement | Status |
|---|---|---|
| FR-LIVE-01 | A user shall set a live status: emoji, free text, optional place, "open to join" flag, and duration (1h/2h/4h). | ✅ |
| FR-LIVE-02 | A live status shall auto-expire at its `expires_at`. | ✅ (client time check) → ⬜ (server TTL + purge) |
| FR-LIVE-03 | The Feed shall show a "Live now" strip: the user's own status (or a Go-Live prompt) followed by live friends. | ✅ |
| FR-LIVE-04 | Tapping a live friend shall open a detail sheet with their status, place, time remaining, and join intent. | ✅ |
| FR-LIVE-05 | Live users shall be visually marked (glowing avatar ring) wherever their avatar appears. | ✅ |
| FR-LIVE-06 | Live status changes shall propagate to friends in real time. | ⬜ |

### 5.6 Social Graph — Friends (FRND)

| ID | Requirement | Status |
|---|---|---|
| FR-FRND-01 | A user shall view their friends list. | ✅ |
| FR-FRND-02 | A user shall discover and add other users; a user shall remove a friend (with confirm). | ◐ (UI ✅; real friend requests ⬜) |
| FR-FRND-03 | Friendship shall be **mutual** and require acceptance via a friend-request flow. | ⬜ (prototype adds instantly) |
| FR-FRND-04 | Discovery shall surface FoF and searchable users; results respect privacy settings. | ◐ |
| FR-FRND-05 | Removing a friend shall revoke visibility of squad/private content accordingly. | ⬜ (server recompute) |

### 5.7 Squads (SQD)

| ID | Requirement | Status |
|---|---|---|
| FR-SQD-01 | A user shall create a squad (name, emoji, initial members) and becomes its host. | ✅ |
| FR-SQD-02 | A user shall be a member of squads they did not create. | ✅ |
| FR-SQD-03 | Only the host shall edit name/emoji, add/remove members, and delete the squad. | ✅ (client-enforced) → ⬜ (server-enforced) |
| FR-SQD-04 | A non-host member shall leave a squad without deleting it. | ✅ |
| FR-SQD-05 | A squad detail shall provide tabs: Plans (upcoming), History (past), People, Chat. | ✅ |
| FR-SQD-06 | Activities tagged with a squad shall appear in that squad's Plans/History. | ✅ |
| FR-SQD-07 | Deleting a squad shall untag its activities and remove its chat. | ✅ |
| FR-SQD-08 | All host/member squad mutations shall be persisted and authorization enforced server-side. | ⬜ |

### 5.8 Broadcast / Ping (PING)

| ID | Requirement | Status |
|---|---|---|
| FR-PING-01 | A user shall send a ping to all friends, a selected subset, or a squad. | ✅ |
| FR-PING-02 | The Ping screen shall offer presets ("I'm bored", "WUD tonight?", etc.) and custom text. | ✅ |
| FR-PING-03 | A ping shall create notifications for and (target) push to each recipient. | ◐ (toast only) → ⬜ (real fan-out) |
| FR-PING-04 | Ping recipients shall respect each recipient's "allow pings" setting. | ⬜ |
| FR-PING-05 | The system shall rate-limit pings per sender to prevent spam. | ⬜ |

### 5.9 Notifications & Reminders (NOTIF)

| ID | Requirement | Status |
|---|---|---|
| FR-NOTIF-01 | The app shall maintain an in-app notification inbox (joins, host offers/transfers, pings, reminders). | ✅ |
| FR-NOTIF-02 | A `host_offer` notification shall present Accept / Decline actions. | ✅ |
| FR-NOTIF-03 | Notifications shall show unread state and a tab badge; viewing the inbox marks them read. | ✅ |
| FR-NOTIF-04 | The user shall set a default reminder lead time and override it per activity. | ✅ |
| FR-NOTIF-05 | The system shall fire a reminder before a joined/hosted activity starts. | ◐ (in-app poll every 30 s ✅) → ⬜ (server-scheduled push) |
| FR-NOTIF-06 | Notifications shall be delivered as push notifications when the app is backgrounded/closed. | ⬜ |
| FR-NOTIF-07 | Notification generation shall respect the recipient's notification settings. | ◐ (push toggle respected client-side) → ⬜ |
| FR-NOTIF-08 | At most three transient toasts shall be visible at once (newest wins). | ✅ |

### 5.10 Profile & Settings (PROF)

| ID | Requirement | Status |
|---|---|---|
| FR-PROF-01 | A user shall view their profile: avatar, name, handle, stats (friends, hosting, joined), upcoming plans, friends, squads, history. | ✅ |
| FR-PROF-02 | A user shall edit name, handle, avatar (emoji or uploaded photo), and color. | ◐ (UI ✅; photo upload ⬜) |
| FR-PROF-03 | The user's chosen color shall theme their profile banner and avatars. | ✅ |
| FR-PROF-04 | Settings shall include toggles for push, pings, host-transfer offers, show-me-to-FoF, default-private, appearance, and default reminder time. | ✅ (state) → ⬜ (server persistence + enforcement) |
| FR-PROF-05 | Profile/settings changes shall persist server-side. | ⬜ |

### 5.11 System / Background (SYS)

| ID | Requirement | Status |
|---|---|---|
| FR-SYS-01 | A scheduler shall expire live statuses, fire reminders, and materialize recurrence occurrences. | ⬜ |
| FR-SYS-02 | The system shall transition activities to "Over" deterministically by server time. | ◐ (client derives; server is source of truth ⬜) |
| FR-SYS-03 | The system shall purge or archive data per the retention policy (§9). | ⬜ |
| FR-SYS-04 | The system shall emit audit events for security-relevant actions (login, account deletion, host transfer). | ⬜ |

---

## 6. External Interface Requirements (API)

All endpoints are under `/v1`, require `Authorization: Bearer <access_token>` unless noted, return JSON, and use standard HTTP status codes. Mutations are idempotent where an `Idempotency-Key` header is supplied.

### 6.1 Auth

| Method & Path | Purpose |
|---|---|
| `POST /v1/auth/oauth/{provider}` | Exchange an OAuth authorization code (Google/Apple/Facebook) for WUD tokens; creates the account if new. |
| `POST /v1/auth/email/register` | Email + password registration. |
| `POST /v1/auth/email/login` | Email + password login. |
| `POST /v1/auth/token/refresh` | Exchange a refresh token for a new access token. |
| `POST /v1/auth/logout` | Revoke the current refresh token/session. |
| `POST /v1/auth/password/reset-request` / `…/reset` | Password reset by email. |
| `GET  /v1/auth/handle-available?handle=` | Check handle availability (no auth). |
| `DELETE /v1/account` | Delete the account and all personal data. |

### 6.2 Users & Settings

| Method & Path | Purpose |
|---|---|
| `GET  /v1/me` | Current user profile + settings. |
| `PATCH /v1/me` | Update name/handle/avatar/color. |
| `PATCH /v1/me/settings` | Update settings. |
| `POST /v1/me/avatar` | Upload an avatar photo (multipart) → returns object URL. |
| `GET  /v1/users/{id}` | Public-safe profile of another user. |
| `POST /v1/me/devices` / `DELETE /v1/me/devices/{id}` | Register/unregister a push token. |

### 6.3 Social Graph

| Method & Path | Purpose |
|---|---|
| `GET  /v1/friends` | List friends. |
| `GET  /v1/friends/discover?q=` | Discover users (FoF + search). |
| `POST /v1/friend-requests` | Send a friend request. |
| `POST /v1/friend-requests/{id}/accept` / `…/decline` | Resolve a request. |
| `DELETE /v1/friends/{userId}` | Remove a friend. |
| `GET/POST /v1/squads` | List / create squads. |
| `GET/PATCH/DELETE /v1/squads/{id}` | Read / edit / delete a squad (host only for write). |
| `POST /v1/squads/{id}/members` / `DELETE /v1/squads/{id}/members/{userId}` | Add / remove a member (host only). |
| `POST /v1/squads/{id}/leave` | Leave a squad (member). |

### 6.4 Activities

| Method & Path | Purpose |
|---|---|
| `GET  /v1/feed?scope=&filters=` | Visible feed (paginated, server-computed visibility). |
| `POST /v1/activities` | Create an activity. |
| `GET/PATCH/DELETE /v1/activities/{id}` | Read / edit / cancel an activity. |
| `PUT  /v1/activities/{id}/rsvp` | Set RSVP (`going`/`maybe`/`cant`/`none`). |
| `POST /v1/activities/{id}/leave` | Leave (triggers host transfer if host). |
| `POST /v1/activities/{id}/host-transfer/accept` / `…/decline` | Resolve a host offer. |
| `PUT  /v1/activities/{id}/reaction` / `DELETE …` | Set / clear emoji reaction. |
| `POST /v1/activities/{id}/banner` | Upload a banner image. |
| `GET  /v1/history` | Past activities the user hosted or joined. |
| `GET  /v1/search?q=` | Search plans/people/categories. |
| `GET  /v1/trending` / `GET /v1/suggestions` | Discovery surfaces. |

### 6.5 Chat & Polls

| Method & Path | Purpose |
|---|---|
| `GET  /v1/activities/{id}/messages?before=` | Paginated chat history. |
| `POST /v1/activities/{id}/messages` | Send text/photo message. |
| `POST /v1/activities/{id}/polls` | Create a poll message. |
| `PUT  /v1/polls/{messageId}/vote` | Cast/retract a vote. |
| `GET/POST /v1/squads/{id}/messages` | Squad chat history / send. |
| `POST /v1/media` | Upload media; returns a signed object URL (used by chat/banner/avatar). |

### 6.6 Presence & Notifications

| Method & Path | Purpose |
|---|---|
| `PUT  /v1/me/live-status` / `DELETE /v1/me/live-status` | Set / clear live status. |
| `GET  /v1/live` | Live statuses of friends. |
| `POST /v1/pings` | Send a ping to friends/subset/squad. |
| `GET  /v1/notifications?cursor=` | Paginated notification inbox. |
| `POST /v1/notifications/read` | Mark notifications read. |

### 6.7 Standard error shape

```json
{ "error": { "code": "RSVP_ACTIVITY_OVER", "message": "This plan has already started.", "field": null } }
```

Error codes are stable, machine-readable strings; clients must not parse `message`.

---

## 7. Real-Time & Messaging Requirements

### 7.1 Realtime Gateway (WebSocket) — ⬜ To be implemented

| ID | Requirement |
|---|---|
| FR-RT-01 | The client shall maintain a single authenticated WebSocket connection (`wss://…/v1/realtime`). |
| FR-RT-02 | The client shall subscribe to channels: `user:{id}` (notifications, friend updates), `activity:{id}` and `squad:{id}` (chat + state), `presence:friends` (live status). |
| FR-RT-03 | The server shall push events: `message.created`, `poll.updated`, `rsvp.changed`, `activity.updated`, `host.transferred`, `reaction.changed`, `notification.created`, `presence.changed`. |
| FR-RT-04 | Events shall carry a monotonic sequence number per channel; the client shall reconcile gaps via REST after reconnect. |
| FR-RT-05 | The gateway shall authenticate the socket with the access token and authorize each channel subscription. |
| FR-RT-06 | Fan-out shall use Redis pub/sub so any gateway instance can serve any client. |
| FR-RT-07 | The connection shall heartbeat (ping/pong) and the client shall auto-reconnect with backoff. |

### 7.2 Background jobs — ⬜ To be implemented

| Job | Trigger | Action |
|---|---|---|
| Reminder dispatch | Cron (≤1 min granularity) | For activities entering their reminder window, create `reminder` notifications + push. |
| Live-status expiry | Cron (≤1 min) | Purge/deactivate expired `live_statuses`; emit `presence.changed`. |
| Recurrence materialization | Cron (daily) | Generate upcoming occurrences for recurring activities. |
| Activity "over" sweep | Cron (≤1 min) | Mark/announce activities transitioning to Over; lock mutations. |
| Push delivery | Queue | Send queued APNs/FCM payloads with retry + token cleanup on failure. |
| Data retention | Cron (daily) | Archive/purge per §9. |

---

## 8. Non-Functional Requirements

### 8.1 Performance (NFR-PERF)

| ID | Requirement |
|---|---|
| NFR-PERF-01 | Feed and activity-detail reads shall return ≤ 300 ms p95 server-side under nominal load. |
| NFR-PERF-02 | Chat message delivery (send → recipient receives) shall be ≤ 1 s p95. |
| NFR-PERF-03 | App cold start to interactive shall be ≤ 3 s on a mid-tier device. |
| NFR-PERF-04 | Uploaded images shall be ≤ 10 MB pre-processing; the server shall produce resized variants (thumbnail, feed, full) and serve via CDN. |
| NFR-PERF-05 | The feed query shall remain ≤ 300 ms p95 with 500 friends and 5,000 candidate activities (indexed visibility). |

### 8.2 Scalability & Availability (NFR-SCAL)

| ID | Requirement |
|---|---|
| NFR-SCAL-01 | Services shall be horizontally scalable and stateless (state in PostgreSQL/Redis/object storage). |
| NFR-SCAL-02 | The system shall target 99.9% monthly availability for core read/write paths. |
| NFR-SCAL-03 | The realtime gateway shall support ≥ 50k concurrent connections per region via horizontal scaling. |
| NFR-SCAL-04 | The database shall use read replicas for feed/discovery reads. |

### 8.3 Reliability & Data Integrity (NFR-REL)

| ID | Requirement |
|---|---|
| NFR-REL-01 | All multi-row mutations (RSVP + host transfer, squad delete + untag) shall be transactional. |
| NFR-REL-02 | Host-transfer succession shall be deterministic and free of double-promotion under concurrency (row locking). |
| NFR-REL-03 | Database backups shall run daily with ≤ 24 h RPO and ≤ 1 h RTO. |
| NFR-REL-04 | Idempotency keys shall make create/RSVP retries safe. |

### 8.4 Usability & Accessibility (NFR-UX)

| ID | Requirement |
|---|---|
| NFR-UX-01 | Every list/screen shall have a defined empty state; the app shall never crash or blank on missing data. |
| NFR-UX-02 | Primary actions shall give immediate visual feedback (≤ 100 ms); optimistic UI for RSVP/reaction/chat. |
| NFR-UX-03 | Touch targets ≥ 44×44 pt; text contrast ≥ WCAG AA. |
| NFR-UX-04 | All interactive controls shall be screen-reader labelled. |
| NFR-UX-05 | Animation shall respect the OS "reduce motion" setting. |

### 8.5 Maintainability & Observability (NFR-MNT)

| ID | Requirement |
|---|---|
| NFR-MNT-01 | The API shall be versioned; breaking changes require a new major version. |
| NFR-MNT-02 | Services shall emit structured logs, metrics, and distributed traces. |
| NFR-MNT-03 | Code shall pass type-checking and linting in CI; no error-level diagnostics on merge to main. |
| NFR-MNT-04 | The client domain model (`src/types.ts`) and server schema shall be kept in sync via generated types or a shared contract. |

### 8.6 Compatibility (NFR-CMP)

| ID | Requirement |
|---|---|
| NFR-CMP-01 | Client targets: iOS 16+, Android 11+ (target); current prototype runs in evergreen browsers. |
| NFR-CMP-02 | The API shall be transport-agnostic so additional clients (web/desktop) can be added without server changes. |

---

## 9. Security & Privacy Requirements

| ID | Requirement |
|---|---|
| SEC-01 | All traffic shall use TLS 1.2+. No plaintext transport. |
| SEC-02 | Access tokens shall be short-lived (≤ 15 min) JWTs; refresh tokens long-lived, rotating, and revocable. |
| SEC-03 | Email passwords shall be hashed with Argon2id; never logged or returned. |
| SEC-04 | OAuth shall use Authorization Code + PKCE; provider ID tokens shall be cryptographically verified server-side. |
| SEC-05 | Every endpoint shall enforce authorization: a user may only read/mutate data their visibility rules permit (feed visibility, chat participation, squad host vs member, activity host). |
| SEC-06 | All input shall be validated and sanitized server-side; the client is never trusted. |
| SEC-07 | Rate limiting shall apply to auth, ping, search, and message endpoints. |
| SEC-08 | Media uploads shall be virus/content-scanned and MIME-validated; served from a separate origin with signed, expiring URLs. |
| SEC-09 | PII shall be encrypted at rest (DB-level) and excluded from logs/analytics. |
| SEC-10 | Account deletion shall erase or irreversibly anonymize all personal data within 30 days, including media. |
| SEC-11 | The system shall support a data-export request (user's own data) to meet privacy regulations. |
| SEC-12 | Push tokens shall be treated as sensitive and rotated/cleaned on invalidation. |
| SEC-13 | Audit logs shall record login, logout, account deletion, host transfer, and squad deletion. |
| SEC-14 | Default privacy: content is friends-scoped; nothing is public. FoF exposure is governed by the per-activity `is_private` flag and the per-user `show_me_to_fof` setting. |
| SEC-15 | Reported users/content shall be capturable for moderation (moderation tooling is post-v1 but the data hooks shall exist). |

**Data retention:** chat and activities retained while the account is active; past activities archived after 12 months; expired live statuses purged within 24 h; soft-deleted records purged after 30 days; audit logs retained 12 months.

---

## 10. Backend Services To Be Implemented

This section is the actionable build list. Each service lists its responsibilities, the prototype gap it closes, and key logic.

### 10.1 Auth Service ⬜
- **Responsibilities:** OAuth (Google/Apple/Facebook) code exchange + ID-token verification; email registration/login; JWT issuance, refresh-token rotation, revocation; password reset; handle availability; identity linking; account deletion.
- **Prototype gap:** the client's `signUp`/`logIn`/`loadDemoData` create local state only; OAuth buttons are stubs.
- **Key logic:** PKCE flow; verify provider `iss`/`aud`/signature; map `provider_subject` → `auth_identities`; first-login creates `users` + `user_settings`.

### 10.2 User Service ⬜
- **Responsibilities:** profile CRUD, settings CRUD, avatar upload orchestration, device (push token) registry.
- **Prototype gap:** `updateMe`/`updateSettings` mutate memory; avatar photos are `blob:` URLs.

### 10.3 Social Service ⬜
- **Responsibilities:** friend requests + acceptance, friend removal, squad CRUD with host/member authorization, FoF graph queries, discovery.
- **Prototype gap:** friends are added instantly with no request flow; squad host-only rules are client-enforced only.
- **Key logic:** store friendships once as an ordered pair; squad host actions reject non-hosts (403); deleting a squad cascades to `activity_squads` and `squad_messages` in one transaction.

### 10.4 Activity Service ⬜
- **Responsibilities:** activity CRUD; RSVP transitions; host-transfer succession; **server-authoritative feed visibility**; reactions; recurrence; "over" lifecycle.
- **Prototype gap:** all logic is in `store.ts` (`canSeeActivity`, `setRsvp`, `leaveActivity`, etc.); no persistence; no recurrence materialization.
- **Key logic:**
  - *Visibility* — port `canSeeActivity` (FR-FEED-02) to an indexed SQL query: host OR member of a tagged squad OR (open invite AND (friend-of-host OR (not private AND a friend has `going`))).
  - *Host transfer* — on host leave, `SELECT … FOR UPDATE` the lowest `order_index` `going` RSVP, promote to host, emit `host_offer`; if none, dissolve.
  - *Recurrence* — a daily job creates the next occurrence(s) of recurring templates.
  - *Concurrency* — `max_size` enforcement and host transfer use row locks.

### 10.5 Chat Service ⬜
- **Responsibilities:** activity & squad messages (text/photo/poll/system), poll voting, pagination, participant authorization; emits real-time events.
- **Prototype gap:** chat arrays live on the in-memory activity/squad objects; no pagination, no delivery.

### 10.6 Presence Service ⬜
- **Responsibilities:** live-status set/clear with TTL; friend-scoped presence fan-out; expiry job.
- **Prototype gap:** live status is a client object compared against `Date.now()`.
- **Key logic:** store in PostgreSQL for durability + Redis (`SETEX`) for fast presence reads; expiry job emits `presence.changed`.

### 10.7 Notification Service ⬜
- **Responsibilities:** create in-app notifications; fan-out pings; dispatch push via APNs/FCM; respect per-user settings; rate-limit pings.
- **Prototype gap:** notifications are partly seed-only; `ReminderEngine` polls local state and shows toasts; pings only toast.

### 10.8 Discovery Service ◐→⬜
- **Responsibilities:** search (plans/people/categories), trending, suggestions.
- **Prototype gap:** all three are client-side selectors over in-memory data (`smartSuggestions`, `trendingCategories`, `SearchScreen`). They work but won't scale.
- **Key logic:** trending/suggestions are cacheable materialized queries; search uses PostgreSQL full-text (or a dedicated index) scoped to visible content.

### 10.9 Media Service ⬜
- **Responsibilities:** signed upload, MIME/content validation, resize variants (thumb/feed/full), CDN delivery, lifecycle/cleanup.
- **Prototype gap:** all images are `blob:` object URLs or `picsum.photos` placeholders.

### 10.10 Realtime Gateway ⬜
- **Responsibilities:** authenticated WebSocket, channel subscription + authorization, Redis-backed fan-out, heartbeats, reconnection support (§7.1).

### 10.11 Scheduler / Workers ⬜
- **Responsibilities:** all jobs in §7.2.

### 10.12 API Gateway ⬜
- **Responsibilities:** routing, auth middleware, request validation, rate limiting, API versioning, CORS, observability.

---

## 11. Implementation Roadmap

Phased so each milestone is shippable.

### Phase 0 — Foundations
- Provision PostgreSQL, Redis, object storage, CI/CD, observability.
- Stand up API Gateway + Auth Service (email auth first, then OAuth).
- Implement the schema (§4) with migrations.
- Generate shared types from the schema; align with `src/types.ts`.

### Phase 1 — Core persistence
- User, Social (friends + friend requests, squads), Activity (CRUD + RSVP + host transfer + visibility), Media (uploads).
- Client: replace Zustand-only mutations with API calls; introduce a data-fetching/cache layer; keep optimistic UI.
- Outcome: real accounts, persistent plans, real friends/squads, real images.

### Phase 2 — Real-time
- Realtime Gateway + Redis pub/sub.
- Chat Service (messages, photos, polls) and Presence Service over WebSocket.
- Client: subscribe to channels; live feed/chat/presence updates.

### Phase 3 — Notifications & background
- Notification Service + APNs/FCM; device registration.
- Scheduler: reminders, live-status expiry, recurrence materialization, "over" sweep.
- Replace the client `ReminderEngine` poll with server-scheduled push.

### Phase 4 — Discovery at scale & hardening
- Move search/trending/suggestions server-side with indexing/caching.
- Real map + geolocation (replace stylized `mapX/mapY` with `lat/lng`).
- Rate limiting, abuse prevention, moderation hooks, data export/deletion.
- Security review, load testing against NFR-PERF/SCAL, accessibility audit.

### Phase 5 — Client productionization
- Package as React Native (or hardened PWA); app-store readiness; offline cache.
- Deferred: calendar export/sync; message reactions/mentions; advanced recommendations.

---

## 12. Acceptance Criteria & Traceability

Each requirement is verified by at least one method: **T** test (unit/integration/e2e), **D** demonstration, **I** inspection, **A** analysis.

| Requirement group | Verification | Representative acceptance criteria |
|---|---|---|
| AUTH | T, D | Fresh OAuth sign-up creates exactly one account; refresh rotates tokens; sign-out revokes; admin demo loads the sample set; handle uniqueness rejected with stable error code. |
| FEED | T, A | Visibility query returns exactly the activities permitted by FR-FEED-02 across host/friend/FoF/squad/private cases; meets NFR-PERF-05 at stated scale. |
| ACT | T | Host leaving with joiners promotes the earliest joiner exactly once under 100 concurrent leave attempts; "over" activities reject RSVP with `RSVP_ACTIVITY_OVER`. |
| CHAT | T, D | A message sent by one participant appears for all others ≤ 1 s; non-participants receive 403; one vote per user per poll. |
| LIVE | T | A status set with a 1 h duration is gone from friends' feeds within 1 min of expiry. |
| FRND/SQD | T | Non-host squad mutations return 403; leaving a squad preserves it for others; deleting a squad untags activities atomically. |
| PING/NOTIF | T, D | A reminder fires within ±1 min of the configured lead time as a push notification; pings respect `pings_enabled`; ping rate limit enforced. |
| NFR | A, T | Load tests confirm PERF/SCAL targets; chaos test confirms REL targets; accessibility audit confirms UX targets. |
| SEC | T, I | Pen test confirms authorization on every endpoint; account deletion erases all PII + media within 30 days. |

A full requirement-ID → test-case matrix shall be maintained in the test management system.

---

## 13. Appendices

### Appendix A — Current Implementation Inventory (prototype)

**Screens** (`src/screens`): Splash, Welcome, Auth, Onboarding, Feed, Post (sheet), Activity Detail (sheet), Ping, Notifications, Profile, Edit Profile, Settings, Friends, Squads, History, Search, Go-Live (sheet), Live Detail (sheet), Poll Composer (sheet), Overlay Host.

**Key components** (`src/components`): PhoneFrame, TabBar, Avatar/AvatarStack, ActivityCard, ReactionBar, PollBubble, BottomSheet, PulseButton, Toggle, Toaster, OverlayShell, LiveNowStrip, FeedFilters, TrendingStrip, SmartSuggestions, ReminderEngine, BrandIcons.

**State** (`src/store.ts`): single Zustand store holding identity, social graph, activities, squads, notifications, UI state, and all domain actions. **This is the logic that must be re-homed on the server** (see §10).

**Categories** (`src/data/categories.ts`): surf, gym, run, gaming, food, drinks, coffee, study, movie, outdoors, party, other, custom.

### Appendix B — Status legend

- ✅ **Implemented** — present and working in the front-end prototype.
- ◐ **Partial** — UI/UX exists; server-side logic, persistence, or enforcement is missing.
- ⬜ **To be implemented** — not built; requires backend/infrastructure work.

### Appendix C — Known prototype stubs to replace

| Stub | Replace with |
|---|---|
| In-memory Zustand store | API calls + server persistence + client cache. |
| `signUp`/`logIn` local user; OAuth buttons | Real Auth Service + provider OAuth. |
| `loadDemoData` (seed) | Keep as a dev/QA-only fixture path, gated behind a non-production flag. |
| `blob:` / `picsum.photos` image URLs | Media Service uploads + CDN URLs. |
| `ReminderEngine` 30 s client poll | Server scheduler + push notifications. |
| `canSeeActivity` / RSVP / host-transfer in `store.ts` | Activity Service with SQL visibility + transactional transitions. |
| Stylized map `mapX/mapY` | Real `lat/lng` + map provider + geocoding. |
| Client `smartSuggestions` / `trendingCategories` / search | Discovery Service with indexing/caching. |
| Instant friend add | Friend-request/acceptance flow. |

### Appendix D — Open questions

1. Should FoF visibility be opt-out per activity only, or also globally per user? (Currently: per-activity `is_private` + per-user `show_me_to_fof`.)
2. Recurrence — generate a rolling window of occurrences, or expand lazily on read?
3. Map — which provider, and what location precision/permission model?
4. Moderation — required for v1 launch, or fast-follow? (Data hooks required either way — SEC-15.)
5. Calendar sync — confirmed deferred; revisit after Phase 4.

---

*End of document — WUD SRS v1.0.*
