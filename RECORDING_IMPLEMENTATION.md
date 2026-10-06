# SFA recording implementation

This document maps the implementation to the requirements explained in the
6 October 2026 recording. The recording is the source of truth for this scope.

## 1. Employees and hierarchy

The Employee object contains:

- Employee Name
- Aadhaar Number (12 characters)
- PAN Number (10 characters)
- Phone Number
- Emergency Contact
- Geography
- Reporting Manager
- Hierarchy Level
- Salesforce User
- Profile Picture

Configured demonstration hierarchy:

| Employee | Level | Reporting manager |
| --- | --- | --- |
| Dhanush | L1 | Dinesh |
| Dinesh | L2 | Aishwarya |
| Aishwarya | L3 | Ram |
| Ram | L4 | — |

Dhanush, Aishwarya and Ram have Salesforce Platform users. Dinesh is linked to
the administrator user so that Dhanush's submitted PJP reaches Dinesh for
approval.

## 2. Geography

The Geography object implements the hierarchy shown in the recording:

`Nation → State → District → Town → Municipality → Village`

Nation, State, District and Town are dependent picklists. Municipality and
Village remain optional, as demonstrated in the recording.

Four example geographies are available:

- MG Road Geography
- Indiranagar Geography
- Jayanagar Geography
- Mysuru Geography

## 3. Beats

Beat contains:

- Beat ID (automatic number using `BEAT-0000` format)
- Beat Name
- Assigned Employee
- Distributor
- Geography
- Active status

Ten complete demonstration beats are present. Each is assigned to Dhanush,
contains a distributor and geography, and has ten related outlets:

1. MG Road Beat
2. Indiranagar Beat
3. Jayanagar Beat
4. Koramangala Beat
5. Whitefield Beat
6. Malleshwaram Beat
7. Rajajinagar Beat
8. Yelahanka Beat
9. Electronic City Beat
10. Mysuru Central Beat

## 4. Outlets

Outlet contains the fields requested in the recording:

- Outlet Name
- Outlet Owner Name
- Contact Number
- Email
- Aadhaar Number
- PAN Number
- Geolocation
- Geography
- Beat

The ten-beat demonstration dataset contains 100 connected outlet records.
When a beat is selected, the outlet geography is copied from the beat by the
`OutletGeographyTrigger` and `SfaRecordedScopeHandler`.

## 5. Permanent Journey Plan

Open **SFA Mobile → PJP Planner**.

1. Log in as the employee, for example Dhanush.
2. Select Dhanush in the Employee field.
3. Select the plan month.
4. The complete calendar for that month is displayed.
5. Select one beat for each required day.
6. Use **Cancel** to discard unsaved screen changes and reload the saved plan.
7. Use **Submit for Approval** to submit all Draft or Rejected days.
8. Submitted records change to **Pending**.
9. The reporting manager receives a Salesforce custom notification.
10. The manager opens PJP Planner and uses **Approve** or **Reject**.
11. The final status becomes **Approved** or **Rejected**.

Supported status flow:

`Draft → Pending → Approved / Rejected`

The `PjpApproverTrigger` automatically copies the employee's reporting manager
to the plan's Approver field.

## 6. Verified Salesforce data

- Employees: 4 records, including the three employee users and Dinesh manager
- Geographies: 4 records
- Complete recording dataset: 10 beats and 100 connected outlets
- PJP submit and manager approval demonstrated successfully
- All object tabs contain an **All Records** list view

## 7. Automated verification

The following Salesforce tests passed in the target org:

- `PjpPlannerControllerTest.savesSubmitsAndApprovesPlan`
- `PjpPlannerControllerTest.copiesBeatGeographyToOutlet`
- `SfaMobileControllerTest.runsCompleteDailyJourney`
- `SfaMobileControllerTest.seedsDemoDataIdempotently`
- `SfaAdminControllerTest.returnsDistributorSummaryAndAttendance`

Test result: 7 tests passed, 0 failures, with 87% org-wide Apex coverage.
