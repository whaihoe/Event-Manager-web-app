const bcrypt = require('bcrypt');

const seedUsers = [
    {
        user_name: 'Simon Star',
        role: 'organiser',
        email: 'simon@gmail.com',
        password: 'password123',
    },
    {
        user_name: 'Dianne Dean',
        role: 'attendee',
        email: 'dianne@yahoo.co.uk',
        password: 'password123',
    },
    {
        user_name: 'Harry Hilbert',
        role: 'attendee',
        email: 'harry@example.com',
        password: 'password123',
    },
];

/**
 * @desc Adds default users so the marker can test the app without registering first
 * @input Existing database tables created from db_schema.sql
 * @output Inserts seed users and email accounts if the users table is empty
 */
function seedDatabase() {
    const query = `
        SELECT COUNT(*) AS count
        FROM users
    `;

    global.db.get(query, function (err, row) {
        if (err) {
            console.log(err);
            return;
        }

        // If users already exist, I do not want to insert duplicate seed accounts.
        if (row.count > 0) {
            return;
        }

        insertNextUser(seedUsers.slice());
    });
}

/**
 * @desc Inserts each seed user one by one
 * @input Array of seed user objects
 * @output Inserts users and their email accounts
 */
function insertNextUser(users) {
    const user = users.shift();

    if (!user) {
        console.log('Database seeded successfully');
        return;
    }

    bcrypt.hash(user.password, 10, function (err, passwordHash) {
        if (err) {
            console.log(err);
            return;
        }

        const query = `
            INSERT INTO users (user_name, role, password_hash)
            VALUES (?, ?, ?)
        `;

        const queryParameters = [
            user.user_name,
            user.role,
            passwordHash,
        ];

        global.db.run(query, queryParameters, function (err) {
            if (err) {
                console.log(err);
                return;
            }

            const userId = this.lastID;

            const emailQuery = `
                INSERT INTO email_accounts (email_address, user_id)
                VALUES (?, ?)
            `;

            global.db.run(emailQuery, [user.email, userId], function (err) {
                if (err) {
                    console.log(err);
                    return;
                }

                insertNextUser(users);
            });
        });
    });
}

module.exports = seedDatabase;