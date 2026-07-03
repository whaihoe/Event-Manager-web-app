const express = require("express");
const router = express.Router();
const requireLogin = require("../middleware/auth.js");
const { requireRole } = require("../middleware/roles.js");

/**
 * @desc Display all events
 */
router.get("/", requireLogin, function(req, res, next) {

    // Define the query
    query = `
        SELECT
            events.event_id,
            events.title,
            events.description,
            events.event_date,
            events.location,
            users.user_name AS organiser_name,
            event_participants.user_id AS joined_user_id
        FROM events
        JOIN users
        ON events.organiser_id = users.user_id
        LEFT JOIN event_participants
        ON events.event_id = event_participants.event_id
        AND event_participants.user_id = ?
        ORDER BY events.event_date ASC
    `;

    query_parameters = [req.session.userId];

    // Execute the query and render the page with the results
    global.db.all(query, query_parameters, 
        function(err, events) {

            if (err) {
                next(err);
            } else {
                res.render("events/list.ejs", {
                    events: events,
                    role: req.session.userRole
                });
            }

        }
    );

});

/**
 * @desc Displays a page with a form for creating an event
 */
router.get("/new", requireLogin, requireRole("organiser"), function(req, res) {

    res.render("events/new.ejs", {
        errors: {},
        formData: {}
    });

});

/**
 * @desc Add a new event to the database based on data from the submitted form
 */
router.post("/", requireLogin, requireRole("organiser"), function(req, res, next) {

    const title = (req.body.title || "").trim();
    const description = (req.body.description || "").trim();
    const eventDate = (req.body.event_date || "").trim();
    const location = (req.body.location || "").trim();
    const errors = {};
    const formData = {
        title: title,
        description: description,
        event_date: eventDate,
        location: location
    };

    if (!title) {
        errors.title = "Please enter an event title";
    }

    if (!eventDate) {
        errors.event_date = "Please choose an event date";
    }

    if (!location) {
        errors.location = "Please enter a location";
    }

    if (Object.keys(errors).length > 0) {
        return res.render("events/new.ejs", {
            errors: errors,
            formData: formData
        });
    }

    // Define the query
    query = `
        INSERT INTO events (title, description, event_date, location, organiser_id)
        VALUES (?, ?, ?, ?, ?)
    `;

    query_parameters = [title, description, eventDate, location, req.session.userId];

    // Execute the query and redirect back to events
    global.db.run(query, query_parameters,
        function(err) {

            if (err) {
                next(err);
            } else {
                res.redirect("/events");
            }

        }
    );

});

/**
 * @desc Join an event as a participant
 */
router.post("/:eventId/join", requireLogin, requireRole("participant"), function(req, res, next) {

    // Define the query
    query = `
        INSERT OR IGNORE INTO event_participants (event_id, user_id)
        VALUES (?, ?)
    `;

    query_parameters = [req.params.eventId, req.session.userId];

    // Execute the query and redirect back to events
    global.db.run(query, query_parameters,
        function(err) {

            if (err) {
                next(err);
            } else {
                res.redirect("/events");
            }

        }
    );

});

module.exports = router;
