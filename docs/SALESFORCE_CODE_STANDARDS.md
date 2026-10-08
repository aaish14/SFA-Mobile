# Salesforce Apex and Trigger Coding Standards

These standards apply to the SFA project under `force-app/main/default`. They are intended to keep the code readable for a new developer, safe for Salesforce governor limits, and predictable during deployment.

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
