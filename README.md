# Event Manager Coursework

This is my CM2040 Databases, Network and the Web midterm coursework project.

The app is an event manager where an organiser can create and publish events, and attendees can view published events and book tickets.

## How to run

Install the packages first:

```bash
npm install
```

Build the SQLite database:

```bash
npm run build-db
```

Start the app:

```bash
npm run start
```

Open the app at:

```txt
http://localhost:3000
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

## Main pages

| Page | URL |
|---|---|
| Main Home Page | `/` |
| Login | `/auth/login` |
| Register | `/auth/register` |
| Organiser Home Page | `/organiser/home` |
| Attendee Home Page | `/attendee/home` |
| Site Settings Page | `/organiser/settings` |
| Attendee Event Page | `/events/:eventId` |
| Organiser Edit Event Page | `/events/:eventId/edit` |
| Purchase Confirmation Page | `/events/:eventId/purchases/:purchaseId/confirmation` |

## Main features

- Organiser and attendee accounts
- Login and logout using sessions
- Role-based access for organiser and attendee pages
- Site settings for the event manager name and description
- Organiser can create a new draft event
- Creating a new event redirects straight to the edit page
- Organiser can edit event details, ticket quantities and ticket prices
- Organiser can save changes or save and publish the event
- Draft events can be published
- Events can be deleted by the organiser
- Published events can be shared using a copy link button
- Attendees can view published events and book tickets
- Attendees cannot book more tickets than the amount available
- Attendees can see the tickets they have already booked for an event
- The confirmation page shows all ticket types included in one purchase
- Published events can be sorted by event date

## Database

The project uses SQLite. The database is created from:

```txt
db_schema.sql
```

The main tables are:

- `users`
- `email_accounts`
- `site_settings`
- `events`
- `event_tickets`
- `event_attendees`
- `ticket_purchases`
- `purchase_ticket_items`

I used `ticket_purchases` as the main purchase record, and `purchase_ticket_items` to store the ticket types inside the purchase. This means one purchase can include both full price and concession tickets.

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
models/eventsModel.js            Event and ticket database functions
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

Most of the event database logic is in `models/eventsModel.js` because `routes/events.js` was getting too long. I kept the rest of the structure close to the original Express template, with `index.js` as the main file and routes inside the `routes` folder.

For submission, `node_modules` and `database.db` should not be included because the marker will run `npm install` and `npm run build-db`.

Before submitting, I should also remove development/template files such as `.git`, `.DS_Store`, `__MACOSX` and `Working with this Template.pdf` if they are in the zip.