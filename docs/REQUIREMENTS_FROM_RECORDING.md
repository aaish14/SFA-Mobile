# Requirements captured from the recording

Source reviewed: `Meeting in 2026 Salesforce & Odoo Trainess` transcript and recording supplied by the user on 30 September 2026.

## Field-sales day

1. The sales representative opens the mobile app and starts the day.
2. Salesforce is the backend and returns the relevant data.
3. The representative sees the day's beat/permanent journey plan and assigned retailers.
4. At the retailer, the representative checks in and performs the visit.
5. The representative can take an order even when stock is currently unavailable.
6. Completed shops are checked out; unvisited shops are marked Missed with a reason.
7. The representative ends the day.

## Product master

- Product name and product code.
- Brand, batch number and product image.
- MRP/selling price and available stock.
- Sellable and returnable flags.
- Manufacturing date, expiry date and calculated shelf life.
- Unit conversion: number of pieces in one case/carton.
- At least ten products should be entered for the demonstration.
- Category was explicitly deferred by the trainer and is therefore not modelled.

## Orders

- Orders from retailer/shop to distributor are secondary orders.
- Orders from company to distributor are primary orders; the mobile journey in this project captures secondary orders.
- Order lines support Case and Piece quantities and calculate pieces through the product's conversion factor.

## Schemes

- Scheme name, scheme code, type, start date and end date.
- The app checks active dates and outlet type.
- Five supported types: same-product free, non-listed-product free, different listed-product free, slab discount and bundle.

## Deliberately excluded from this build

- Distributor portal, invoicing and primary-order processing.
- Broader survey and target modules not detailed in the recording.
- Additional scheme types beyond the five highlighted by the trainer.
- Offline synchronization and external APIs, which were not implemented in the recorded explanation.
