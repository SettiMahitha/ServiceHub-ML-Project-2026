# Service Hub

A web platform that connects households with verified local professionals (plumbers, electricians, technicians, etc.),
built from the Service Hub project presentation (SRGEC, Dept. of CSE).

## Run it
1. Install **Node.js 18 or newer** (https://nodejs.org) - nothing else is needed, there is **no `npm install`**.
2. Double-click **`start.bat`** (Windows) or run **`./start.sh`** (Mac/Linux).
   Or from a terminal: `node server.js`
3. Open http://localhost:3000  (use `PORT=8080 node server.js` for another port).

## Demo accounts
| Role     | Email                    | Password    |
|----------|--------------------------|-------------|
| Admin    | admin@servicehub.com     | admin123    |
| Customer | user@servicehub.com      | user123     |
| Provider | ramesh@servicehub.com    | provider123 |

Other seeded providers use `<firstname>@servicehub.com` / `provider123` (e.g. venkat@, kiran@, lakshmi@).
To start fresh: `npm run reset` (or delete the `data/` folder).

## Features
1. **Appointment scheduling** - pick date + time slot; provider working days/hours enforced; already-booked slots are blocked; reschedule/cancel.
2. **Ratings & reviews** - rate after completion; reviews and average rating are visible on provider pages before booking.
3. **Booking status notifications** - bell with unread badge: request sent -> confirmed -> technician assigned -> service started -> completed -> payment received. A progress tracker is shown on every booking.
4. **Technician profiles** - name, skills, experience, service areas, rating, working days/hours, price. Providers edit these in their Dashboard; admin verifies them.
5. **Search & filter** - category, location (matches service areas too), date/time availability, rating, max price, sorting, "available only", smart match %.
6. **Admin analytics** - total users, total/pending/in-progress/completed bookings, popular categories, 6-month booking trend, revenue, top providers, open complaints, CSV export, provider verification, block users.
7. **Digital invoice** - after completion: invoice number, customer/provider, service, price, coupon discount, total, payment info. Print or Save as PDF.
8. **Customer support & complaints** - raise a complaint (from My Bookings or Support page), get a ticket number, track status (open / in review / resolved) and read the admin's reply. Admin manages them under Admin > Complaints.
9. **Online payments** - checkout with UPI ID or card (validated: Luhn check, expiry, CVV), transaction IDs, refunds on cancellation, cash collection recorded by the technician. Demo gateway only; test card 4242 4242 4242 4242. Only the last 4 card digits are stored.

Also: roles (Customer / Provider / Admin), hashed passwords, coupons (WELCOME10, HUB20), favorites, dark mode, mobile-friendly layout.

Booking lifecycle: pending -> confirmed -> in progress -> completed (or cancelled / rejected).

## Project layout
```
server.js        HTTP server + REST API + JSON database + seed data
public/          index.html, style.css, app.js (single-page app)
data/db.json     created on first run
```
Payments are simulated (no real money moves). To use MySQL/MongoDB as in the architecture slide, replace the
load/save functions in `server.js` - all data access goes through the `db` object.


## Machine Learning (ML) Lab
The navigation includes an **ML Lab** with three model demos:
- Service Classification (TF-IDF + Logistic Regression)
- Service Demand Prediction (Random Forest Regressor)
- Technician Recommendation (Random Forest Classifier)

Install Python dependencies once:
```bat
python -m pip install -r ml\requirements.txt
```
Then run the existing Node.js app as usual. See `ml/README.md` for details and API examples.
**Note:** bundled training data is demonstrative/synthetic and predictions are not validated real-world forecasts.
