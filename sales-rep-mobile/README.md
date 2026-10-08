# SFA Field Sales Mobile

Standalone Expo/React Native mobile app with a TypeScript/Express API. It is not an LWC, Visualforce page or Salesforce navigation tab. It runs on localhost/Expo and uses Salesforce only as its secure backend data source. The flow is Home → Start Day → Beat → Outlet → 100 m validation → in-visit actions → checkout → PDF/Excel share → exit.

## Technology

- Mobile: Expo, React Native, TypeScript, React Navigation, Expo Location, AsyncStorage and NetInfo.
- API: Node.js, Express, TypeScript, Zod, JWT, PDFKit, ExcelJS and Nodemailer.
- Salesforce: server-side OAuth client-credentials adapter and configurable object names.
- Offline: local idempotent request queue with automatic/manual retry support.

## Run locally

1. Install Node.js 20 or newer.
2. The included `.env` uses `USE_MOCK_DATA=false` and the already authenticated Salesforce CLI alias `sfaNewOrg`. For an offline demo, change it to `true`.
3. Run `npm install --workspaces=false` inside `backend`, then repeat inside `mobile`.
4. Double-click `START-LOCAL-APP.cmd`, or run `npm run dev` inside `backend`.
5. In another terminal run `npm run web` inside `mobile` to see the mobile layout at `http://localhost:8081`.
6. For a physical phone, set `EXPO_PUBLIC_API_URL` to the computer's LAN API address, run `npm run mobile`, and scan the Expo Go QR code.
7. The local app login accepts any non-empty email/password. Salesforce authentication is server-side.

Run verification with `npm run build` and `npm test`.

## Salesforce configuration

1. Localhost automatically reuses the authenticated Salesforce CLI alias from `SALESFORCE_ORG_ALIAS`. For deployment, create a Salesforce Connected App / External Client App using the OAuth client-credentials flow.
2. Assign only the SFA permission sets needed by the integration user.
3. Put the client ID and secret only in the backend `.env`.
4. Keep `USE_MOCK_DATA=false`.
5. Configure object names in `.env`. All Salesforce HTTP calls are isolated in `backend/src/salesforce/SalesforceService.ts`.
6. Use HTTPS in production and store environment secrets in the hosting provider's secret manager.

Expected Salesforce objects are Employee, Beat, Retailer/Outlet, Attendance, Visit, Product, Scheme, Sales Order, Order Item, Product Return, Competitor Activity and SFA Ticket. The existing Salesforce metadata in the parent project provides these objects and fields.

## API

All JSON responses use `{ success, data, message }`; failures also include `errorCode`.

- `POST /api/auth/login`
- `GET /api/dashboard`, `/api/schemes`, `/api/products`, `/api/beats`
- `GET /api/beats/:beatId/stores`, `/api/stores/:storeId`
- `POST /api/day/start`, `/api/store/validate-location`, `/api/store/visit/start`
- `POST /api/store/revisit`, `/api/orders`, `/api/orders/:orderId/items`
- `POST /api/returns`, `/api/competitor-activities`, `/api/tickets`
- `POST /api/store/checkout`, `GET /api/visits/:visitId`
- `POST /api/documents/pdf`, `/api/documents/excel`, `/api/email/send`

## Production deployment

- Build the API with `npm run build -w backend`, deploy `backend/dist`, and configure HTTPS, environment variables, logging and a persistent database/queue.
- Use EAS Build for Android/iOS: `npx eas build --platform android` or `ios`.
- Replace the development JWT secret and configure a real identity provider.
- Keep Salesforce credentials and SMTP credentials on the backend only.
- Configure CORS to the production mobile/web origin and place the API behind rate limiting/WAF controls.

## Demonstration data

The mock flow uses Aishwarya, Lakeside Market Beat and creative outlet names including Nandi Daily Mart, Sunrise Supermarket, Green Basket and City Choice Stores. It includes coordinates for both inside and outside the 100 m radius.
