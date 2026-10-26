SFA / DMS readability and explanation tools

These tools are isolated from both applications' runtime dependencies.
Install here: npm ci --ignore-scripts
Check Apex formatting: npm run check:apex
Verify formatter AST/stability: npm run verify:apex-format
Apply Apex formatting only after reviewing a backup: npm run format:apex

From the project root:
  node tools/code-quality/build-code-guide.cjs
  node tools/code-quality/check-code-guide.cjs

guide-content.cjs contains the curated process/business explanations.
build-code-guide.cjs adds per-file roles, symbol/route outlines and numbered
syntax/operation notes. These generated notes are not a manual semantic audit.
check-code-guide.cjs verifies source hashes, exact numbered lines and local links.

2026-10-26 verification:
  Salesforce check-only: 0AfjV000004xhxuSAA, Succeeded, 50 tests, 0 failures.
  Backend: 39 passing, 8 skipped; build passed.
  SFA mobile: 26 passing; typecheck passed.
  DMS: UI and logout regression scripts, plus typecheck passed.
  Apex formatter debug-check and formatting check passed.

Changed business-code structure:
  DmsDistributorLifecycle -> DmsDistributorLifecycleHandler
  DmsDistributorSurvey -> DmsDistributorSurveyHandler
  DmsSalesTarget -> DmsSalesTargetHandler
  DmsTriggerHandlersTest tests extracted survey/target behavior in bulk.

Existing compilation repairs:
  SfaEmployeeInvitationService: missing continue semicolon.
  PjpPlannerController: missing method/class closing braces.
  DmsTransactionApi: InputException suffix; serialize JSON in a void REST method;
    rename approvalRequest to avoid shadowing the Approval platform class.

No real deployment was performed. Deploy handler classes and their dispatching
triggers together only after review. Do not run a guide-generation command as a
deployment command. Do not treat the legacy REST endpoint as newly approved for
external use; its permissions and caller scope still need a production review.

Backups: backups/code-readability-20261026. Existing dependencies, secrets,
Salesforce records, mail delivery configuration and installed APKs were not changed.

Prettier 3.9.10 reported unstable formatting for backend/src/visitRecovery.test.ts.
That test remains unchanged and is excluded from the app formatting pass.
Method documentation pass (26 October 2026)
------------------------------------------
Run npm run check:methods to compare named method documentation and executable
syntax against the preserved pre-edit baseline. The detailed scope and results are
in ../../diagnostics/method-comments/RESULTS.txt. This is a documentation-only
change; no Salesforce deployment or APK rebuild was performed for this pass.
The baseline comparison is specific to this pass, not a restriction against future
authorized functional changes. Keep the baseline and backups together when using it.

