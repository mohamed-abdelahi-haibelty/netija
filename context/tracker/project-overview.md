# Bac Results Portal (Mauritania)

## Overview

A public website where anyone can look up Mauritanian Baccalauréat
(Bac) results. Visitors search by exam number (Numéro Bac)
for a specific year, or by student name with instant autocomplete.
A student's page shows their decision (Admis, Ajourné, Sessionnaire,
etc.), their Moyenne Générale (out of 20), and their full attempt
history across years (e.g. Ajourné in 2021, Admis in 2022). Admins
upload the yearly Excel result files through an authenticated
dashboard; a Python/pandas pipeline cleans and imports them. The
site must survive results-day traffic spikes (~20,000 requests in
1 minute).

## Goals

1. A visitor finds any result in under 5 seconds via exam number +
   year, or via typo-tolerant name autocomplete (7–10 suggestions).
2. One student = one record across years: multiple attempts are
   linked to the same person and shown together.
3. An admin imports a 50,000-row Excel file of any historical
   format (2015–2025 column variants) through a preview/confirm
   flow, with the import running as a background job.
4. The site stays responsive during the results-day spike
   (caching + rate limiting + Cloudflare).
5. The site is fast (Core Web Vitals green), SEO-optimized on
   public pages, and accessible (WCAG 2.1 AA), with correct
   Arabic (RTL) and French (LTR) text rendering.
6. Results-day speed: from receiving the new Excel file to
   published, automatically verified, publicly searchable
   results in 5–10 minutes.

## Core User Flow (public)

1. Visitor lands on the home page and sees two tabs:
   "Search by Name" and "Search by Exam Number".
2. Exam-number tab: enter the exam number + select the year
   (a select input, defaulting to the most recent year).
