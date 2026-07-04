/**
 * auth.js
 * These routes handle logging in, registering and logging out.
 *
 * NB. it's better NOT to use arrow functions for callbacks with the SQLite library
* 
 */

const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const VALID_ROLES = ["organiser", "participant"];

/**
 * @desc Checks if the email is in a valid format
 */
function isValidEmail(emailAddress) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress);
}

/**
 * @desc Keeps the form values after an error
 */
function getFormData(req) {
    return {
        user_name: req.body.user_name || "",
        email_address: req.body.email_address || "",
        role: req.body.role || "participant"
    };
}

/**
 * @desc Renders the login page with any errors
 */
function renderLogin(res, errors, formData) {
    res.render("auth/login.ejs", {
        errors: errors || {},
        formData: formData || { email_address: "" }
    });
}

/**
 * @desc Renders the register page with any errors
 */
function renderRegister(res, errors, formData) {
    res.render("auth/register.ejs", {
        errors: errors || {},
        formData: formData || {
            user_name: "",
            email_address: "",
            role: "participant"
        }
    });
}

/**
 * @desc Displays the login form
 */
router.get("/login", (req, res) => {
    renderLogin(res);
});

/**
 * @desc Displays the register form
 */
router.get("/register", (req, res) => {
    renderRegister(res);
});

/**
 * @desc Registers a new user account with a role
 */
router.post("/register", async function(req, res, next) {

    const userName = (req.body.user_name || "").trim();
    const emailAddress = (req.body.email_address || "").trim();
    const role = req.body.role;
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

    if (!VALID_ROLES.includes(role)) {
        errors.role = "Please choose a valid role";
    }

    if (Object.keys(errors).length > 0) {
        return renderRegister(res, errors, formData);
    }

    // Check if the email is already used
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

            // Add the user first so I can use the new user_id for the email table
            global.db.run(
                "INSERT INTO users (user_name, role, password_hash) VALUES (?, ?, ?)",
                [userName, role, passwordHash],
                function(err) {
                    if (err) {
                        return next(err);
                    }

                    const userId = this.lastID;

                    // Store the email in a separate table linked to this user
                    global.db.run(
                        "INSERT INTO email_accounts (email_address, user_id) VALUES (?, ?)",
                        [emailAddress, userId],
                        function(err) {
                            if (err) {
                                return next(err);
                            }

                            req.session.userId = userId;
                            req.session.userName = userName;
                            req.session.userRole = role;
                            if (role === "organiser") {
                                res.redirect("/organiser/home");
                            } else {
                                res.redirect("/attendee/home");
                            }
                        }
                    );
                }
            );
        }
    );
});

/**
 * @desc Logs in a user using email and password
 */
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

    // Find the user account by email
    const query = `
        SELECT users.user_id, users.user_name, users.password_hash, users.role
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
            // Compare the password entered with the hashed password in the database
            const passwordMatch = await bcrypt.compare(
                password,
                user.password_hash
            );

            if (!passwordMatch) {
                renderLogin(res, {
                    password: "Incorrect password"
                }, formData);
            } else {
                // Save the logged in user details in the session
                req.session.userId = user.user_id;
                req.session.userName = user.user_name;
                req.session.userRole = user.role;

                if (user.role === "organiser") {
                    res.redirect("/organiser/home");
                } else {
                    res.redirect("/attendee/home");
                }
            }
        }
    });
});

/**
 * @desc Logs the user out and clears the session
 */
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
