# Product identity display

The application displays each selected product's Brand, Sub-brand and Alias directly from its Salesforce Product record:

| Salesforce field | API field | Application label |
| --- | --- | --- |
| Product__c.Brand__c | brand | Brand |
| Product__c.Sub_Brand__c | subBrand | Sub-brand |
| Product__c.Brand_Alias__c | brandAlias | Alias |

`ProductIdentityFields` renders values from the selected product rather than holding separate state. Next Product changes the selected product, so all three values change together. Missing values display “Not set in Salesforce”; they never inherit another product's values. Catalogue filters are separate controls under Filter Products.

The same component is used in the product catalogue and the order, return and stock-check forms. No product data is inferred from product names. Administrators maintain values in Salesforce. The existing catalogue refresh/focus behavior fetches them through GET /api/products.

The SFA_Product_Metadata_Read permission set grants read-only access to these three fields. Assign it to the backend integration user; it does not grant edit access or replace existing object permissions.

## Verification — 16 October 2026

- Backend TypeScript build and 17 tests passed.
- Mobile TypeScript check and 23 tests passed.
- Product selection tests cover all three values changing, wraparound, filtered selections, missing values and an empty catalogue.
- A live read-only API comparison verified all three fields against Salesforce for 24 active, sellable products.
- At verification time, all 24 products had Brand and only 3 had Sub-brand and Alias populated. Populate the remaining records in Salesforce to display those values.

Android version code 11 includes this UI change. Previously installed APKs need to be updated. The existing backend hosting and connectivity requirements have not changed.
