# SFA Phase 1 — Manager Demonstration

## Demonstration data

This implementation deliberately keeps the employees and places already present in the org.

| Purpose | Value |
|---|---|
| Sales representative | Dhanush |
| Approving manager | Dinesh |
| Higher managers | Aishwarya, Ram |
| Planning period | 1 October 2026 to 30 October 2026 |
| Selected beats | MG Road Beat, Indiranagar Beat |
| Outlets | 10 outlets under each demonstration beat |

## Before the demonstration

1. Log in to the new Salesforce org.
2. Open the App Launcher and select **SFA Mobile**.
3. Confirm that Dhanush is mapped to Dinesh in **Employees**.
4. Confirm that MG Road Beat and Indiranagar Beat are active and assigned to Dhanush.
5. Confirm the beats show their outlet counts.

## Employee flow — create and submit a PJP

1. Log in as **Dhanush SFA** by using Setup > Users > Dhanush SFA > Login.
2. Open **SFA Mobile** and select **PJP Planner**.
3. Point out that the page automatically identifies Dhanush and shows Dinesh as the manager.
4. Enter **Planning Start Date: 01-10-2026**.
5. Enter **Planning End Date: 30-10-2026**.
6. Select **MG Road Beat** and **Indiranagar Beat** in the Authorized Beats control.
7. Click **Save Draft**. Explain that a draft remains editable and is not yet visible as a pending approval.
8. Open the saved PJP in **My PJPs** and confirm the dates, selected beats, status, and manager.
9. Click **Submit for Approval**. The status becomes **Submitted**, the submitted date and submitting user are recorded, and the assigned manager is notified.

## Manager flow — approve

1. Log out as Dhanush.
2. Log in as **Dinesh** or use the administrator account linked to the Dinesh employee record.
3. Open **SFA Mobile** > **PJP Planner**.
4. In **PJP Approvals**, open Dhanush's submitted plan.
5. Show the employee, planning period, selected beats, beat count, and submitted date.
6. Click **Approve**.
7. Confirm that the status is **Approved** and the approved-by and approved-date audit values are populated.

## Rejection demonstration

1. As Dhanush, create another draft for a different valid date range and submit it.
2. As Dinesh, open the plan in **PJP Approvals**.
3. Enter a rejection reason such as **Please revise the beat coverage for this period**.
4. Click **Reject**.
5. Log back in as Dhanush and show the **Rejected** plan and the manager's reason in **My PJPs**.
6. Edit the plan, correct it, and resubmit it.

## Validation points to show the manager

- The end date cannot be earlier than the start date.
- At least one active beat assigned to the logged-in employee must be selected.
- An employee cannot select another employee's beat.
- Only the assigned manager can approve or reject a submitted PJP.
- An employee cannot approve their own PJP.
- A rejection requires a reason.
- Employee Aadhaar and PAN formats are validated, while sensitive values are excluded from the mobile permission set.
- An active beat must have an assigned employee.
- Outlet counts are maintained from the outlets assigned to each beat.

## One-minute explanation

“Dhanush signs in and opens PJP Planner. Salesforce identifies his employee record and manager, then displays only active beats assigned to him. He chooses a planning period and one or more beats, saves a draft, and submits it. Submission locks the approval route to Dinesh and records the audit details. Dinesh signs in, reviews the period and beat coverage, then approves or rejects with a reason. Dhanush can see the final status and any rejection reason in his own PJP list. All access and validation rules are enforced in Apex on the server, not only in the screen.”

