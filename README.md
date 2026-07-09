# Event Manager Coursework

This is my CM2040 Databases, Network and the Web midterm coursework project.

The app is an event manager where organisers can create and publish events, and attendees can view published events and book tickets using a fake wallet balance.

## How to run

For first-time setup, run:

```bash
npm run first-start
```

This installs the packages, builds the SQLite database and starts the app.

Open the app at:

```txt
http://localhost:3000
```

After the first setup, the app can be started again with:

```bash
npm run start
```

To reset the database, run:

```bash
npm run build-db
```

## Test accounts

Login uses the user's email address and password.

The seed file creates these test accounts so the app can be tested without registering first:

| Role | Email | Password |
|---|---|---|
| Organiser | `simon@gmail.com` | `password123` |
| Attendee | `dianne@yahoo.co.uk` | `password123` |
| Attendee | `harry@example.com` | `password123` |

You can also register a new organiser or attendee account from the register page.

## Test card details

The wallet top up form uses fake card validation only. No real payment is made, and card details are not stored in the database.

Valid test card numbers:

```txt
4242424242424242
5555555555554444
```

Invalid test card numbers:

```txt
4111111111111112
5555555555555556
```

For expiry date and CVV testing, use:

```txt
Expiry date: Any future month and year
CVV: Any 3 digit number
```

Example valid test payment:

```txt
Card number: 4242424242424242
Expiry date: 12/30
CVV: 123
```

## Main pages

| Page | URL |
|---|---|
| Main Home Page | `/` |
| Login | `/auth/login` |
| Register | `/auth/register` |
| Organiser Home Page | `/organiser/home` |
| Attendee Home Page | `/attendee/home` |
| Site Settings Page | `/organiser/settings` |
| My Wallet Page | `/wallet` |
| Attendee Event Page | `/events/:eventId` |
| Organiser Edit Event Page | `/events/:eventId/edit` |
| Purchase Confirmation Page | `/events/:eventId/purchases/:purchaseId/confirmation` |

## Main features

- Organiser and attendee accounts
- Login and logout using sessions
- Role-based access for organiser and attendee pages
- Site settings for the event manager name and description
- Organisers can create new draft events
- Creating a new event redirects straight to the edit page
- Organisers can edit event details, ticket quantities and ticket prices
- Organisers can save changes or save and publish the event
- Draft events can be published
- Events can be deleted by the organiser
- Published events can be shared using a copy link button
- Attendees can view published events and book tickets
- Attendees cannot book more tickets than the amount available
- Attendees can see the tickets they have already booked for an event
- The confirmation page shows all ticket types included in one purchase
- Published events can be sorted by event date
- Logged in users have a fake wallet
- Users can top up their wallet from `/wallet`
- The fake top up form validates the amount, card number, expiry date and CVV
- Fake card details are not stored in the database
- Ticket bookings check the attendee wallet balance before saving the purchase
- When paid tickets are booked, money is deducted from the attendee wallet and added to the organiser wallet
- Wallet transaction records are created for top ups, ticket payments and ticket sales
- Free ticket bookings are allowed without creating wallet transactions

## Database

The project uses SQLite. The database is created from:

```txt
db_schema.sql
```

The main tables are:

- `users`
- `site_settings`
- `events`
- `event_tickets`
- `ticket_purchases`
- `purchase_ticket_items`
- `wallets`
- `wallet_transactions`

I used `ticket_purchases` as the main purchase record, and `purchase_ticket_items` to store the ticket types, quantities and original prices inside the purchase. This means one purchase can include both full price and concession tickets, and old purchase totals do not change if a ticket price is edited later.

The `wallets` table stores each user's fake wallet balance. The `wallet_transactions` table records wallet top ups, attendee ticket payments and organiser ticket sale income. Card numbers, expiry dates and CVV values are only used for fake validation and are not stored.

Free ticket bookings can still be saved as ticket purchases, but they do not create wallet transactions because no money is moved.

The `seed.js` file only adds default users after the database has been built. The table structure itself comes from `db_schema.sql`.

## Extra libraries used

- `bcrypt`: used to hash passwords before saving them
- `express-session`: used to keep users logged in
- `Bootstrap CDN`: used for simple responsive styling

## Project structure

```txt
index.js                         Main Express app file
routes/auth.js                   Login, register and logout routes
routes/events.js                 Event, booking and ticket routes
routes/wallet.js                 Fake wallet and top up routes
models/eventsModel.js            Event and ticket database functions
models/walletModel.js            Wallet balance and transaction functions
middleware/auth.js               Checks if a user is logged in
middleware/roles.js              Checks the user's role
views/                           EJS templates
views/events/partials/           Reusable event card and form partials
public/main.css                  Custom CSS
public/js/share-link.js          Copies event share links to the clipboard
public/js/remember-scroll.js     Restores scroll position after publish/delete
scripts/build-db.js              Rebuilds the SQLite database
db_schema.sql                    Database schema
seed.js                          Seeds the default users
```

## Notes

Most of the event database logic is in `models/eventsModel.js` because `routes/events.js` was getting too long. Wallet-related database logic is kept in `models/walletModel.js` so that the routes do not contain too much SQL.

I kept the structure close to the original Express template, with `index.js` as the main file and routes inside the `routes` folder.
