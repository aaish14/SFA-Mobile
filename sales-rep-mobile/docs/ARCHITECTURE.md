# Architecture and data flow

```text
Expo mobile app
  ├─ GPS permission and 100 m UX gate
  ├─ order, return, competitor, ticket and revisit forms
  └─ encrypted-transport API + offline idempotency queue
            ↓
Express API
  ├─ authentication, validation and duplicate protection
  ├─ server-side GPS validation
  ├─ PDF, Excel and email services
  └─ Salesforce adapter with token refresh
            ↓
Salesforce SFA objects
```

The device never receives a Salesforce client secret or access token. Each offline action has a unique request ID; the API safely returns the original result when the same request is retried.
