# Fastship model routing and subscription value

Verified 27 November 2026. Use the owner rules in [AGENTS.md](../../AGENTS.md#subagent-models-and-effort--owner-rule-27-november-2026) to dispatch a task. Check current prices, allowance and account limits before proposing a purchase.

| Task | Starting route | Evidence needed to spend more effort |
| --- | --- | --- |
| Read a bounded diff, extract a fact, run a defined test or verify a link | GPT 6.1 Sol, medium, under a GPT lead | Move to high if interpretation or cross-file reasoning is material. Keep the result small and check it against the source. |
| Implement a specified behavior or review a flow | GPT 6.2 Sol, medium | Use high when it crosses modules, depends on timing or needs a review of several plausible outcomes. |
| Review credentials, cash, concurrent assignment, migration or deployment | GPT 6.2 Sol, high or xhigh | Give each required reviewer a fresh brief. Raise effort only for difficult reasoning or a check that a lower effort missed. |
| Rescue a blocked design or architecture decision | The selected lead, with bounded independent Sol reviews | Use a higher effort on a narrow disputed question. Astra is the suitable lead if the owner selects it for complex cross-domain work. |

When Opus 5.5 leads, route every worker to GPT 6.2 Sol. Use the model and effort offered by the configured provider. ChatGPT and Codex usage under the same sign-in draws from the plan's allowance. Changing Sol versions can improve task efficiency, including on the same plan. It does not create another quota pool. OpenAI reports equal standard API token rates for 6.1 and 6.2 Sol and better task efficiency for 6.2 Sol. Its coding benchmark also reports that 6.2 Sol at max approaches 6.2 Astra at a fraction of the measured cost. These benchmark costs are not a forecast of this repo's subscription usage. [GPT 6.2 release](https://openai.com/index/introducing-gpt-6-2-astra-sol/) · [GPT 6.1 Sol release](https://openai.com/index/introducing-gpt-6-1-sol/) · [Work and Codex usage](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex)

| Personal plan choice | When it is good value for Fastship |
| --- | --- |
| ChatGPT Plus, US $20/month | Occasional work that fits its included allowance. Use Sol at Standard speed and keep worker briefs focused. |
| ChatGPT Pro 100, US $100/month | First upgrade to evaluate for sustained development if the measured Plus limits repeatedly interrupt releases. Test a normal week at Standard before paying for a higher plan. |
| ChatGPT Pro 200, US $200/month | Consider if Pro 100 still delays enough verified work to justify the difference. GPT 6.2 Sol Ultrafast is available in Codex and consumes included usage six times as fast as Standard for that model. |
| ChatGPT Pro 500, US $500/month | Consider only if measured release volume or time saved justifies it. It provides the largest listed personal allowance and more Ultrafast options. |
| Claude subscription | Keep its existing separate quota when it is useful for the Opus lead or restored Haiku design route. Compare measured interruptions and quality on Fastship before buying a larger Claude plan alongside ChatGPT. |

[ChatGPT Plus](https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus) · [ChatGPT Pro tiers](https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers) · [Work and Codex speed and billing](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex) · [Claude Max plans](https://support.claude.com/en/articles/11049741-what-is-the-max-plan)

Keep a small record of the model, effort, provider, time to accepted result, manual corrections and quota interruptions for each reviewed scope. Use the `agent-orchestra` ledger when available. Compare those outcomes across similar scopes. Leave Standard on unless the owner has approved the extra cost and latency matters to a specific task. A subscription plan does not pay API or third-party provider charges. Keep paid fallback routes gated and follow the repo's bounded retry rules.
