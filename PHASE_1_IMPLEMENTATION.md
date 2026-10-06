# SFA Phase 1 Implementation

## Reused project structure

The solution extends the project's existing Salesforce model instead of creating replacement objects:

- `Employee__c` — hierarchy, Salesforce user mapping, employee code, active status.
- `Geography__c` — existing place hierarchy.
- `Beat__c` — assigned employee, geography, active status, calculated outlet count.
- `Retailer__c` — outlets connected to beats and geographies.
- `Permanent_Journey_Plan__c` — PJP header, planning period, employee, approver, status, rejection reason, and approval audit fields.
- `PJP_Selected_Beat__c` — child records that allow one PJP to contain multiple authorized beats.

## Workflow

`Draft → Submitted → Approved` or `Draft → Submitted → Rejected → Resubmitted`

The Phase 1 PJP Planner Lightning Web Component handles employee planning and manager review in the same SFA Mobile application. `SfaPhaseOnePjpController` applies the authorization and workflow rules with sharing enabled.

## Important source files

- `force-app/main/default/lwc/pjpMonthlyPlanner/`
- `force-app/main/default/classes/SfaPhaseOnePjpController.cls`
- `force-app/main/default/classes/SfaPhaseOnePjpControllerTest.cls`
- `force-app/main/default/objects/Permanent_Journey_Plan__c/`
- `force-app/main/default/objects/PJP_Selected_Beat__c/`
- `force-app/main/default/permissionsets/SFA_Mobile_User.permissionset-meta.xml`

## Deployment

Authenticate the destination org, then run from this project folder:

```powershell
sf project deploy start --source-dir force-app --target-org sfaNewOrg --test-level RunLocalTests --wait 30
```

Assign the SFA permission set to each mobile user:

```powershell
sf org assign permset --name SFA_Mobile_User --target-org sfaNewOrg
```

