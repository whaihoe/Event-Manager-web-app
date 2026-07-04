const bcrypt = require('bcrypt');

/**
 * @desc Seeds the database with some default users
 */
function seedDatabase() {
    // Make sure the database tables exist before adding seed data
    ensureDatabaseSchema(function () {
        global.db.get(
            'SELECT COUNT(*) AS count FROM users',
            async function (err, row) {
                if (err) {
                    console.log(err);
                    return;
                }

                // Only seed when database is empty
                if (row.count > 0) {
                    return;
                }

                const users = [
                    {
                        user_name: 'Simon Star',
                        role: 'organiser',
                        password: 'password123',
                        emails: ['simon@gmail.com', 'simon@hotmail.com'],
                    },
                    {
                        user_name: 'Dianne Dean',
                        role: 'participant',
                        password: 'password123',
                        emails: ['dianne@yahoo.co.uk'],
                    },
                    {
                        user_name: 'Harry Hilbert',
                        role: 'participant',
                        password: 'password123',
                        emails: [],
                    },
                ];

                for (const user of users) {
                    const passwordHash = await bcrypt.hash(user.password, 10);

                    global.db.run(
                        'INSERT INTO users (user_name, role, password_hash) VALUES (?, ?, ?)',
                        [user.user_name, user.role, passwordHash],
                        function (err) {
                            if (err) {
                                console.log(err);
                                return;
                            }

                            const userId = this.lastID;

                            user.emails.forEach(function (email) {
                                global.db.run(
                                    'INSERT INTO email_accounts (email_address, user_id) VALUES (?, ?)',
                                    [email, userId],
                                );
                            });
                        },
                    );
                }

                console.log('Database seeded successfully');
            },
        );
    });
}

/**
 * @desc Creates or updates the database tables needed by the app
 */
