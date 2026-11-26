# Wind — Interview Answers

## What we learned

"The big lesson was verification discipline. Early on, we had documents confidently stating things that turned out wrong once we double-checked them, so we built a habit of re-verifying everything against the actual source code before trusting it — and where a document and the code disagreed, the code won.

Second, we learned that we'd already built far more on the backend than the app was actually using. The gap wasn't architecture, it was wiring and tests. So the rule became: extend what exists, don't rebuild it.

Third, testing on a real device caught real bugs that the automated suites missed. And when we deliberately broke the code to see if the tests would catch it, they did — which is how you know your testing means something.

And honestly, the clearest thing we learned is precision about what you don't know. We kept an explicit list of what was unproven — other platforms, accessibility, real-world GPS conditions — instead of claiming victory early."

## What's next

"Near term, it's about closing the gap between 'works in test' and 'ready for real customers.' That means applying the database changes we built, finishing a controlled pilot with actual drivers and real operating conditions, and gathering the operational evidence that proves the system behaves outside a test harness — including a rollback plan, not just a launch plan.

We also have acceptance work left on devices we haven't fully covered, and accessibility checks that were never done. Those aren't nice-to-haves; they're part of calling it done.

After that, the roadmap is about differentiating for our actual market — Arabic-first experience, payment habits that fit the local economy, tolerance for unreliable networks, and honest pricing transparency. The strategy stays the same throughout: prove each step properly before moving to the next, and be clear-eyed about what's verified versus what isn't."
