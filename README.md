# Event Manager Coursework

This is my CM2040 Databases, Network and the Web midterm coursework project.

## How to run

Install the packages:

```bash
npm install
```

Build the SQLite database:

```bash
npm run build-db
```

Start the application:

```bash
npm run start
```

Open the app at:

```txt
http://localhost:3000
```

## Test accounts

The database seed creates these users:

- Organiser: simon@gmail.com / password123
- Attendee: dianne@yahoo.co.uk / password123

## Extra libraries used

- bcrypt: used to hash user passwords
- express-session: used to keep users logged in with sessions
- Bootstrap CDN: used in the EJS pages for basic styling

## Notes

The main event route was getting quite long, so I moved the event database queries into `models/eventsModel.js`.
I kept the rest of the project closer to the original Express template structure with `index.js` and route files in the `routes` folder.
