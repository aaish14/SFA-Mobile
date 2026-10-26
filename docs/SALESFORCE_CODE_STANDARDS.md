# Salesforce Apex and Trigger Coding Standards

These standards apply to the SFA project under `force-app/main/default`. They are intended to keep the code readable for a new developer, safe for Salesforce governor limits, and predictable during deployment.

## Documentation pass: 26 October 2026

This pass adds method-purpose comments to the existing Apex, LWC, backend, SFA mobile and DMS source, plus trigger entry-point descriptions. It applies the pinned Apex formatter. It does **not** change business rules, sharing keywords, permissions, record APIs or data. It does not deploy to Salesforce or rebuild an APK.

The rules below are development/review requirements, not a claim that every legacy path already satisfies them. In particular, `Employee__c` currently has separate allocation and invitation triggers; their consolidation needs a separately tested change. Legacy controllers and REST endpoints also require their own authorization/CRUD/FLS review. Documentation does not make them security-certified.

Scope: application source under `force-app/main/default/{classes,triggers,lwc}`, `sales-rep-mobile/backend/src`, `sales-rep-mobile/mobile/src`, `dms-mobile/src`, and the two app entry components. Dependencies, generated bundles, generated handbook pages, metadata XML, secrets and third-party code are not rewritten. Anonymous callbacks remain part of their documented enclosing method; this is method documentation, not a comment on every syntax line.

## 1. Naming conventions

Use names that describe the business purpose instead of implementation details.

| Item | Standard | Example |
| --- | --- | --- |
| Apex class | PascalCase | `SfaVisitActionsController` |
| Trigger | `<ObjectPurpose>Trigger` | `OutletGeographyTrigger` |
| Trigger handler | `<Domain>Handler` | `SfaRecordedScopeHandler` |
| Test class | `<ClassUnderTest>Test` | `SfaVisitActionsControllerTest` |
| Method | camelCase, verb first | `copyBeatGeography` |
| Boolean | `is`, `has`, or `can` prefix | `isActive` |
| Collection | plural business name | `outlets`, `employeeIds` |
| Map | describe key and value | `outletNamesByBeat` |
| Constants | UPPER_SNAKE_CASE | `MAX_OUTLETS_PER_BEAT` |

Avoid unclear names such as `x`, `temp`, `obj`, `data1`, `doWork`, or `handleStuff`.

## 2. Class design

- Use `with sharing` for controllers and services unless a documented system-level operation requires another sharing model.
- Keep each class focused on one business responsibility.
- Expose only the methods required by Lightning, Flow, REST, or other classes.
- Keep parsing, validation, querying, and DML in clearly separated methods when a method becomes difficult to scan.
- Add comments that explain business reasons. Do not add comments that merely repeat the next line of code.
- Return helpful user-facing errors with `AuraHandledException` from Lightning controllers.

```apex
public with sharing class OutletVisitService {
    public static void completeVisits(List<Visit__c> visitsToComplete) {
        validateVisits(visitsToComplete);
        update visitsToComplete;
    }

    private static void validateVisits(List<Visit__c> visitsToComplete) {
        // Validation implementation.
    }
}
```

## 3. Trigger standard

- Use one trigger per Salesforce object.
- Keep the trigger free of SOQL, DML, calculations, and business rules.
- Delegate to a handler method named after the business action.
- Pass `Trigger.new`, `Trigger.old`, `Trigger.newMap`, or `Trigger.oldMap` explicitly.
- Check the trigger context before calling a handler.

```apex
trigger OutletTrigger on Retailer__c (before insert, before update, after update) {
    if (Trigger.isBefore) {
        OutletTriggerHandler.prepareOutlets(Trigger.new);
    }

    if (Trigger.isAfter && Trigger.isUpdate) {
        OutletTriggerHandler.refreshRelatedRecords(Trigger.newMap, Trigger.oldMap);
    }
}
```

## 4. Bulkification and governor limits

