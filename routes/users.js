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
const requireLogin = require(".././middleware/auth.js");

/**
 * @desc Display all the users
 */
router.get("/list-users", requireLogin, (req, res, next) => {
    // Define the query
    query = "SELECT * FROM users"

    // Execute the query and render the page with the results
    global.db.all(query, 
        function (err, rows) {
            if (err) {
                next(err); //send the error on to the error handler
            } else {
                res.json(rows); // render page as simple json
            }
        }
    );
});

/**
 * @desc Displays a page with a form for creating a user record
 */
router.get("/add-user", requireLogin, (req, res) => {
    res.render("add-user.ejs");
});

/**
 * @desc Add a new user to the database based on data from the submitted form
 */
router.post("/add-user", async (req, res, next) => {
    // Define the query
    query = "INSERT INTO users (user_name, password_hash) VALUES (?, ?)"
    const passwordHash = await bcrypt.hash(req.body.password, 10);
    query_parameters = [req.body.user_name, passwordHash];
    
    // Execute the query and send a confirmation message
    global.db.run(query, query_parameters,
        function (err) {
            if (err) {
                next(err); //send the error on to the error handler
            } else {
                res.send(`New data inserted @ id ${this.lastID}!`);
                next();
            }
        }
    );
});

// Export the router object so index.js can access it
module.exports = router;
