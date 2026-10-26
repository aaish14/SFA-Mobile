@IsTest
private class SfaPjpAllocationServiceTest {
    /**
     * Create the shared isolated records required by the test scenarios.
     */
    @TestSetup
    static void setup() {
        Geography__c geo = new Geography__c(
            Name = 'PJP Allocation Geo',
            Nation__c = 'India',
            State__c = 'Karnataka',
            District__c = 'Bengaluru Urban'
        );
        insert geo;
        Employee__c employee = new Employee__c(
            Name = 'PJP Employee',
            Phone__c = '9000000901',
            Active__c = true,
            Geography__c = geo.Id
        );
        Employee__c other = new Employee__c(
            Name = 'Other Employee',
            Phone__c = '9000000902',
            Active__c = true,
            Geography__c = geo.Id
        );
        insert new List<Employee__c>{ employee, other };
        Beat__c firstBeat = new Beat__c(
            Name = 'First Beat',
            Geography__c = geo.Id,
            Assigned_Employee__c = employee.Id,
            Active__c = true
        );
        Beat__c secondBeat = new Beat__c(
            Name = 'Second Beat',
            Geography__c = geo.Id,
            Assigned_Employee__c = employee.Id,
            Active__c = true
        );
        insert new List<Beat__c>{ firstBeat, secondBeat };
        employee.Beat__c = firstBeat.Id;
        update employee;
        insert new List<Retailer__c>{
            new Retailer__c(Name = 'First Outlet', Beat__c = firstBeat.Id, Active__c = true),
            new Retailer__c(Name = 'Second Outlet', Beat__c = secondBeat.Id, Active__c = true),
            new Retailer__c(Name = 'Inactive Outlet', Beat__c = secondBeat.Id, Active__c = false)
        };
    }

    /**
     * Build a draft journey plan for the allocation transition being tested.
     */
    private static Permanent_Journey_Plan__c draft(String status) {
        Id employeeId = [SELECT Id FROM Employee__c WHERE Name = 'PJP Employee'].Id;
        Id beatId = [SELECT Id FROM Beat__c WHERE Name = 'First Beat'].Id;
        Permanent_Journey_Plan__c plan = new Permanent_Journey_Plan__c(
            Name = 'Allocation Test PJP',
            Employee__c = employeeId,
            Beat__c = beatId,
            Status__c = status,
            Planned_Date__c = Date.today()
        );
        insert plan;
        return plan;
    }

    /**
     * Regression scenario: approved multi beat plan allocates only active outlets. Arrange
     * isolated test data, exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void approvedMultiBeatPlanAllocatesOnlyActiveOutlets() {
        Permanent_Journey_Plan__c plan = draft('Draft');
        List<PJP_Selected_Beat__c> selections = new List<PJP_Selected_Beat__c>();
        for (Beat__c beat : [SELECT Id FROM Beat__c]) {
            selections.add(
                new PJP_Selected_Beat__c(
                    PJP__c = plan.Id,
                    Beat__c = beat.Id,
                    Unique_Key__c = plan.Id + '-' + beat.Id
                )
            );
        }
        Database.insert(selections, AccessLevel.SYSTEM_MODE);
        System.assertEquals(0, [SELECT COUNT() FROM Distributor_Outlet_Allocation__c]);
        Test.startTest();
        plan.Status__c = 'Approved';
        update plan;
        SfaPjpAllocationService.syncApprovedPlans(new Set<Id>{ plan.Id });
        Test.stopTest();
        List<Distributor_Outlet_Allocation__c> allocations = [
            SELECT
                Employee__c,
                Distributor__c,
                Outlet__r.Active__c,
                Beat__c,
                Outlet__r.Beat__c,
                Allocation_Status__c
            FROM Distributor_Outlet_Allocation__c
        ];
        System.assertEquals(
            2,
            allocations.size(),
            'Repeated synchronization must not duplicate allocations.'
        );
        for (Distributor_Outlet_Allocation__c allocation : allocations) {
            System.assertEquals(plan.Employee__c, allocation.Employee__c);
            System.assertEquals(
                null,
                allocation.Distributor__c,
                'Employee allocations need no representative.'
            );
            System.assertEquals(true, allocation.Outlet__r.Active__c);
            System.assertEquals(allocation.Outlet__r.Beat__c, allocation.Beat__c);
            System.assertEquals('Active', allocation.Allocation_Status__c);
        }
    }

    /**
     * Regression scenario: legacy plan reuses inactive allocation and keeps manual notes.
     * Arrange isolated test data, exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void legacyPlanReusesInactiveAllocationAndKeepsManualNotes() {
        Permanent_Journey_Plan__c plan = draft('Submitted');
        Id outletId = [SELECT Id FROM Retailer__c WHERE Name = 'First Outlet'].Id;
        Distributor_Outlet_Allocation__c allocation = new Distributor_Outlet_Allocation__c(
            Employee__c = plan.Employee__c,
            Outlet__c = outletId,
            Beat__c = plan.Beat__c,
            Allocation_Status__c = 'Inactive',
            Allocation_Date__c = Date.today(),
            Remarks__c = 'Keep these notes'
        );
        insert allocation;
        Test.startTest();
        plan.Status__c = 'Approved';
        update plan;
        Test.stopTest();
        allocation = [
            SELECT Allocation_Status__c, Remarks__c
            FROM Distributor_Outlet_Allocation__c
            WHERE Id = :allocation.Id
        ];
        System.assertEquals('Active', allocation.Allocation_Status__c);
        System.assertEquals('Keep these notes', allocation.Remarks__c);
        System.assertEquals(1, [SELECT COUNT() FROM Distributor_Outlet_Allocation__c]);
    }

    /**
     * Regression scenario: non approved and unlinked plans do not allocate. Arrange isolated
     * test data, exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void nonApprovedAndUnlinkedPlansDoNotAllocate() {
        Permanent_Journey_Plan__c submitted = draft('Submitted');
        Permanent_Journey_Plan__c rejected = draft('Rejected');
        Permanent_Journey_Plan__c unlinked = new Permanent_Journey_Plan__c(
            Name = 'Unlinked',
            Beat__c = submitted.Beat__c,
            Status__c = 'Approved',
            Planned_Date__c = Date.today()
        );
        insert unlinked;
        Test.startTest();
        SfaPjpAllocationService.syncApprovedPlans(
            new Set<Id>{ submitted.Id, rejected.Id, unlinked.Id }
        );
        SfaPjpAllocationService.syncApprovedPlans(new Set<Id>());
        Test.stopTest();
        System.assertEquals(0, [SELECT COUNT() FROM Distributor_Outlet_Allocation__c]);
    }

    /**
     * Regression scenario: bulk approvals for overlapping plans are deduplicated. Arrange
     * isolated test data, exercise the workflow and assert the expected outcome.
     */
    @IsTest
    static void bulkApprovalsForOverlappingPlansAreDeduplicated() {
        Permanent_Journey_Plan__c sample = draft('Draft');
        List<Permanent_Journey_Plan__c> plans = new List<Permanent_Journey_Plan__c>();
        for (Integer i = 0; i < 200; i++)
            plans.add(
                new Permanent_Journey_Plan__c(
                    Name = 'Bulk ' + i,
                    Employee__c = sample.Employee__c,
                    Beat__c = sample.Beat__c,
                    Planned_Date__c = Date.today(),
                    Status__c = 'Approved'
                )
            );
        Test.startTest();
        insert plans;
        Test.stopTest();
        System.assertEquals(1, [SELECT COUNT() FROM Distributor_Outlet_Allocation__c]);
    }
}
