# Wind

Wind is one app for rides, parcel shipping and shop delivery in the West Bank, with customer, driver and admin roles over one server.

## Commands and their outcomes

**Command**:
One write a person asks the server to make (book, advance, record a remittance), carrying a request id that stays the same across every resend of it.
_Avoid_: Action, mutation, call

**Command receipt**:
The server's record of one command's outcome, readable only by the person who sent it.
_Avoid_: Receipt (bare), ack, result

**Unconfirmed command**:
A command whose outcome the sender does not yet know because its reply was lost; it stays unconfirmed until a command receipt or a definite refusal settles it, and is never shown as done or failed by guess.
_Avoid_: Failed, pending (alone), lost

## Money

**Fare receipt**:
The document a customer sees for a trip or delivery: what it cost and how payment is due, never a claim of payment Wind has not confirmed.
_Avoid_: Receipt (bare), invoice

**Remittance**:
Cash a driver hands over to Wind against the cash they owe from collected fares, recorded by an admin.
_Avoid_: Payment, deposit, settlement

**Adjustment**:
An admin-recorded change to what a driver owes that is not a cash handover; forgiving debt needs a second finance approver.
_Avoid_: Correction, credit
