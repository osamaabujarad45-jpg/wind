Status: ready-for-agent

# The profile dot misses new work until its notification is opened

Found 28 Nov 2026 by the final design review; the behaviour is the F5 server's.

FLOWS S9: the dot on your picture shows work waiting in another profile. `waitingProfileUpdates` (`server/main.ts`)
counts only notices marked `waiting`, and a notice is marked only when its link is resolved while in another mode. A
shop order that arrives while its owner is in Personal mode, with the push missed, shows no dot and no Account badge.

Wanted: mark a notice waiting when it is created for a user whose session is in another mode (or derive the count from
current work, e.g. open shop orders), with a server test. The app already shows whatever `updates.count` says.

## Owner

Server lane (the F5 session under the 27 Nov split).

## Comments