- Assume every method receives 200 records.
- Never place SOQL, SOSL, DML, email sending, or callouts inside a loop.
- Gather IDs into a `Set<Id>`, query once, and store results in a `Map<Id, SObject>`.
- Perform one DML operation on a collection after processing.
- Query only the fields the method uses.
- Return immediately when there is no work.

```apex
Set<Id> beatIds = new Set<Id>();
for (Retailer__c outlet : outlets) {
    if (outlet.Beat__c != null) {
        beatIds.add(outlet.Beat__c);
    }
}

if (beatIds.isEmpty()) {
    return;
}

Map<Id, Beat__c> beatsById = new Map<Id, Beat__c>([
    SELECT Id, Geography__c
    FROM Beat__c
    WHERE Id IN :beatIds
]);
```

## 5. Salesforce security

- Use `with sharing` to respect record access.
- `with sharing` alone does not enforce object CRUD or field-level permissions. Do not describe a method as permission-safe solely because its class uses this keyword.
- Before returning data to Lightning or an external client, enforce object and field access where appropriate with `WITH USER_MODE`, user-mode database operations, or `Security.stripInaccessible`.
- Never place credentials, access tokens, passwords, SMTP secrets, or connected-app secrets in Apex, JavaScript, Git, or a ZIP file.
- Use Named Credentials for Salesforce callouts.
- Validate and escape external input before using it in dynamic SOQL.
- Do not expose internal exception stacks to mobile users.

## 6. DML and transaction handling

- Validate required business information before DML.
- Prefer updating only changed records.
- Use `Database.insert(records, false)` only when partial success is a deliberate requirement and failures are reported clearly.
- Do not catch an exception unless the code can recover or provide meaningful context.
- Make integrations idempotent with a unique external key when the same request may be retried.

## 7. Asynchronous work

- Use Queueable Apex for multi-step background processing.
- Use Batch Apex for datasets that exceed normal transaction limits.
- Use Scheduled Apex only for time-based orchestration.
- Avoid `@future` for new development unless a platform restriction specifically requires it.
- Keep callouts and email operations outside record-trigger loops.

## 8. Apex tests

- Use `@IsTest` classes and methods with meaningful scenario names.
- Create test data in the test; never depend on production records or `SeeAllData=true`.
- Cover positive, negative, bulk, and permission-sensitive paths.
- Use `Test.startTest()` and `Test.stopTest()` around the behavior being measured.
- Assert business outcomes, not only record counts.
- Test trigger batches with more than one record.
- Keep test-data creation in a small factory when several tests share the same model.

```apex
@IsTest
private class OutletGeographyTriggerTest {
    @IsTest
    static void copiesGeographyFromBeatForMultipleOutlets() {
        // Arrange, act, and assert.
    }
}
```

## 9. Formatting and readability

- Use four spaces for Apex indentation; do not use tabs.
- Put braces on the same line as the declaration.
- Use one statement per line.
- Break long SOQL across multiple lines with fields grouped logically.
- Prefer guard clauses over deeply nested conditions.
- Keep methods short enough that their purpose is visible without excessive scrolling.
- Use blank lines between logical sections of a method.

## 10. SFA project-specific rules

- Outlet code uses `Retailer__c`; UI labels may say Outlet, but API names remain unchanged.
- A Visit must always reference its Outlet and Permanent Journey Plan.
- Sales Orders must populate `Retailer__c`, `Visit__c`, `Product__c`, totals, and the selected scheme when applicable.
- Product details belong in `Order_Item__c`; the parent Sales Order also stores the primary product so standard page layouts display Product Name and SKU.
- GPS values must be stored in both the Salesforce geolocation field and the explicit latitude/longitude fields used by the external application.
- Mobile retry requests must include an idempotency key so duplicate Salesforce records are not created.
- Object and field API names must not be renamed without updating Apex, metadata, the Node backend, mobile types, tests, and deployment documentation together.

## 11. Review checklist

Before committing Salesforce code, confirm:

