# Recheck the session on the first support proof reset

Status: needs-triage

The first proof-reset request checks the caller's session in the HTTP handler before waiting for the order and staff authority. The write checks the current staff role, but it can still proceed after a concurrent sign-out with no role change. The replay path has its own session check after acquiring staff authority.

Verify the first write with a transaction barrier and reject a session that ended while the request was waiting. Confirm the order and staff lock sequence and exercise requests both with and without a command envelope.
