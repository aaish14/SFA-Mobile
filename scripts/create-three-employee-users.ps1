param([string]$TargetOrg = 'sfaNewOrg')

$sf = 'C:\Program Files\sf\bin\sf.cmd'
$apiRoot = '/services/data/v67.0'
$profileId = ((& $sf data query --query "SELECT Id FROM Profile WHERE Name = 'Standard Platform User' LIMIT 1" --target-org $TargetOrg --json | ConvertFrom-Json).result.records[0].Id)
$permissionSetId = ((& $sf data query --query "SELECT Id FROM PermissionSet WHERE Name = 'SFA_Mobile_User' LIMIT 1" --target-org $TargetOrg --json | ConvertFrom-Json).result.records[0].Id)
$employeeRecords = ((& $sf data query --query "SELECT Id, Name FROM Employee__c WHERE Name IN ('Dhanush','Aishwarya','Ram')" --target-org $TargetOrg --json | ConvertFrom-Json).result.records)
$employeeIds = @{}
foreach ($employee in $employeeRecords) { $employeeIds[$employee.Name] = $employee.Id }

$users = @(
    @{ key='dhanush'; first='Dhanush'; last='SFA'; alias='dhanush'; employee='Dhanush' },
    @{ key='aishwarya'; first='Aishwarya'; last='SFA'; alias='aishw'; employee='Aishwarya' },
    @{ key='ram'; first='Ram'; last='SFA'; alias='ram'; employee='Ram' }
)
$requests = @()
foreach ($user in $users) {
    $userReference = "user_$($user.key)"
    $username = "$($user.key).sfa.00djv000004opjnuq@agentforce.com"
    $requests += @{
        method='POST'; url="$apiRoot/sobjects/User"; referenceId=$userReference
        body=@{
            Username=$username; Email='aishwaryahs142003@gmail.com'; FirstName=$user.first; LastName=$user.last
            Alias=$user.alias; CommunityNickname="$($user.key)_sfa_00djv"; ProfileId=$profileId; IsActive=$true
            TimeZoneSidKey='Asia/Kolkata'; LocaleSidKey='en_IN'; EmailEncodingKey='UTF-8'; LanguageLocaleKey='en_US'
        }
    }
    $requests += @{
        method='POST'; url="$apiRoot/sobjects/PermissionSetAssignment"; referenceId="permission_$($user.key)"
        body=@{ AssigneeId="@{$userReference.id}"; PermissionSetId=$permissionSetId }
    }
}

$payload = @{ allOrNone=$true; compositeRequest=$requests } | ConvertTo-Json -Depth 12 -Compress
$rawResponse = $payload | & $sf api request rest "$apiRoot/composite" --method POST --body - --target-org $TargetOrg
if ($LASTEXITCODE -ne 0) { throw "Salesforce request failed: $rawResponse" }
$response = $rawResponse | ConvertFrom-Json
$failed = @($response.compositeResponse | Where-Object { $_.httpStatusCode -lt 200 -or $_.httpStatusCode -ge 300 })
if ($failed.Count -gt 0) { throw ($failed | ConvertTo-Json -Depth 10) }

$employeeRequests = @()
foreach ($user in $users) {
    $createdUser = $response.compositeResponse | Where-Object referenceId -eq "user_$($user.key)"
    $employeeRequests += @{
        method='PATCH'; url="$apiRoot/sobjects/Employee__c/$($employeeIds[$user.employee])"; referenceId="employee_$($user.key)"
        body=@{ Salesforce_User__c=$createdUser.body.id }
    }
}
$employeePayload = @{ allOrNone=$true; compositeRequest=$employeeRequests } | ConvertTo-Json -Depth 10 -Compress
$employeeRawResponse = $employeePayload | & $sf api request rest "$apiRoot/composite" --method POST --body - --target-org $TargetOrg
if ($LASTEXITCODE -ne 0) { throw "Employee linking request failed: $employeeRawResponse" }
$employeeResponse = $employeeRawResponse | ConvertFrom-Json
$employeeFailures = @($employeeResponse.compositeResponse | Where-Object { $_.httpStatusCode -lt 200 -or $_.httpStatusCode -ge 300 })
if ($employeeFailures.Count -gt 0) { throw ($employeeFailures | ConvertTo-Json -Depth 10) }

foreach ($user in $users) {
    $created = $response.compositeResponse | Where-Object referenceId -eq "user_$($user.key)"
    [pscustomobject]@{ Employee=$user.employee; Username="$($user.key).sfa.00djv000004opjnuq@agentforce.com"; UserId=$created.body.id }
}
