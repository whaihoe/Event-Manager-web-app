const bcrypt = require("bcrypt");

function seedDatabase() {
    ensureDatabaseSchema(function () {
        global.db.get("SELECT COUNT(*) AS count FROM users", async function (err, row) {
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
                    user_name: "Simon Star",
                    role: "organiser",
                    password: "password123",
                    emails: ["simon@gmail.com", "simon@hotmail.com"]
                },
                {
                    user_name: "Dianne Dean",
                    role: "participant",
                    password: "password123",
                    emails: ["dianne@yahoo.co.uk"]
                },
                {
                    user_name: "Harry Hilbert",
                    role: "participant",
                    password: "password123",
                    emails: []
                }
            ];

            for (const user of users) {
                const passwordHash = await bcrypt.hash(user.password, 10);

                global.db.run(
                    "INSERT INTO users (user_name, role, password_hash) VALUES (?, ?, ?)",
                    [user.user_name, user.role, passwordHash],
                    function (err) {
                        if (err) {
                            console.log(err);
                            return;
                        }

                        const userId = this.lastID;

                        user.emails.forEach(function (email) {
                            global.db.run(
                                "INSERT INTO email_accounts (email_address, user_id) VALUES (?, ?)",
                                [email, userId]
                            );
                        });
                    }
                );
            }

            console.log("Database seeded successfully");
        });
    });
}

function ensureDatabaseSchema(done) {
    global.db.serialize(function () {
        global.db.run(`
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_name TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'participant' CHECK(role IN ('organiser', 'participant')),
                password_hash TEXT NOT NULL
            )
        `);

        global.db.run(`
            CREATE TABLE IF NOT EXISTS email_accounts (
                email_account_id INTEGER PRIMARY KEY AUTOINCREMENT,
                email_address TEXT NOT NULL UNIQUE,
                user_id INT,
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            )
        `);

        global.db.all("PRAGMA table_info(users)", function (err, columns) {
            if (err) {
                console.log(err);
                return done();
            }

            const hasRoleColumn = columns.some(function (column) {
                return column.name === "role";
            });

            function createEventTables(callback) {
                global.db.serialize(function () {
                    global.db.run(`
                        CREATE TABLE IF NOT EXISTS events (
                            event_id INTEGER PRIMARY KEY AUTOINCREMENT,
                            title TEXT NOT NULL,
                            description TEXT,
                            event_date TEXT NOT NULL,
                            location TEXT NOT NULL,
                            participant_limit INTEGER CHECK(participant_limit IS NULL OR participant_limit > 0),
                            organiser_id INTEGER NOT NULL,
                            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (organiser_id) REFERENCES users(user_id)
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
                    `, callback);
                });
            }

            function updateEventTable() {
                global.db.all("PRAGMA table_info(events)", function (err, eventColumns) {
                    if (err) {
                        console.log(err);
                        return done();
                    }

                    const hasParticipantLimitColumn = eventColumns.some(function (column) {
                        return column.name === "participant_limit";
                    });

                    if (!hasParticipantLimitColumn) {
                        return global.db.run(
                            "ALTER TABLE events ADD COLUMN participant_limit INTEGER CHECK(participant_limit IS NULL OR participant_limit > 0)",
                            done
                        );
                    }

                    done();
                });
            }

            if (!hasRoleColumn) {
                return global.db.run(
                    "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'participant' CHECK(role IN ('organiser', 'participant'))",
                    function () {
                        createEventTables(updateEventTable);
                    }
                );
            }

            createEventTables(updateEventTable);
        });
    });
}

module.exports = seedDatabase;
