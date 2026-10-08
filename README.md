# SFA Mobile Application

This Salesforce DX project implements the field-sales journey explained in the 30 September 2026 training recording.

## Included scope

- Start and end the sales representative's working day.
- Load today's permanent journey plan and retailer visits.
- Check in to a retailer and record the check-in time.
- Mark a visit as completed, missed or cancelled.
- Show sellable products, current stock, price and case-to-piece conversion.
- Capture a secondary order from a retailer to a distributor.
- Apply or display the five scheme types discussed by the trainer:
  - Buy the same product and get the same product free.
  - Buy a product and get a different/non-listed product free.
  - Buy a product and get another listed product free.
  - Slab discount.
  - Bundle offer.
- Use a responsive Lightning Web Component that works in Salesforce desktop and the Salesforce mobile app.

## Project structure

- `force-app/main/default/lwc/sfaMobileApp` — mobile user interface.
- `force-app/main/default/classes/SfaMobileController.cls` — readable server-side operations.
- `force-app/main/default/classes/SfaMobileControllerTest.cls` — automated Apex coverage.
- `force-app/main/default/objects` — SFA data model and fields.
- `force-app/main/default/applications/SFA_Mobile.app-meta.xml` — Lightning application.
- `manifest/package.xml` — deployment manifest.
- `docs/REQUIREMENTS_FROM_RECORDING.md` — traceability to the trainer's explanation.
- `docs/DATA_MODEL.md` — object relationships and design notes.
- `docs/SALESFORCE_CODE_STANDARDS.md` — Apex, trigger, security, naming and testing standards.
- `sales-rep-mobile/backend` — external mobile API and Salesforce integration.
- `sales-rep-mobile/mobile` — external React Native/Expo mobile application.

## Deployment

The verified deployment target is the new Salesforce Developer Edition org:

- Username: `aishwaryahs142003.6d2fd18ea3e1@agentforce.com`
- Local CLI alias: `sfaNewOrg`
- Org ID: `00DjV000004opjNUAQ`
- My Domain: `orgfarm-33ef5eba22-dev-ed`

Authenticate the org locally, then deploy and test with:

```text
sf project deploy start --manifest manifest/package.xml --target-org sfaNewOrg --test-level RunSpecifiedTests --tests SfaMobileControllerTest
sf org assign permset --name SFA_Mobile_User --target-org sfaNewOrg
sf apex run --file scripts/apex/runDemoSeed.apex --target-org sfaNewOrg
```

The package was deployed successfully on 2 October 2026: 113 components, two tests, zero failures and no coverage warnings. The included idempotent seed script creates the manager-demo records without duplicating them when it is run again.

See `docs/NEW_ORG_DEPLOYMENT.md` for verification details and the exact demo data.
