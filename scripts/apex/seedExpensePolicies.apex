// Baseline policies from the 14-Oct-2026 mentor discussion.
// Administrators can change rates, limits, geography, and dates without a mobile release.
List<Expense_Policy__c> policies = new List<Expense_Policy__c>{
    new Expense_Policy__c(Name='Own Two Wheeler - Per KM', Expense_Type__c='Travel Allowance', Category__c='Two Wheeler', Ownership__c='Own', Rate_Type__c='Per Kilometer', Rate__c=10, Receipt_Required__c=false, Start_Date__c=Date.today(), Active__c=true),
    new Expense_Policy__c(Name='Own Four Wheeler - Per KM', Expense_Type__c='Travel Allowance', Category__c='Four Wheeler', Ownership__c='Own', Rate_Type__c='Per Kilometer', Rate__c=10, Receipt_Required__c=false, Start_Date__c=Date.today(), Active__c=true),
    new Expense_Policy__c(Name='Rented Two Wheeler / Rapido', Expense_Type__c='Travel Allowance', Category__c='Two Wheeler', Ownership__c='Rented', Rate_Type__c='Actual', Maximum_Amount__c=1000, Receipt_Required__c=true, Start_Date__c=Date.today(), Active__c=true),
    new Expense_Policy__c(Name='AC Bus', Expense_Type__c='Travel Allowance', Category__c='Bus', Travel_Class__c='AC', Rate_Type__c='Per Trip', Maximum_Amount__c=1000, Receipt_Required__c=true, Start_Date__c=Date.today(), Active__c=true),
    new Expense_Policy__c(Name='Non-AC Bus', Expense_Type__c='Travel Allowance', Category__c='Bus', Travel_Class__c='Non-AC', Rate_Type__c='Per Trip', Maximum_Amount__c=700, Receipt_Required__c=true, Start_Date__c=Date.today(), Active__c=true),
    new Expense_Policy__c(Name='Bus Seater', Expense_Type__c='Travel Allowance', Category__c='Bus', Travel_Class__c='Seater', Rate_Type__c='Per Trip', Maximum_Amount__c=500, Receipt_Required__c=true, Start_Date__c=Date.today(), Active__c=true),
    new Expense_Policy__c(Name='Bus Sleeper', Expense_Type__c='Travel Allowance', Category__c='Bus', Travel_Class__c='Sleeper', Rate_Type__c='Per Trip', Maximum_Amount__c=800, Receipt_Required__c=true, Start_Date__c=Date.today(), Active__c=true),
    new Expense_Policy__c(Name='Train 1 AC', Expense_Type__c='Travel Allowance', Category__c='Train', Travel_Class__c='1 AC', Rate_Type__c='Per Trip', Maximum_Amount__c=1800, Receipt_Required__c=true, Start_Date__c=Date.today(), Active__c=true),
    new Expense_Policy__c(Name='Train 2 AC', Expense_Type__c='Travel Allowance', Category__c='Train', Travel_Class__c='2 AC', Rate_Type__c='Per Trip', Maximum_Amount__c=1500, Receipt_Required__c=true, Start_Date__c=Date.today(), Active__c=true),
    new Expense_Policy__c(Name='Economy Flight', Expense_Type__c='Travel Allowance', Category__c='Flight', Travel_Class__c='Economy', Rate_Type__c='Per Trip', Maximum_Amount__c=7000, Receipt_Required__c=true, Start_Date__c=Date.today(), Active__c=true),
    new Expense_Policy__c(Name='Half Day Allowance', Expense_Type__c='Daily Allowance', Category__c='Half Day Allowance', Rate_Type__c='Per Day', Maximum_Amount__c=250, Receipt_Required__c=false, Start_Date__c=Date.today(), Active__c=true),
    new Expense_Policy__c(Name='Full Day Allowance', Expense_Type__c='Daily Allowance', Category__c='Full Day Allowance', Rate_Type__c='Per Day', Maximum_Amount__c=500, Receipt_Required__c=false, Start_Date__c=Date.today(), Active__c=true),
    new Expense_Policy__c(Name='Food - Full Day', Expense_Type__c='Daily Allowance', Category__c='Food', Travel_Class__c='Full Day', Rate_Type__c='Per Day', Maximum_Amount__c=400, Receipt_Required__c=true, Start_Date__c=Date.today(), Active__c=true),
    new Expense_Policy__c(Name='Food - Per Meal', Expense_Type__c='Daily Allowance', Category__c='Food', Travel_Class__c='Per Meal', Rate_Type__c='Per Meal', Maximum_Amount__c=110, Receipt_Required__c=true, Start_Date__c=Date.today(), Active__c=true),
    new Expense_Policy__c(Name='Mobile Internet - Monthly', Expense_Type__c='Daily Allowance', Category__c='Mobile Internet', Rate_Type__c='Per Month', Maximum_Amount__c=400, Receipt_Required__c=true, Start_Date__c=Date.today(), Active__c=true),
    new Expense_Policy__c(Name='Petrol - Daily', Expense_Type__c='Daily Allowance', Category__c='Petrol', Rate_Type__c='Per Day', Maximum_Amount__c=500, Receipt_Required__c=true, Start_Date__c=Date.today(), Active__c=true)
};

Set<String> policyNames = new Set<String>();
for (Expense_Policy__c policy : policies) policyNames.add(policy.Name);
Set<String> existingNames = new Set<String>();
for (Expense_Policy__c existing : [SELECT Name FROM Expense_Policy__c WHERE Name IN :policyNames]) existingNames.add(existing.Name);
List<Expense_Policy__c> missing = new List<Expense_Policy__c>();
for (Expense_Policy__c policy : policies) if (!existingNames.contains(policy.Name)) missing.add(policy);
insert missing;
System.debug('Created ' + missing.size() + ' expense policies.');
