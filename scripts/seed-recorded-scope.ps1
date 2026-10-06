param([string]$TargetOrg = 'sfaNewOrg')

$sf = 'C:\Program Files\sf\bin\sf.cmd'
$apiRoot = '/services/data/v67.0'
$currentUserId = ((& $sf data query --query "SELECT Id FROM User WHERE Username = 'aishwaryahs142003.6d2fd18ea3e1@agentforce.com'" --target-org $TargetOrg --json | ConvertFrom-Json).result.records[0].Id)

function Invoke-Composite([array]$Requests) {
    $payload = @{ allOrNone = $true; compositeRequest = $Requests } | ConvertTo-Json -Depth 12 -Compress
    $response = $payload | & $sf api request rest "$apiRoot/composite" --method POST --body - --target-org $TargetOrg
    if ($LASTEXITCODE -ne 0) { throw "Salesforce composite request failed: $response" }
    return $response | ConvertFrom-Json
}

function New-Request([string]$ReferenceId, [string]$ObjectName, [hashtable]$Body) {
    return @{ method = 'POST'; url = "$apiRoot/sobjects/$ObjectName"; referenceId = $ReferenceId; body = $Body }
}

$initial = @(
    (New-Request 'geo1' 'Geography__c' @{ Name='MG Road Geography'; Nation__c='India'; State__c='Karnataka'; District__c='Bengaluru Urban'; Town__c='MG Road'; Municipality__c='BBMP' }),
    (New-Request 'geo2' 'Geography__c' @{ Name='Indiranagar Geography'; Nation__c='India'; State__c='Karnataka'; District__c='Bengaluru Urban'; Town__c='Indiranagar'; Municipality__c='BBMP' }),
    (New-Request 'geo3' 'Geography__c' @{ Name='Jayanagar Geography'; Nation__c='India'; State__c='Karnataka'; District__c='Bengaluru Urban'; Town__c='Jayanagar'; Municipality__c='BBMP' }),
    (New-Request 'geo4' 'Geography__c' @{ Name='Mysuru Geography'; Nation__c='India'; State__c='Karnataka'; District__c='Mysuru'; Town__c='Mysuru'; Municipality__c='Mysuru City Corporation' }),
    (New-Request 'emp4' 'Employee__c' @{ Name='Ram'; Aadhaar_Number__c='400000000004'; PAN_Number__c='RAMAA0004A'; Phone__c='9000000004'; Emergency_Contact__c='9100000004'; Geography__c='@{geo1.id}'; Hierarchy_Level__c='L4' }),
    (New-Request 'emp3' 'Employee__c' @{ Name='Aishwarya'; Aadhaar_Number__c='400000000003'; PAN_Number__c='AISHW0003A'; Phone__c='9000000003'; Emergency_Contact__c='9100000003'; Geography__c='@{geo1.id}'; Hierarchy_Level__c='L3'; Reporting_Manager__c='@{emp4.id}' }),
    (New-Request 'emp2' 'Employee__c' @{ Name='Dinesh'; Aadhaar_Number__c='400000000002'; PAN_Number__c='DINAA0002A'; Phone__c='9000000002'; Emergency_Contact__c='9100000002'; Geography__c='@{geo1.id}'; Hierarchy_Level__c='L2'; Reporting_Manager__c='@{emp3.id}'; Salesforce_User__c=$currentUserId }),
    (New-Request 'emp1' 'Employee__c' @{ Name='Dhanush'; Aadhaar_Number__c='400000000001'; PAN_Number__c='DHANU0001A'; Phone__c='9000000001'; Emergency_Contact__c='9100000001'; Geography__c='@{geo1.id}'; Hierarchy_Level__c='L1'; Reporting_Manager__c='@{emp2.id}' })
)
$created = Invoke-Composite $initial
$ids = @{}
foreach ($item in $created.compositeResponse) { $ids[$item.referenceId] = $item.body.id }

$beatNames = @('MG Road Beat','Indiranagar Beat','Jayanagar Beat','Koramangala Beat','Whitefield Beat','Malleshwaram Beat','Rajajinagar Beat','Yelahanka Beat','Electronic City Beat','Mysuru Central Beat')
$beatRequests = @()
for ($i = 0; $i -lt $beatNames.Count; $i++) {
    $geoId = if ($i -eq 9) { $ids.geo4 } elseif ($i -eq 1) { $ids.geo2 } elseif ($i -eq 2) { $ids.geo3 } else { $ids.geo1 }
    $beatRequests += New-Request "beat$i" 'Beat__c' @{ Name=$beatNames[$i]; Active__c=$true; Assigned_Employee__c=$ids.emp1; Distributor__c='Demo Distributor'; Geography__c=$geoId }
}
$createdBeats = Invoke-Composite $beatRequests
foreach ($item in $createdBeats.compositeResponse) { $ids[$item.referenceId] = $item.body.id }

$outletRequests = @()
$serial = 1
for ($beatIndex = 0; $beatIndex -lt 10; $beatIndex++) {
    for ($outletNumber = 1; $outletNumber -le 10; $outletNumber++) {
        $serial4 = $serial.ToString('0000')
        $serial6 = $serial.ToString('000000')
        $outletRequests += New-Request "outlet$serial" 'Retailer__c' @{
            Name = if ($serial -eq 1) { 'Balaji Stores' } else { "Outlet $serial4" }
            Outlet_Owner_Name__c = if ($serial -eq 1) { 'Mukul' } else { "Owner $serial4" }
            Phone__c = '92' + (10000000 + $serial)
            Email__c = "outlet$serial@example.com"
            Aadhaar_Number__c = "500000$serial6"
            PAN_Number__c = "OUTLT${serial4}A"
            Beat__c = $ids["beat$beatIndex"]
            Address__c = "$($beatNames[$beatIndex]), Karnataka"
            Active__c = $true
        }
        $serial++
    }
}
for ($start = 0; $start -lt $outletRequests.Count; $start += 25) {
    $end = [Math]::Min($start + 24, $outletRequests.Count - 1)
    [void](Invoke-Composite $outletRequests[$start..$end])
}

Write-Output 'Created 4 geographies, 4 employees, 10 beats, and 100 outlets in the Salesforce org.'