3. Name tab: type a name (no year selector); typo-tolerant
   autocomplete shows up to 10 student suggestions. Every
   suggestion is disambiguated with its latest year, SERIE, and
   birth place when available (e.g. "Mohamed Abdellahi — Bac
   2020 · SN · Néma"), sorted most-recent-first, so identical
   names are always distinguishable.
4. Clicking a suggestion or submitting a valid exam-number search
   opens the student page.
5. Student page shows: name (French and Arabic when available),
   latest decision, Moyenne Générale, SERIE (track), and the number
   of attempts. Each attempt is clickable to view that year's
   result (year, exam number, moyenne, decision). Optional fields
   (school/centre, wilaya) appear when present in the data.
6. If pending link suggestions exist for this person, the page
   shows a neutral "Other records with this name" section
   linking to those pages (phrased as "with this name", never
   asserting it is the same person). Accepted suggestions merge
   the pages; rejected ones remove the section.

## Core User Flow (admin)

1. Admin signs in via Better Auth at /admin (no public signup;
   accounts are provisioned manually/seeded).
2. Dashboard shows the list of previously uploaded files with
   their status (processing, completed, failed) and import
   summaries (rows inserted, rejected, new people).
3. Admin uploads a new Excel file → sees a column-mapping preview
   (detected columns, sample values, unrecognized columns flagged)
   → corrects mappings via dropdowns → confirms.
4. Import runs as a BullMQ background job; the dashboard shows
   live progress and the final summary.
5. The automated smoke verification result is shown; once it
   passes, the admin can click Publish (atomic, reversible) to
   make the year publicly visible.
6. The dashboard's suggestion queue lists pending identity link
   suggestions (sortable; exact-name + same-SERIE matches first
   for fast bulk review). Accepting merges the persons;
   rejecting dismisses the suggestion. Reviewed after
   publishing, never blocking it.

## Release Flow

### Results day (time-critical: file in hand → live in 5–10 min)

We compete with other sites on publish speed. The pipeline from
receiving the year's Excel file to public, verified results must
complete in 5 minutes (10 worst case):

1. Pre-staged: the site is already live with historical data, the
   admin is logged in, and a full rehearsal import (last year's
   file) was run on staging beforehand — which also warmed the
   column-alias dictionary.
2. The file is uploaded DIRECTLY TO PRODUCTION. The mapping
   preview auto-maps known columns; the admin confirms (manual
   remap only if a new column format appears — the main risk
   the time buffer exists for).
3. The import job runs with the new exam year UNPUBLISHED:
   clean → load → link (NNI pass) → Meilisearch index.
   Hard budget: under 2 minutes for 50k rows.
4. Automated smoke verification runs: the system samples ~20
   random imported rows and asserts the admin-preview pages/API
   return the matching name, moyenne, and decision; total counts
   are reconciled (file rows = inserted + rejected). Publishing
   is blocked until the smoke check passes.
5. The admin clicks Publish: an atomic flag flip makes the year
   public and purges the Cloudflare cache. Reversible.
6. Identity link suggestions are reviewed AFTER publishing —
   they never block going live. If the new file lacks NNI/birth
   data, cross-year linking simply degrades to suggestions;
   every result is still individually searchable immediately.

### Staging

Staging (staging.<domain>) mirrors production with its own
database and is used for: deploying and verifying code changes
first, and rehearsing the full results-day import pipeline with
last year's file before the real day. It is not a same-day gate
for the new file.

## Features

### Public Search

- Two-tab home page: name search and exam-number search.
- Exam-number search requires a year (default: latest year with
  data); exam numbers are only unique within a year.
- Name autocomplete via Meilisearch: typo-tolerant, supports
  French and Arabic names, returns up to 10 suggestions.
- Student page with multi-year attempt history.

### Admin Dashboard

- Better Auth email/password login; all /admin routes protected.
- Excel upload (.xlsx/.xls only, max 25 MB, exactly one file)
  with column-mapping preview and manual remap for unrecognized
  columns; violations return clear errors (415 wrong type,
  413 too large, 400 missing file).
- Background import (BullMQ → Python/pandas worker) with progress,
  per-file import history, and a downloadable reject report
  (rows that failed validation, with reasons).
- Publish control per exam year (gated by the smoke check) and
  the identity suggestion review queue.

### Data Pipeline

- Pandas cleaning: trim, normalize decisions, parse per-year date
  formats, coerce numerics, preserve leading zeros on exam numbers
  and NNI.
- Identity linking (attempt-first): every row imports as its own
  attempt; a post-import job links attempts to persons using
  whatever signals the file happened to provide — NNI when
  present, name + birth date + birth place when present, human
  review suggestions otherwise. Only the exam number and one
  name (FR or AR) are ever assumed to exist; any other column
  may vanish in a future year (2022 has no NNI; 2021/2023 do).
- Idempotent loads: re-running an import never duplicates data.
- Meilisearch reindex after each successful import.

### Platform

- Redis caching of hot result lookups; Redis-backed rate limiting.
- Cloudflare in front for DDoS protection, bot mitigation, and
  edge caching of public pages.
- PostHog (anonymous-only) product analytics; Sentry error
  monitoring on frontend, API, and worker.

## Scope

### In Scope

- Public search (name + exam number/year) and student pages.
- Admin auth, upload, preview/mapping, background import, history.
- Staging environment mirroring production on the same VPS.
- Performance, SEO (public pages), accessibility, bilingual
  (FR/AR) display.

### Out of Scope

- Public user accounts, favorites, or notifications.
- Editing individual results through the UI (data changes go
  through re-import).
- Mobile apps.
- Statistics/analytics pages for the public (may come later).
- Payment or monetization features.

## Success Criteria

1. Searching exam number `00573` for year 2024 returns the correct
   student page; the same number for 2025 returns a different
   (correct) student.
2. Typing a partial/typo'd name (e.g. "fatimto") returns relevant
   suggestions including "Fatimetou ..." within 300 ms.
3. A student who sat the Bac in two years appears as one person
   with two attempts, both viewable.
4. An admin can import each historical file format (2015–2025
   samples) end to end; unrecognized columns are flagged in the
   preview and can be remapped manually.
5. Re-uploading the same file changes nothing (idempotent).
6. Lighthouse on the home page: Performance ≥ 90, Accessibility
   ≥ 95, SEO ≥ 95 (mobile).
7. `npm run build` and all test suites pass in CI before any
   deploy; the import pipeline has been rehearsed end to end on
   staging with last year's file.
8. Results-day drill: file upload → unpublished import → passing
   automated smoke check → publish completes in ≤ 10 minutes.
