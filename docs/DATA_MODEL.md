# SFA data model

```text
User (Sales Representative)
 ├── Attendance__c
 └── Permanent_Journey_Plan__c ── Beat__c
                                  └── Retailer__c
                                       └── Visit__c
                                            └── Sales_Order__c
                                                 └── Order_Item__c ── Product__c

Scheme__c ── Product__c (buy product and optional reward product)
```

`Visit__c` is the operational centre of the mobile flow. The UI moves it from Planned to Checked In, then to Completed or Missed. `Sales_Order__c` records the secondary order captured during a visit.
