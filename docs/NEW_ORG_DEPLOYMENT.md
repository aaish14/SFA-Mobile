# New Org Deployment Record

## Target

- Username: `aishwaryahs142003.6d2fd18ea3e1@agentforce.com`
- Salesforce CLI alias: `sfaNewOrg`
- Org ID: `00DjV000004opjNUAQ`
- Instance: `https://orgfarm-33ef5eba22-dev-ed.develop.my.salesforce.com`
- Edition: Developer Edition
- Deployment date: 2 October 2026

No password, access token or refresh token is stored in this project.

## Verified deployment

- Status: Succeeded
- Deployment ID: `0AfjV000003Ep4ASAS`
- Components deployed: 113
- Component errors: 0
- Apex tests completed: 2
- Apex test errors: 0
- Code-coverage warnings: 0
- Permission set assigned: `SFA_Mobile_User`

## Demo data loaded

- Beat: Central Market Beat
- Retailer: Lakshmi Stores Demo
- Address: MG Road, Bengaluru
- Journey plan: Today SFA Demo Plan
- Visit: Lakshmi Stores Visit (Planned)
- Product: Parle-G Demo Pack (`PG-DEMO-001`)
- Retailer base price: INR 8.50
- Selling price: INR 9.00
- Pieces per case: 50
- Available stock: 500 pieces
- Scheme: Buy 2 Get 1 Demo (`B2G1-DEMO`)

Run `scripts/apex/runDemoSeed.apex` again whenever today's demonstration records need to be recreated. The data factory is idempotent and avoids duplicate demo records.

## Important migration note

The org1 field `Retailer__c.Distributor__c` was not transferred because it depends on a separate `Distributor__c` object that is outside the SFA Mobile project and is not used by the application. All fields used by the LWC, Apex controller, automated tests and demo journey are included.
