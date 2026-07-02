/**
 * users.js
 * These are example routes for user management
 * This shows how to correctly structure your routes for the project
 * and the suggested pattern for retrieving data by executing queries
 *
 * NB. it's better NOT to use arrow functions for callbacks with the SQLite library
* 
 */

const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");

/**
 * @desc Displays a page with a form for creating a user record
 */
router.get("/login", (req, res) => {
    res.render("auth/login.ejs", {error: null});
});

router.post ("/login", function(req, res, next) {
    const query = `
        SELECT users.user_id, users.user_name, users.password_hash
        FROM users
        JOIN email_accounts
        ON users.user_id = email_accounts.user_id
        WHERE email_accounts.email_address = ?
    `;

    const query_parameters = [req.body.email_address];

    global.db.get(query, query_parameters, async function(err, user) {
        if (err) {
            next(err);
        } else if (!user) {
            res.render("auth/login.ejs", {
                error: "Email not found"
            });

        } else {
            const passwordMatch = await bcrypt.compare(
                req.body.password,
                user.password_hash
            );

            if (!passwordMatch) {
                res.render("auth/login.ejs", {
                error: "Incorrect password"
            });
            } else {
                req.session.userId = user.user_id;
                req.session.userName = user.user_name;

                res.redirect("/home");
            }
        }
    });
});

router.get("/logout", function(req, res) {

    req.session.destroy(function(err) {

        if (err) {
            console.log(err);
            return res.redirect("/home");
        }

        res.redirect("/auth/login");
    });

});

// Export the router object so index.js can access it
module.exports = router;