- The name communicates the business purpose.
- The trigger delegates to a handler.
- No query or DML statement is inside a loop.
- The implementation works with 200 records.
- Sharing and field access are considered.
- Errors are understandable and do not reveal secrets.
- Tests cover success, failure, and bulk behavior.
- Existing metadata and mobile API contracts remain compatible.
- No secrets, build output, dependencies, or temporary files are staged.

## 12. Method documentation convention

- Place an ApexDoc/JSDoc `/** ... */` block immediately above the method, before annotations or decorators.
- Start with the method's actual business purpose. Mention significant writes, ownership checks, workflow restrictions, retry behavior and return/error behavior when relevant.
- Explain case quantities versus piece quantities, saved invoice snapshots versus current catalogue prices, and local drafts versus confirmed Salesforce records explicitly.
- Add `@param`, `@returns` and `@throws` details when a non-obvious public contract needs them; do not repeat a parameter name as its explanation.
- Preserve useful existing comments. Update comments whenever the implementation changes; misleading comments are worse than missing ones.
- Test comments describe the scenario being asserted, not a promise that a test has passed.
- Do not call mock data live, an email accepted by a provider delivered, or a queued write saved in Salesforce.

Example:

```apex
/**
 * Derive the employee/outlet pair used to deduplicate allocation requests.
 * @param employeeId Employee whose outlet allocation is being considered.
 * @param outletId Outlet being allocated to that employee.
 * @return Stable pair key for this transaction's allocation map.
 */
private static String allocationKey(Id employeeId, Id outletId) {
    return String.valueOf(employeeId) + ':' + String.valueOf(outletId);
}
```

## 13. Backend, SFA mobile, DMS and LWC conventions

- Use the repository's two-space JavaScript/TypeScript indentation and shared formatter; keep four-space Apex indentation.
- Keep network requests in the established API/transport layer. Keep credentials on the backend; never include tokens or sign-in codes in comments or logs.
- Prefer explicit request/response types for new contracts. Do not remove existing types or rename exported APIs as part of formatting.
- Preserve hook order, dependency arrays, React keys and event handlers. Documentation edits must not alter JSX text or rendering expressions.
- Keep distributor/employee identity checks on the server. UI visibility and disabled buttons are not authorization.
- Persist retryable actions with a stable key before transmission. Only acknowledge a save after the server confirms it; retain failed work for correction.
- Treat display helpers, derived filters and draft edits as local operations, not Salesforce writes.
- Maintain account-scoped caches and prevent delayed responses from an old session replacing the current account's data.
- Keep accessible field labels and meaningful errors. Preserve loading, empty, expired-session and offline states.
- LWC controllers should keep the existing cacheability/decorator contracts, refresh record notifications after writes, and surface Apex errors as readable messages.

## 14. Local verification and safe rollout

From `tools/code-quality`:

```text
npm run check:apex
npm run verify:apex-format
npm run check:methods
```

`check:methods` compares executable syntax trees against the 26 October pre-edit baseline and checks documentation on named functions/methods. It ignores comments and source positions, not string literals or executable expressions. It is a guard for this documentation pass, not a replacement for tests or a permanent ban on future behavior changes. The original files are in `backups/method-comments-20261026`; audit results are in `diagnostics/method-comments/verification.json`. Neither directory is an application runtime dependency.

Run the backend build/tests, both app type checks, SFA component/storage tests and DMS UI/logout checks after changes. An Apex parser/formatter check is not an org compile or an Apex test run. Functional Salesforce changes still require an explicit deployment validation and the relevant Apex tests in the target org.

## Salesforce references

- [Bulk trigger patterns](https://trailhead.salesforce.com/content/learn/modules/apex_triggers/apex_triggers_bulk)
- [CRUD and field-level security](https://developer.salesforce.com/docs/platform/secure-coding/guide/secure-coding-access-control-protect-from-crud-fls-vulnerabilities.html)
- [Record sharing enforcement](https://developer.salesforce.com/docs/platform/secure-coding/guide/secure-coding-access-control-protect-from-sharing-violations.html)
