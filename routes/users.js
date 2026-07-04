/**
 * users.js
 * These are simple user routes from the template.
 * I kept them here because the template used this pattern for routes.
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const requireLogin = require('.././middleware/auth.js');

/**
 * @desc Displays all users as JSON
 * @input Logged in user session
 * @output JSON list of users from the database
 */
router.get('/list-users', requireLogin, function (req, res, next) {
    const query = `
        SELECT *
        FROM users
    `;

    global.db.all(query, function (err, rows) {
        if (err) {
            return next(err);
        }

        res.json(rows);
    });
});

/**
 * @desc Displays a page with a form for creating a user record
 * @input Logged in user session
 * @output Renders add-user.ejs
 */
router.get('/add-user', requireLogin, function (req, res) {
    res.render('add-user.ejs');
});

/**
 * @desc Adds a new user to the database from the submitted form
 * @input user_name and password from req.body
 * @output Inserts a user row and sends a confirmation message
 */
router.post('/add-user', requireLogin, async function (req, res, next) {
    const query = `
        INSERT INTO users (user_name, password_hash)
        VALUES (?, ?)
    `;

    const passwordHash = await bcrypt.hash(req.body.password, 10);
    const query_parameters = [req.body.user_name, passwordHash];

    global.db.run(query, query_parameters, function (err) {
        if (err) {
            return next(err);
        }

        res.send(`New data inserted @ id ${this.lastID}!`);
    });
});

module.exports = router;
