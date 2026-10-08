# SPEC: driver-signup-alert

Status: loop 20, 8 Oct 2026, owner standing instruction (loop without asking; fill gaps and fix wrong logic).

## Problem (measured)

Production Wind (read-only count, 8 Oct): 0 orders, 1 active admin, **3 drivers in `pending`**. A self-service driver
signs up as `pending` and cannot see jobs until an admin approves them, but nothing tells the admin: the dashboard
shows a «pending drivers» shortcut only when someone opens it. The notification audit (SPEC-notification-audit.md)
covered the approval decision reaching the driver, not the request reaching the admin. Uber/Careem onboarding
queues page their ops team; supply waits silently here.

## Design

- Driver registration (self-service `POST /api/auth/register` with role driver) queues an `attention` Web Push to
  every active admin, opening `/admin/users`. Customers signing up alert no one. Registration is already limited to
  20 per address per 10 minutes, which bounds the alerts.
- The lock screen uses the existing `attention` wording («طلب يحتاج قرارك»).

## Acceptance criteria

1. Driver signup pushes admins only; customer signup pushes nobody (server test, mutation-checked).
2. `npm test`, tsc, lint.

## For the owner

Three drivers are already waiting in production: approve or reject them from Admin → Users.
