/*
 * Phase 2 demo data. Safe to run more than once: every record is found by its
 * human-readable name/code before it is inserted.
 */
Employee__c representative;
List<Employee__c> linkedEmployees = [
    SELECT Id, Name FROM Employee__c
    WHERE Salesforce_User__c = :UserInfo.getUserId() AND Active__c = true LIMIT 1
];
if (linkedEmployees.isEmpty()) {
    representative = new Employee__c(
        Name = 'Creative Field Representative', Employee_Code__c = 'REP-CREATIVE-01',
        Phone__c = '9000014141', Active__c = true, Salesforce_User__c = UserInfo.getUserId()
    );
    insert representative;
} else representative = linkedEmployees[0];

Beat__c demoBeat;
List<Beat__c> beats = [SELECT Id FROM Beat__c WHERE Name = 'Lakeside Market Beat' LIMIT 1];
if (beats.isEmpty()) {
    demoBeat = new Beat__c(Name='Lakeside Market Beat', Active__c=true, Assigned_Employee__c=representative.Id);
    insert demoBeat;
} else demoBeat = beats[0];

Retailer__c outlet;
List<Retailer__c> outlets = [SELECT Id FROM Retailer__c WHERE Name='Nandi Daily Mart' LIMIT 1];
if (outlets.isEmpty()) {
    outlet = new Retailer__c(
        Name='Nandi Daily Mart', Outlet_Owner_Name__c='Meera Rao', Outlet_Type__c='Grocery',
        Phone__c='9886014141', Address__c='18 Lakeside Main Road, Bengaluru', Active__c=true, Beat__c=demoBeat.Id
    );
    insert outlet;
} else outlet = outlets[0];

Product__c product;
List<Product__c> products = [SELECT Id FROM Product__c WHERE Product_Code__c='SMB-100' LIMIT 1];
if (products.isEmpty()) {
    product = new Product__c(
        Name='Sunrise Millet Bites', Product_Code__c='SMB-100', Brand__c='Sunrise Foods',
        Variant__c='Classic Masala', Package_Type__c='Packet', Batch_Number__c='SMB-OCT-26',
        MRP__c=25, Retailer_Base_Price__c=20, Selling_Price__c=22, GST_Percent__c=5,
        Units_Per_Case__c=24, Available_Stock__c=480, Manufacturing_Date__c=Date.today().addDays(-15),
        Expiry_Date__c=Date.today().addMonths(6), Active__c=true, Sellable__c=true, Returnable__c=true
    );
    insert product;
} else product = products[0];

Visit__c demoVisit;
List<Visit__c> visits = [SELECT Id FROM Visit__c WHERE Name='Nandi Daily Mart Demo Visit' AND Visit_Date__c=:Date.today() LIMIT 1];
if (visits.isEmpty()) {
    Permanent_Journey_Plan__c demoPlan = new Permanent_Journey_Plan__c(
        Name='Lakeside Market Daily Plan', Beat__c=demoBeat.Id, Planned_Date__c=Date.today(),
        Plan_Date__c=Date.today(), Sales_Representative__c=UserInfo.getUserId(), Status__c='Approved'
    );
    insert demoPlan;
    demoVisit = new Visit__c(Name='Nandi Daily Mart Demo Visit', Retailer__c=outlet.Id, Permanent_Journey_Plan__c=demoPlan.Id, Visit_Date__c=Date.today(), Status__c='Checked In', Check_In_Time__c=System.now());
    insert demoVisit;
} else demoVisit = visits[0];

if ([SELECT COUNT() FROM Asset_Survey__c WHERE Visit__c=:demoVisit.Id] == 0)
    insert new Asset_Survey__c(Visit__c=demoVisit.Id, Outlet__c=outlet.Id, Asset_Name__c='Sunrise Display Rack', Asset_Code__c='RACK-NDM-01', Status__c='Working', Given_Date__c=Date.today().addMonths(-2));
if ([SELECT COUNT() FROM Stock_Check__c WHERE Visit__c=:demoVisit.Id] == 0)
    insert new Stock_Check__c(Visit__c=demoVisit.Id, Outlet__c=outlet.Id, Product__c=product.Id, Quantity__c=36, Manufacturing_Date__c=Date.today().addDays(-15));
if ([SELECT COUNT() FROM Competitor_Activity__c WHERE Visit__c=:demoVisit.Id] == 0)
    insert new Competitor_Activity__c(Visit__c=demoVisit.Id, Outlet__c=outlet.Id, Competitor_Name__c='Crispy Millet Mix', Company__c='Green Bowl Foods', MRP__c=28, RBP__c=23, Scheme_Details__c='Buy 10 pouches and receive 2 free');
if ([SELECT COUNT() FROM SFA_Ticket__c WHERE Visit__c=:demoVisit.Id] == 0)
    insert new SFA_Ticket__c(Visit__c=demoVisit.Id, Outlet__c=outlet.Id, Subject__c='Display rack branding replacement', Description__c='Old branding is faded and should be replaced on the next service visit.', Status__c='Open');

System.debug('Phase 2 demo is ready for outlet: ' + outlet.Name);
