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

The seed file creates these accounts:

| Role | Email | Password |
|---|---|---|
| Organiser | simon@gmail.com | password123 |
| Attendee | dianne@yahoo.co.uk | password123 |

You can also register a new account from the register page.

## Main pages

| Page | URL |
|---|---|
| Main Home Page | `/` |
| Login | `/auth/login` |
| Register | `/auth/register` |
| Organiser Home Page | `/organiser/home` |
| Attendee Home Page | `/attendee/home` |
| Site Settings Page | `/organiser/settings` |
| Event List Page | `/events` |
| Attendee Event Page | `/events/:eventId` |
| Organiser Edit Event Page | `/events/:eventId/edit` |

## Main features

- Organiser and attendee accounts
- Login and logout using sessions
- Role-based access for organiser and attendee pages
- Site settings for event manager name and description
- Organiser can create a new draft event
- Organiser can edit event details and ticket prices
- Organiser can publish or delete events
- Published events can be shared using a copy link button
- Attendees can view published events and book tickets
- Attendees cannot book more tickets than the amount available
- The confirmation page shows all ticket types included in one purchase

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

## Extra libraries used

- `bcrypt`: used to hash passwords before saving them
- `express-session`: used to keep users logged in
- `Bootstrap CDN`: used for simple responsive styling

## Project structure

```txt
index.js                 Main Express app file
routes/auth.js           Login, register and logout routes
routes/events.js         Event, booking and ticket routes
models/eventsModel.js    Event and ticket database functions
middleware/auth.js       Checks if a user is logged in
middleware/roles.js      Checks the user's role
views/                   EJS templates
public/                  CSS and client-side JavaScript
scripts/build-db.js      Rebuilds the SQLite database
db_schema.sql            Database schema
seed.js                  Seeds the default users
```

## Notes

Most of the event database logic is in `models/eventsModel.js` because `routes/events.js` was getting too long. I kept the rest of the structure close to the original Express template, with `index.js` as the main file and routes inside the `routes` folder.

For submission, `node_modules` and `database.db` should not be included because the marker will run `npm install` and `npm run build-db`.
