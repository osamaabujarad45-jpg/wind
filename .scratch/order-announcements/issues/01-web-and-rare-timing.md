Status: ready-for-agent

# Order-screen announcements: web, lost replies and leaving mid-send

Found 28 Nov 2026 by reviews of the design branch. Each case below is also silent at d7867380, the base the branch
started from, so none is a regression of the redesign.

- Web: `AccessibilityInfo.announceForAccessibility` does nothing in react-native-web, and a live region that appears
  already holding its text may not be read (the safety receipt card, the header pause notice).
- A safety report whose reply is lost: the order refreshes with the report, but no receipt is spoken.
- Leaving the order, or opening Help, before the reply; signing out mid-send; a report resolved before returning.

## What was tried, and why it was removed

A single order-driven announcer with a hidden web live region and a per-account "receipt still owed" set (commits
b6bacdda to e7288dae) closed cases one at a time, and each review found a further timing case. It was reverted to the
fcec6383 behaviour: native announces status changes, a recorded arrival, support taking the goods and a safety pause;
sending a report announces its receipt on success.

## Wanted

One announcement service for the whole app (native announce; one always-mounted web live region at the app root, so
no screen's mounting or visibility matters), with component tests for the cases above. Playwright's exact text
matching drops zero-width spaces, so the web region's text must differ visibly from page text (a trailing full stop
works).

## Comments
