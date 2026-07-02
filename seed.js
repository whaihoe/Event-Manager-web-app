const bcrypt = require("bcrypt");

function seedDatabase() {
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
                password: "password123",
                emails: ["simon@gmail.com", "simon@hotmail.com"]
            },
            {
                user_name: "Dianne Dean",
                password: "password123",
                emails: ["dianne@yahoo.co.uk"]
            },
            {
                user_name: "Harry Hilbert",
                password: "password123",
                emails: []
            }
        ];

        for (const user of users) {
            const passwordHash = await bcrypt.hash(user.password, 10);

            global.db.run(
                "INSERT INTO users (user_name, password_hash) VALUES (?, ?)",
                [user.user_name, passwordHash],
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
}

module.exports = seedDatabase;