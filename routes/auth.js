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

function isValidEmail(emailAddress) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress);
}

function getFormData(req) {
    return {
        user_name: req.body.user_name || "",
        email_address: req.body.email_address || ""
    };
}

function renderLogin(res, errors, formData) {
    res.render("auth/login.ejs", {
        errors: errors || {},
        formData: formData || { email_address: "" }
    });
}

function renderRegister(res, errors, formData) {
    res.render("auth/register.ejs", {
        errors: errors || {},
        formData: formData || { user_name: "", email_address: "" }
    });
}

/**
 * @desc Displays a page with a form for creating a user record
 */
router.get("/login", (req, res) => {
    renderLogin(res);
});

router.get("/register", (req, res) => {
    renderRegister(res);
});

router.post("/register", async function(req, res, next) {
    const userName = (req.body.user_name || "").trim();
    const emailAddress = (req.body.email_address || "").trim();
    const password = req.body.password;
    const errors = {};
    const formData = getFormData(req);

    if (!userName) {
        errors.user_name = "Please enter your name";
    }

    if (!emailAddress) {
        errors.email_address = "Please enter your email";
    } else if (!isValidEmail(emailAddress)) {
        errors.email_address = "Please enter a valid email";
    }

    if (!password) {
        errors.password = "Please enter a password";
    }

    if (Object.keys(errors).length > 0) {
        return renderRegister(res, errors, formData);
    }

    global.db.get(
        "SELECT email_account_id FROM email_accounts WHERE email_address = ?",
        [emailAddress],
        async function(err, existingEmail) {
            if (err) {
                return next(err);
            }

            if (existingEmail) {
                return renderRegister(res, {
                    email_address: "Email is already registered"
                }, formData);
            }

            const passwordHash = await bcrypt.hash(password, 10);

            global.db.run(
                "INSERT INTO users (user_name, password_hash) VALUES (?, ?)",
                [userName, passwordHash],
                function(err) {
                    if (err) {
                        return next(err);
                    }

                    const userId = this.lastID;

                    global.db.run(
                        "INSERT INTO email_accounts (email_address, user_id) VALUES (?, ?)",
                        [emailAddress, userId],
                        function(err) {
                            if (err) {
                                return next(err);
                            }

                            req.session.userId = userId;
                            req.session.userName = userName;
                            res.redirect("/home");
                        }
                    );
                }
            );
        }
    );
});

router.post ("/login", function(req, res, next) {
    const emailAddress = (req.body.email_address || "").trim();
    const password = req.body.password;
    const errors = {};
    const formData = getFormData(req);

    if (!emailAddress) {
        errors.email_address = "Please enter your email";
    } else if (!isValidEmail(emailAddress)) {
        errors.email_address = "Please enter a valid email";
    }

    if (!password) {
        errors.password = "Please enter your password";
    }

    if (Object.keys(errors).length > 0) {
        return renderLogin(res, errors, formData);
    }

    const query = `
        SELECT users.user_id, users.user_name, users.password_hash
        FROM users
        JOIN email_accounts
        ON users.user_id = email_accounts.user_id
        WHERE email_accounts.email_address = ?
    `;

    const query_parameters = [emailAddress];

    global.db.get(query, query_parameters, async function(err, user) {
        if (err) {
            next(err);
        } else if (!user) {
            renderLogin(res, {
                email_address: "Email not found"
            }, formData);

        } else {
            const passwordMatch = await bcrypt.compare(
                password,
                user.password_hash
            );

            if (!passwordMatch) {
                renderLogin(res, {
                    password: "Incorrect password"
                }, formData);
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
