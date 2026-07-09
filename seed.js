// ===== START OF MY CODE =====
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
 * @purpose Adds default users so the marker can test the app without registering first
 * @input Existing database tables created from db_schema.sql
 * @output Inserts seed users and makes sure every user has a wallet
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
            return createMissingWallets();
        }

        insertNextUser(seedUsers.slice());
    });
}

/**
 * @purpose Creates wallets for any users that do not have one yet
 * @input Existing users table
 * @output Inserts missing wallet rows only
 */
function createMissingWallets() {
    const query = `
        INSERT OR IGNORE INTO wallets (user_id)
        SELECT user_id
        FROM users
    `;

    global.db.run(query, function (err) {
        if (err) {
            console.log(err);
        }
    });
}

/**
 * @purpose Inserts each seed user one by one
 * @input Array of seed user objects
 * @output Inserts users and their wallet rows
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
            INSERT INTO users (user_name, email_address, role, password_hash)
            VALUES (?, ?, ?, ?)
        `;

        const queryParameters = [
            user.user_name,
            user.email,
            user.role,
            passwordHash,
        ];

        global.db.run(query, queryParameters, function (err) {
            if (err) {
                console.log(err);
                return;
            }

            const userId = this.lastID;

            global.db.run(
                'INSERT OR IGNORE INTO wallets (user_id) VALUES (?)',
                [userId],
                function (err) {
                    if (err) {
                        console.log(err);
                        return;
                    }

                    insertNextUser(users);
                },
            );
        });
    });
}

module.exports = seedDatabase;
// ===== END OF MY CODE =====