function ensureDatabaseSchema(done) {
    global.db.serialize(function () {
        // Create the users table if the database is empty
        global.db.run(`
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_name TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'participant' CHECK(role IN ('organiser', 'participant')),
                password_hash TEXT NOT NULL
            )
        `);

        // Create the email accounts table if the database is empty
        global.db.run(`
            CREATE TABLE IF NOT EXISTS email_accounts (
                email_account_id INTEGER PRIMARY KEY AUTOINCREMENT,
                email_address TEXT NOT NULL UNIQUE,
                user_id INT,
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            )
        `);

        global.db.all('PRAGMA table_info(users)', function (err, columns) {
            if (err) {
                console.log(err);
                return done();
            }

            const hasRoleColumn = columns.some(function (column) {
                return column.name === 'role';
            });

            // Create the event tables if they do not exist
            function createEventTables(callback) {
                global.db.serialize(function () {
                    global.db.run(`
                        CREATE TABLE IF NOT EXISTS events (
                            event_id INTEGER PRIMARY KEY AUTOINCREMENT,
                            title TEXT NOT NULL,
                            description TEXT,
                            event_date TEXT NOT NULL,
                            location TEXT NOT NULL,
                            status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published')),
                            published_at TEXT,
                            updated_at TEXT,
                            organiser_id INTEGER NOT NULL,
                            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (organiser_id) REFERENCES users(user_id)
                        )
                    `);

                    global.db.run(`
                        CREATE TABLE IF NOT EXISTS event_tickets (
                            ticket_id INTEGER PRIMARY KEY AUTOINCREMENT,
                            event_id INTEGER NOT NULL,
                            ticket_type TEXT NOT NULL,
                            quantity_available INTEGER NOT NULL CHECK(quantity_available > 0),
                            price REAL NOT NULL CHECK(price >= 0),
                            FOREIGN KEY (event_id) REFERENCES events(event_id)
                        )
                    `);

                    global.db.run(`
                        CREATE TABLE IF NOT EXISTS event_participants (
                            event_id INTEGER NOT NULL,
                            user_id INTEGER NOT NULL,
                            joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            PRIMARY KEY (event_id, user_id),
                            FOREIGN KEY (event_id) REFERENCES events(event_id),
                            FOREIGN KEY (user_id) REFERENCES users(user_id)
                        )
                    `);

                    global.db.run(`
                        CREATE TABLE IF NOT EXISTS site_settings (
                            setting_id INTEGER PRIMARY KEY CHECK(setting_id = 1),
                            site_name TEXT NOT NULL,
                            site_description TEXT NOT NULL
                        )
                    `);

                    global.db.run(
                        'INSERT OR IGNORE INTO site_settings (setting_id, site_name, site_description) VALUES (1, ?, ?)',
                        [
                            'Event Manager',
                            'Discover events and buy tickets online.',
                        ],
                    );

                    global.db.run(
                        `
                        CREATE TABLE IF NOT EXISTS ticket_purchases (
                            purchase_id INTEGER PRIMARY KEY AUTOINCREMENT,
                            event_id INTEGER NOT NULL,
                            ticket_id INTEGER NOT NULL,
                            user_id INTEGER NOT NULL,
                            attendee_name TEXT NOT NULL DEFAULT '',
                            quantity INTEGER NOT NULL CHECK(quantity > 0),
                            purchased_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (event_id) REFERENCES events(event_id),
                            FOREIGN KEY (ticket_id) REFERENCES event_tickets(ticket_id),
                            FOREIGN KEY (user_id) REFERENCES users(user_id)
                        )
                    `,
                        callback,
                    );
                });
            }

            // Add event columns for older databases that were created before these features existed
            function updateEventTable() {
                global.db.all(
                    'PRAGMA table_info(events)',
                    function (err, eventColumns) {
                        if (err) {
                            console.log(err);
                            return done();
                        }

                        const hasStatusColumn = eventColumns.some(
                            function (column) {
                                return column.name === 'status';
                            },
                        );

                        const hasPublishedAtColumn = eventColumns.some(
                            function (column) {
                                return column.name === 'published_at';
                            },
                        );

                        const hasUpdatedAtColumn = eventColumns.some(
                            function (column) {
                                return column.name === 'updated_at';
                            },
                        );

                        const columnsToAdd = [];

                        if (!hasStatusColumn) {
                            columnsToAdd.push(
                                "ALTER TABLE events ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published'))",
                            );
                        }

                        if (!hasPublishedAtColumn) {
                            columnsToAdd.push(
                                'ALTER TABLE events ADD COLUMN published_at TEXT',
                            );
                        }

                        if (!hasUpdatedAtColumn) {
                            columnsToAdd.push(
                                'ALTER TABLE events ADD COLUMN updated_at TEXT',
                            );
                        }

                        function addNextColumn() {
                            const query = columnsToAdd.shift();

                            if (!query) {
                                return updateTicketPurchasesTable();
                            }

                            global.db.run(query, function (err) {
                                if (err) {
                                    console.log(err);
                                    return done();
                                }

                                addNextColumn();
                            });
                        }

                        addNextColumn();
                    },
                );
            }

            // Add attendee name for older databases created before booking names existed
            function updateTicketPurchasesTable() {
                global.db.all(
                    'PRAGMA table_info(ticket_purchases)',
                    function (err, ticketPurchaseColumns) {
                        if (err) {
                            console.log(err);
                            return done();
                        }

                        const hasAttendeeNameColumn =
                            ticketPurchaseColumns.some(function (column) {
                                return column.name === 'attendee_name';
                            });

                        if (!hasAttendeeNameColumn) {
                            return global.db.run(
                                "ALTER TABLE ticket_purchases ADD COLUMN attendee_name TEXT NOT NULL DEFAULT ''",
                                function (err) {
                                    if (err) {
                                        console.log(err);
                                    }

                                    done();
                                },
                            );
                        }

                        done();
                    },
                );
            }

            // Add role for older databases that were created before roles existed
            if (!hasRoleColumn) {
                return global.db.run(
                    "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'participant' CHECK(role IN ('organiser', 'participant'))",
                    function () {
                        createEventTables(updateEventTable);
                    },
                );
            }

            createEventTables(updateEventTable);
        });
    });
}

module.exports = seedDatabase;
