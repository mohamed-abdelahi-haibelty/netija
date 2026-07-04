# Bac Results Portal (Mauritania)

## Overview

A public website where anyone can look up Mauritanian Baccalauréat
(Bac) results. Visitors search by exam number (Numéro Bac) for a
specific year, or by student name with instant autocomplete. A
result page shows the candidate's decision (Admis, Ajourné,
Sessionnaire, etc.), their Moyenne Générale (out of 20), the SERIE
(track), and the year. Admins upload the yearly Excel result files
through an authenticated dashboard; a Python/pandas pipeline cleans
and imports them. The site must survive results-day traffic spikes
(~20,000 requests in 1 minute).

The project deliberately stores and displays the minimum personal
data — name, exam number, year, serie, decision, moyenne — and never
stores or shows the NNI, birth date, or birth place. There is no
identity linking across years: each result is an independent record.

## Goals

1. A visitor finds any result in under 5 seconds via exam number +
   year, or via typo-tolerant name autocomplete (7–10 suggestions).
2. Each result is a single, independent record. When a name appears
   in several years, those results are shown as separate,
   year-labeled rows — never merged into one "person".
3. An admin imports a 50,000-row Excel file of any historical
   format (2015–2025 column variants) through a preview/confirm
   flow, with the import running as a background job.
4. The site stays responsive during the results-day spike
   (caching + rate limiting + Cloudflare).
5. The site is fast (Core Web Vitals green), SEO-optimized on
   public pages, and accessible (WCAG 2.1 AA), with correct
   Arabic (RTL) and French (LTR) text rendering.
   The admin dashboard is in English (not French): all admin UI
   strings, labels, and hardcoded text use English regardless of
   the URL locale prefix. Arabic locale (/admin/ar/) stays in
   Arabic. Future admin UI work must follow this rule.
6. Results-day speed: from receiving the new Excel file to
   published, automatically verified, publicly searchable
   results in 5–10 minutes.

## Core User Flow (public)

1. Visitor lands on the home page and sees two tabs:
   "Search by Name" and "Search by Exam Number".
2. Exam-number tab: enter the exam number + select the year
   (a select input, defaulting to the most recent year).
3. Name tab: type a name (no year selector); typo-tolerant
   autocomplete shows up to 10 matching results. Each suggestion
   is a single result labeled with its year and SERIE (e.g.
   "Mohamed Abdellahi — Bac 2024 · SN"), sorted most-recent-first.
   A name that appears in several years shows as several separate
   rows — the site does not claim they are the same person.
4. Clicking a suggestion, or submitting a valid exam-number
   search, opens that result's page.
5. Result page shows: name (French and Arabic when available),
   decision, Moyenne Générale (out of 20), SERIE (track), and the
   exam year. There is no multi-attempt history and no "other
   records with this name" section.

## Core User Flow (admin)

1. Admin signs in via Better Auth at /admin (no public signup;
   accounts are provisioned manually/seeded).
2. Dashboard shows the list of previously uploaded files with
   their status (processing, completed, failed) and import
   summaries (rows inserted, rejected).
3. Admin uploads a new Excel file → sees a column-mapping preview
   (detected columns, sample values, unrecognized columns flagged)
   → corrects mappings via dropdowns → confirms.
4. Import runs as a BullMQ background job; the dashboard shows
   live progress and the final summary.
5. The automated smoke verification result is shown; once it
   passes, the admin can click Publish (atomic, reversible) to
   make the year publicly visible.

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
   clean → load attempts → Meilisearch index. Hard budget:
   under 2 minutes for 50k rows. (There is no linking step.)
4. Automated smoke verification runs: the system samples ~20
   random imported rows and asserts the admin-preview pages/API
   return the matching name, moyenne, and decision; total counts
   are reconciled (file rows = inserted + rejected). Publishing
   is blocked until the smoke check passes.
5. The admin clicks Publish: an atomic flag flip makes the year
   public and purges the Cloudflare cache. Reversible.

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
  French and Arabic names, returns up to 10 results, each labeled
  with year + SERIE, newest first. No merging across years.
- A result page per attempt.

### Admin Dashboard

- Better Auth email/password login; all /admin routes protected.
- Excel upload (.xlsx/.xls only, max 25 MB, exactly one file)
  with column-mapping preview and manual remap for unrecognized
  columns; violations return clear errors (415 wrong type,
  413 too large, 400 missing file).
- Background import (BullMQ → Python/pandas worker) with progress,
  per-file import history, and a downloadable reject report
  (rows that failed validation, with reasons).
- Publish control per exam year (gated by the smoke check).

### Data Pipeline

- Pandas cleaning: trim, normalize decisions, coerce numerics,
  preserve leading zeros on exam numbers.
- Minimal storage: only exam number, name(s), year, serie,
  decision, and moyenne are stored. If a file contains NNI, birth
  date, birth place, school, or wilaya columns, they are ignored
  and never written to the database.
- Only the exam number and one name (FR or AR) are ever assumed to
  exist; any other column may be absent or renamed in a future
  year (e.g. 2022's columns differ from 2021's). Field
  availability is detected per file, never hardcoded by year.
- Idempotent loads: re-running an import never duplicates data.
- Meilisearch reindex after each successful import.

### Platform

- Redis caching of hot result lookups; Redis-backed rate limiting.
- Cloudflare in front for DDoS protection, bot mitigation, and
  edge caching of public pages.
- PostHog (anonymous-only) product analytics; Sentry error
  monitoring on frontend, API, and worker.

## Privacy

- The site publishes officially-released national exam results
  and stores only the minimum needed to display them.
- It never stores or displays the NNI, birth date, or birth place.
- A public privacy/about page states what is stored, that data is
  not used commercially or shared with third parties, and provides
  a contact for correction or removal of a specific result
  (identified by name + exam number + year). Removal requests are
  honored: the row is deleted and purged from search and cache.

## Scope

### In Scope

- Public search (name + exam number/year) and result pages.
- Admin auth, upload, preview/mapping, background import, history,
  publish.
- Staging environment mirroring production on the same VPS.
- Performance, SEO (public pages), accessibility, bilingual
  (FR/AR) display; privacy/about page + removal contact.

### Out of Scope

- Public user accounts, favorites, or notifications.
- Identity linking, cross-year merging, or "same person" grouping.
- Storing or displaying NNI, birth date, or birth place.
- Editing individual results through the UI (data changes go
  through re-import or a removal request).
- Mobile apps.
- Statistics/analytics pages for the public (may come later).
- Payment features.

## Success Criteria

1. Searching exam number `00573` for year 2024 returns the correct
   result; the same number for 2025 returns a different (correct)
   result.
2. Typing a partial/typo'd name (e.g. "fatimto") returns relevant
   suggestions including "Fatimetou ..." within 300 ms, each
   labeled with year + SERIE.
3. A name appearing in three years shows as three separate
   year-labeled results in search; no merging is claimed.
4. An admin can import each historical file format (2015–2025
   samples) end to end; unrecognized columns are flagged in the
   preview and can be remapped manually; any NNI/birth columns in
   the file are ignored and never stored.
5. Re-uploading the same file changes nothing (idempotent).
6. Lighthouse on the home page: Performance ≥ 90, Accessibility
   ≥ 95, SEO ≥ 95 (mobile).
7. `npm run build` and all test suites pass in CI before any
   deploy; the import pipeline has been rehearsed end to end on
   staging with last year's file.
8. Results-day drill: file upload → unpublished import → passing
   automated smoke check → publish completes in ≤ 10 minutes.
