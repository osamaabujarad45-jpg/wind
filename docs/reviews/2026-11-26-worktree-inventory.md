# Fastship worktree inventory — 26 November 2026

Inventory captured before consolidation: 128 registered worktrees. Every tree was checked for tracked/untracked changes, commits outside origin/master, and substantive changes with end-of-line whitespace ignored. Twenty-three clean, fully merged trees with no ignored files were removed. Other trees remain preserved; this is not a claim that every old patch has been integrated.

The 26 November inventory used the main checkout on `feature/session-consolidation-20261126`, based on `941d5cac`. Its root row records the pre-takeover backup branch. Raw per-file statuses, commit subjects, handoffs and patches remain in the ignored `.artifacts/takeover-20261126` directory.

## 27 November follow-up

The main checkout now uses `feature/pilot-personal-flow`. The follow-up checked six additional checkouts and removed the disposable PR #121 verification checkout. Git now lists 110 worktrees.

| Checkout | Evidence and disposition |
|---|---|
| `feature/f0-baseline` | Five staged paths at base `816d3e17`. The pilot branch records the revised harness and partial baseline in `2e78bad7`. The original patch is preserved in `.artifacts/pilot-2026-11-27/f0-inherited.patch`. |
| `feature/f1-personal-home` | 39 status entries at base `816d3e17`. The main checkout holds the reviewed F1 candidate and new verification. The original patch is preserved in `.artifacts/pilot-2026-11-27/f1-inherited.patch` until the A53 gates pass. |
| `feature/verified-email-reset` | 30 status entries at base `816d3e17`, including the SQL migration and hosted continuation page. Retain the worktree and its v5 checkpoint through integration and provider rehearsal. |
| `wind-push-1126` and `wind-apk-1126` | Git is clean at merged revisions. Both have ignored dependencies. Confirm those dependency paths and active build use before removal. |
| Detached PR #121 verification checkout | Removed after confirming an empty Git and ignored-file status, no running checkout process, and ancestry from `816d3e17` to `origin/master`. |

