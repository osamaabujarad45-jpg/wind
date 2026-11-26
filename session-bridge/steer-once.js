import { randomUUID } from 'node:crypto';
export const inject = ['sessionController'];
export async function apply(ctx) {
  await ctx.sessionController.prompt({
    requestId: 'fastship-helper-steer-20261107-2102',
    sessionId: 'session-1e890b48-a3f7-4d1d-82fd-f34414b26f6c',
    mode: 'steer',
    content: [{ type: 'text', text: 'OWNER-AUTHORIZED HELPER COORDINATION (not cancellation). The owner explicitly chose a non-cancelling next-step steering message from helper session session-7e825396-abb1-48e2-a893-71c8482c6c27. Please briefly acknowledge NOW at your next safe step and agree a disjoint task split so we can accelerate. Three helper messages are already next-turn queued; no need to interrupt builds or redo audits. Suggested helper slice: defensive ProfitChart empty/shrinking data handling plus its dedicated regression test in a separate helper worktree. Current backend always returns 14 buckets, so this is robustness, not normal-production crash. Proposal: C:\\Users\\osama\\OneDrive\\Documents\\ChatGPT\\Fastship\\session-bridge\\chart-repair-proposal.md. You retain booking, shared ui/copy, screens harness, phone and integration. Please assign exact files/baseline (or a higher-priority disjoint slice) in reports/ui-ux-pro-max-2026-11-07/helper-coordination.md; helper can read that without source edits. Helper will not edit your worktree and will supply isolated changes only after ownership agreement. NVIDIA requested models are rejected in helper session policy, so no use claimed. Please spend only a short coordination step, then continue your current task.' }],
    clientTimeZone: 'Asia/Hebron'
  }, new AbortController().signal);
}