See the current order of work in the [pilot checkpoint](../PLAN-2026-11-26-CONTINUE.md#27-november-pilot-checkpoint).

## 26 November inventory

| Worktree | Head | Tracked / untracked status entries | Substantive diff files | Disposition |
|---|---|---:|---:|---|
| C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship | 2fc10b51f00d | 0 / 2 | 0 | Active feature checkout; old root snapshot retained |
| C:/Users/osama/.local/share/opencode/worktree/b44bf6/fable-5.2-verification | b60922952d60 | 158 / 115 | 158 | Substantive edits preserved; tracked patch archived; compare requirements with current release before porting |
| C:/Users/osama/.local/share/opencode/worktree/b44bf6/integration-strict-20261111 | b60922952d60 | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/Users/osama/.local/share/opencode/worktree/b44bf6/integration-strict-20261111-b | 445fc7afbe55 | 90 / 2 | 90 | Substantive edits preserved; tracked patch archived; compare requirements with current release before porting |
| C:/Users/osama/.local/share/opencode/worktree/b44bf6/wind-demo-2026-11-11 | b60922952d60 | 0 / 55 | 0 | Untracked material preserved; no automatic deletion |
| C:/Users/osama/.t3/worktrees/Fastship/fix-complete-nov5-session | 22526cc08206 | 894 / 11 | 29 | Substantive edits preserved; tracked patch archived; compare requirements with current release before porting |
| C:/Users/osama/.t3/worktrees/Fastship/fix-recent-release-revi-7d67acf2295c2672 | d7bdbdb998aa | 0 / 2 | 0 | Untracked material preserved; no automatic deletion |
| C:/Users/osama/.t3/worktrees/Fastship/helper-profit-chart | c9b45078b2cc | 2 / 1 | 2 | Substantive edits preserved; tracked patch archived; compare requirements with current release before porting |
| C:/Users/osama/.t3/worktrees/Fastship/strict-review-20261108 | 92b1cd2ba02f | 70 / 3 | 70 | Substantive edits preserved; tracked patch archived; compare requirements with current release before porting |
| C:/Users/osama/.t3/worktrees/Fastship/t3-01520e73 | 6aca47c3190e | 589 / 0 | 0 | End-of-line-only diff; preserved |
| C:/Users/osama/.t3/worktrees/Fastship/t3-2b5c1e5b | 5b66a4885c09 | 575 / 0 | 0 | End-of-line-only diff; preserved |
| C:/Users/osama/.t3/worktrees/Fastship/t3-2faddaca | 6aca47c3190e | 589 / 0 | 0 | End-of-line-only diff; preserved |
| C:/Users/osama/.t3/worktrees/Fastship/t3-41a545fa | db3e5b43a252 | 571 / 0 | 0 | End-of-line-only diff; preserved |
| C:/Users/osama/.t3/worktrees/Fastship/t3-5a17dd96 | 6aca47c3190e | 589 / 0 | 2 | Substantive edits preserved; tracked patch archived; compare requirements with current release before porting |
| C:/Users/osama/.t3/worktrees/Fastship/t3-733b16b2 | 62d1f5d0e111 | 569 / 0 | 0 | End-of-line-only diff; preserved |
| C:/Users/osama/.t3/worktrees/Fastship/t3-9015813b | 58492d8225b5 | 571 / 0 | 0 | End-of-line-only diff; preserved |
| C:/Users/osama/.t3/worktrees/Fastship/t3-ac2e9bb3 | c3662937a246 | 571 / 0 | 0 | End-of-line-only diff; preserved |
| C:/Users/osama/.t3/worktrees/Fastship/t3-bb5ccf24 | 2f887c1b4374 | 902 / 1 | 0 | Untracked material preserved; no automatic deletion |
| C:/Users/osama/.t3/worktrees/Fastship/t3-f672ee2d | e3399ed5a67f | 571 / 0 | 0 | End-of-line-only diff; preserved |
| C:/Users/osama/.t3/worktrees/Fastship/ui-ux-pro-max-20261107 | 442032625f59 | 938 / 4 | 203 | Substantive edits preserved; tracked patch archived; compare requirements with current release before porting |
| C:/Users/osama/.t3/worktrees/Fastship/ui-ux-pro-max-20261107-final | c9b45078b2cc | 19 / 88 | 19 | Substantive edits preserved; tracked patch archived; compare requirements with current release before porting |
| C:/Users/osama/.traycer/worktrees/osamaabujarad45-jpg__wind/traycer-wind-daring-badger-f2c9edbd2c57 | 445fc7afbe55 | 0 / 0 | 0 | Removed: clean, ancestor of origin/master, no ignored files |
| C:/Users/osama/.traycer/worktrees/osamaabujarad45-jpg__wind/traycer-wind-zealous-ocelot-42a288ba92cd | 445fc7afbe55 | 91 / 3 | 91 | Substantive edits preserved; tracked patch archived; compare requirements with current release before porting |
| C:/Users/osama/copilot-worktrees/Fastship/copilot-prewarm-crispy-doodle | b60922952d60 | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/Users/osama/copilot-worktrees/Fastship/osama-2000236-urban-spoon | 9bc322a4e30e | 0 / 0 | 0 | Removed: clean, ancestor of origin/master, no ignored files |
| C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.azure-review-worktree | 2a452b9c26ff | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.claude/worktrees/app-quality-map-fixes-e25a59 | b60922952d60 | 682 / 0 | 0 | End-of-line-only diff; preserved |
| C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.claude/worktrees/aws-credits-92c2ce | 3c1280442031 | 600 / 0 | 0 | End-of-line-only diff; preserved |
| C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.claude/worktrees/client-1105 | 279a9ef77f80 | 902 / 0 | 0 | End-of-line-only diff; preserved |
| C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.claude/worktrees/cloud-features-app-completion-d38b55 | 855b9ea53d03 | 863 / 0 | 1 | Substantive edits preserved; tracked patch archived; compare requirements with current release before porting |
| C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.claude/worktrees/command-receipts-3 | d682e825e686 | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.claude/worktrees/dispute-resend-2a | 645840beb926 | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.claude/worktrees/finish-1105 | 3d085f280f97 | 894 / 0 | 0 | End-of-line-only diff; preserved |
| C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.claude/worktrees/leftover-tasks-4716c1 | af27c485ed09 | 0 / 1 | 0 | Untracked material preserved; no automatic deletion |
| C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.claude/worktrees/maps-not-working-f744ba | 201a989162aa | 862 / 2 | 69 | Substantive edits preserved; tracked patch archived; compare requirements with current release before porting |
| C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.claude/worktrees/maps-real-data-59869d | 2cb943fd4e1f | 881 / 0 | 3 | Substantive edits preserved; tracked patch archived; compare requirements with current release before porting |
| C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.claude/worktrees/ops-1105 | c48c944443fe | 904 / 0 | 7 | Substantive edits preserved; tracked patch archived; compare requirements with current release before porting |
| C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.claude/worktrees/pr12-fix | b4edbcb11195 | 902 / 0 | 0 | End-of-line-only diff; preserved |
| C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.claude/worktrees/project-status-64e25b | 4faaa6e2e652 | 607 / 3 | 23 | Substantive edits preserved; tracked patch archived; compare requirements with current release before porting |
| C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.claude/worktrees/review-continue-multi-agent-847a37 | 203914a8c8f4 | 0 / 1 | 0 | Untracked material preserved; no automatic deletion |
| C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.claude/worktrees/review-continue-session-e13b27 | b60922952d60 | 710 / 7 | 130 | Substantive edits preserved; tracked patch archived; compare requirements with current release before porting |
| C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.claude/worktrees/strange-burnell-8f3bf7 | b60922952d60 | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/Users/osama/OneDrive/Documents/ChatGPT/Fastship/.claude/worktrees/uber-rider-app-research-ef04cc | 13850b942509 | 819 / 0 | 0 | End-of-line-only diff; preserved |
| C:/w/wind-a01 | e8a95cabeed0 | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-a03 | 922bdefc8286 | 0 / 0 | 0 | Removed: clean, ancestor of origin/master, no ignored files |
| C:/w/wind-a12 | 7a2d3b1b2616 | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-a14 | facc83370317 | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-a3a9 | e03367a12f4c | 0 / 0 | 0 | Removed: clean, ancestor of origin/master, no ignored files |
| C:/w/wind-adm12 | 9fce439f3a6f | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-apk | ec6b9513e287 | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-apk2 | 769c83de0b12 | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-apk3 | b4cabc9444d1 | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-approvals | 096608da608a | 0 / 0 | 0 | Removed: clean, ancestor of origin/master, no ignored files |
| C:/w/wind-audit-1123 | b94712b7c0cd | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-c01 | 941471473fa9 | 0 / 0 | 0 | Removed: clean, ancestor of origin/master, no ignored files |
| C:/w/wind-cash | a4982cc9e193 | 0 / 0 | 0 | Removed: clean, ancestor of origin/master, no ignored files |
| C:/w/wind-cashmsg | dc3199397317 | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-cashui | 1275b554d628 | 0 / 0 | 0 | Removed: clean, ancestor of origin/master, no ignored files |
| C:/w/wind-codex-resume-1118 | 22bdc46c7984 | 51 / 2 | 51 | Substantive edits preserved; tracked patch archived; compare requirements with current release before porting |
| C:/w/wind-deploy-pilot | 5aa1977cf3e9 | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-deps | 4f663b7f0b25 | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-docs-fable | 371cccfd2459 | 0 / 0 | 0 | Removed: clean, ancestor of origin/master, no ignored files |
| C:/w/wind-ds-v2 | b3ec446c9e90 | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-eas | fb05483d07ee | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-eas-node24 | c883c148ebd9 | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-geo01 | 2b26c753e462 | 0 / 0 | 0 | Removed: clean, ancestor of origin/master, no ignored files |
| C:/w/wind-geo03 | 877869263bc2 | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-handoff | 37ca321961af | 0 / 0 | 0 | Removed: clean, ancestor of origin/master, no ignored files |
| C:/w/wind-handoff2 | d21d9f7be43a | 0 / 0 | 0 | Removed: clean, ancestor of origin/master, no ignored files |
| C:/w/wind-lead-1119b | b9fdf331e1a4 | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-master-3b102aad | 3b102aad916a | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-night2 | 4170713f0b5f | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-pilot-1123 | 9ad7a223a392 | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-pilot-polish | 10a7dea7b808 | 0 / 0 | 0 | Removed: clean, ancestor of origin/master, no ignored files |
| C:/w/wind-pinkb | 67ce6b13833a | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-plan | 88d0990f5029 | 0 / 0 | 0 | Removed: clean, ancestor of origin/master, no ignored files |
| C:/w/wind-polish-1121 | 73a71936dda6 | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-prod-israel | 2d9c45ca0004 | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-rel | 7ca9ad2b9a6b | 0 / 0 | 0 | Removed: clean, ancestor of origin/master, no ignored files |
| C:/w/wind-release-078da0a2 | 078da0a2dbf6 | 0 / 0 | 0 | Removed: clean, ancestor of origin/master, no ignored files |
| C:/w/wind-release-8df0f778 | 8df0f7781272 | 0 / 0 | 0 | Removed: clean, ancestor of origin/master, no ignored files |
| C:/w/wind-review-master | 9f1d2a054f39 | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-review-reconcile-1123 | b8e383d373d6 | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-rvfix | c738abac7f8c | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-scope | 40abfc3b3e35 | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-screens | f812734c0994 | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-shop | 6ceb200da7a2 | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-sol-fixes | da9f22186e88 | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-sol-lead-1121 | 5a4eab44958e | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-sol-polish-1121 | 9904aa793fb9 | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-srs | da5784f3194a | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-support | ffa2bb412d01 | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-test-158d6ed3 | 158d6ed3aeac | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-test-17cb2606 | 17cb26063ef3 | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-test-1ef5acc4 | 1ef5acc4cccb | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-test-30ad10db | 30ad10dbb0e3 | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-test-3533f4d7 | 3533f4d7deb4 | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-test-5a4eab44 | 5a4eab44958e | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-test-7f3e85b1 | 7f3e85b1d06d | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-test-8b9b9edc | 8b9b9edcea12 | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-test-90db0d34 | 90db0d348a3f | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-test-b22fec38 | b22fec38af72 | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-test-b2d49ed8 | b2d49ed8f4cf | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-test-b6f7f451 | b6f7f451b94b | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-test-b9fdf331 | b9fdf331e1a4 | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-test-be53b67a | be53b67a24f2 | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-test-c1758b4c | c1758b4c77b3 | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-test-c4f6e7e1 | c4f6e7e1b39c | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-test-cab502a9 | cab502a9ccbc | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-test-cb61be51 | cb61be51cb2c | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-test-e28faa98 | e28faa98f6d5 | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-test-e57a1e52 | e57a1e5241da | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-test-eb6bd4f3 | eb6bd4f390df | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-test-ed4a5d65 | ed4a5d6545d8 | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-test-f15c4bf4 | f15c4bf4c145 | 0 / 0 | 0 | Divergent/squashed history preserved; not automatically merged |
| C:/w/wind-ux02 | 5b540f9f21ac | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-ux03 | aed6f7212638 | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-ux05 | 26ae4e4f233a | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-v112 | 68de2939849d | 0 / 0 | 0 | Removed: clean, ancestor of origin/master, no ignored files |
| C:/w/wind-v113 | d635f0af7f21 | 0 / 0 | 0 | Removed: clean, ancestor of origin/master, no ignored files |
| C:/w/wind-ver | 39c841ab501c | 0 / 0 | 0 | Removed: clean, ancestor of origin/master, no ignored files |
| C:/w/wind-wp01 | c04820289cdb | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-wp02 | 75dc68ff4da7 | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-wp03 | 7604166485a5 | 0 / 0 | 0 | Removed: clean, ancestor of origin/master, no ignored files |
| C:/w/wind-wp06 | 8db687e4b5bf | 0 / 0 | 0 | Removed: clean, ancestor of origin/master, no ignored files |
| C:/w/wind-wp07 | 03e52787240d | 0 / 0 | 0 | Removed: clean, ancestor of origin/master, no ignored files |
| C:/w/wind-wp09 | 803f1d12d559 | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
| C:/w/wind-wp11 | e8b17164be57 | 0 / 0 | 0 | Merged history; ignored QA/dependency data preserved |
