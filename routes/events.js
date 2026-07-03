const express = require("express");
const router = express.Router();
const requireLogin = require("../middleware/auth.js");
const { requireRole } = require("../middleware/roles.js");

/**
 * @desc Gets today's date in the same format as the HTML date input
 */
function getTodayDate() {

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

/**
 * @desc Validates the create and edit event forms
 */
function validateEventForm(req, currentParticipantCount) {

    const title = (req.body.title || "").trim();
    const description = (req.body.description || "").trim();
    const eventDate = (req.body.event_date || "").trim();
    const location = (req.body.location || "").trim();
    const hasLimit = req.body.has_limit === "on";
    const participantLimit = (req.body.participant_limit || "").trim();
    const errors = {};

    const formData = {
        title: title,
        description: description,
        event_date: eventDate,
        location: location,
        has_limit: hasLimit,
        participant_limit: hasLimit ? participantLimit : ""
    };

    // Basic event details are required
    if (!title) {
        errors.title = "Please enter an event title";
    }

    if (!eventDate) {
        errors.event_date = "Please choose an event date";
    } else if (eventDate < getTodayDate()) {
        errors.event_date = "Event date cannot be earlier than today";
    }

    if (!location) {
        errors.location = "Please enter a location";
    }

    // Participant limit is only checked if the organiser chose to set one
    if (hasLimit) {
        if (!Number.isInteger(Number(participantLimit)) || Number(participantLimit) <= 0) {
            errors.participant_limit = "Please enter a valid participant limit";
        } else if (currentParticipantCount && Number(participantLimit) < currentParticipantCount) {
            errors.participant_limit = "Limit cannot be lower than current participants";
        }
    }

    return {
        errors: errors,
        formData: formData
    };
}

/**
 * @desc Display all events
 */
router.get("/", requireLogin, function(req, res, next) {

    // Organisers only see their own events. Participants only see published events.
    if (req.session.userRole === "organiser") {
        query = `
            SELECT
                events.event_id,
                events.title,
                events.description,
                events.event_date,
                events.location,
                events.participant_limit,
                events.status,
                events.published_at,
                events.updated_at,
                users.user_name AS organiser_name,
                COUNT(joined_users.user_id) AS participant_count
            FROM events
            JOIN users
            ON events.organiser_id = users.user_id
            LEFT JOIN event_participants AS joined_users
            ON events.event_id = joined_users.event_id
            WHERE events.organiser_id = ?
            GROUP BY events.event_id
            ORDER BY events.event_date ASC
        `;

        query_parameters = [req.session.userId];
    } else {
        query = `
            SELECT
                events.event_id,
                events.title,
                events.description,
                events.event_date,
                events.location,
                events.participant_limit,
                events.status,
                events.published_at,
                events.updated_at,
                users.user_name AS organiser_name,
                event_participants.user_id AS joined_user_id,
                COUNT(joined_users.user_id) AS participant_count
            FROM events
            JOIN users
            ON events.organiser_id = users.user_id
            LEFT JOIN event_participants
            ON events.event_id = event_participants.event_id
            AND event_participants.user_id = ?
            LEFT JOIN event_participants AS joined_users
            ON events.event_id = joined_users.event_id
            WHERE events.status = 'published'
            GROUP BY events.event_id
            ORDER BY events.event_date ASC
        `;

        query_parameters = [req.session.userId];
    }

    // Execute the query and render the page with the results
    global.db.all(query, query_parameters, 
        function(err, events) {

            if (err) {
                next(err);
            } else {
                res.render("events/list.ejs", {
                    draftEvents: events.filter(function(event) {
                        return event.status === "draft";
                    }),
                    publishedEvents: events.filter(function(event) {
                        return event.status === "published";
                    }),
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

    // Check the submitted event details before inserting
    const validation = validateEventForm(req, 0);
    const errors = validation.errors;
    const formData = validation.formData;

    if (Object.keys(errors).length > 0) {
        return res.render("events/new.ejs", {
            errors: errors,
            formData: formData
        });
    }

    // Add the new event to the database as a draft
    query = `
        INSERT INTO events (title, description, event_date, location, participant_limit, organiser_id)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    query_parameters = [
        formData.title,
        formData.description,
        formData.event_date,
        formData.location,
        formData.participant_limit || null,
        req.session.userId
    ];

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
 * @desc Publishes an event so participants can see it
 */
router.post("/:eventId/publish", requireLogin, requireRole("organiser"), function(req, res, next) {

    // Only the organiser who created the event can publish it
    query = `
        UPDATE events
        SET status = 'published',
            published_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE event_id = ?
        AND organiser_id = ?
        AND status = 'draft'
    `;

    query_parameters = [req.params.eventId, req.session.userId];

    global.db.run(query, query_parameters,
        function(err) {

            if (err) {
                next(err);
            } else {
                res.redirect(`/events/${req.params.eventId}`);
            }

        }
    );

});

/**
 * @desc Display an event details page for organisers
 */
router.get("/:eventId", requireLogin, requireRole("organiser"), function(req, res, next) {

    // Get this event and make sure it belongs to the logged in organiser
    query = `
        SELECT events.*, COUNT(event_participants.user_id) AS participant_count
        FROM events
        LEFT JOIN event_participants
        ON events.event_id = event_participants.event_id
        WHERE events.event_id = ?
        AND events.organiser_id = ?
        GROUP BY events.event_id
    `;

    query_parameters = [req.params.eventId, req.session.userId];

    // Execute the query and render the event details page
    global.db.get(query, query_parameters,
        function(err, event) {

            if (err) {
                next(err);
            } else if (!event) {
                res.status(404).send("Event not found");
            } else {
                // Get the participants who have joined this event
                query = `
                    SELECT users.user_id, users.user_name, email_accounts.email_address, event_participants.joined_at
                    FROM event_participants
                    JOIN users
                    ON event_participants.user_id = users.user_id
                    LEFT JOIN email_accounts
                    ON users.user_id = email_accounts.user_id
                    WHERE event_participants.event_id = ?
                    ORDER BY users.user_name ASC
                `;

                query_parameters = [req.params.eventId];

                global.db.all(query, query_parameters,
                    function(err, participants) {

                        if (err) {
                            next(err);
                        } else {
                            res.render("events/details.ejs", {
                                event: event,
                                participants: participants
                            });
                        }

                    }
                );
            }

        }
    );

});

/**
 * @desc Displays a page with a form for editing an event
 */
router.get("/:eventId/edit", requireLogin, requireRole("organiser"), function(req, res, next) {

    // Get the event details to fill in the edit form
    query = `
        SELECT events.*, COUNT(event_participants.user_id) AS participant_count
        FROM events
        LEFT JOIN event_participants
        ON events.event_id = event_participants.event_id
        WHERE events.event_id = ?
        AND events.organiser_id = ?
        GROUP BY events.event_id
    `;

    query_parameters = [req.params.eventId, req.session.userId];

    // Execute the query and render the edit page
    global.db.get(query, query_parameters,
        function(err, event) {

            if (err) {
                next(err);
            } else if (!event) {
                res.status(404).send("Event not found");
            } else {
                res.render("events/edit.ejs", {
                    errors: {},
                    formData: event,
                    event: event
                });
            }

        }
    );

});

/**
 * @desc Update an event based on data from the submitted form
 */
router.post("/:eventId/edit", requireLogin, requireRole("organiser"), function(req, res, next) {

    // Get the current event first so I can validate against the existing participants
    query = `
        SELECT events.*, COUNT(event_participants.user_id) AS participant_count
        FROM events
        LEFT JOIN event_participants
        ON events.event_id = event_participants.event_id
        WHERE events.event_id = ?
        AND events.organiser_id = ?
        GROUP BY events.event_id
    `;

    query_parameters = [req.params.eventId, req.session.userId];

    global.db.get(query, query_parameters,
        function(err, event) {

            if (err) {
                next(err);
            } else if (!event) {
                res.status(404).send("Event not found");
            } else {
                // Check the edited event details before updating
                const validation = validateEventForm(req, event.participant_count);
                const errors = validation.errors;
                const formData = validation.formData;

                if (Object.keys(errors).length > 0) {
                    return res.render("events/edit.ejs", {
                        errors: errors,
                        formData: formData,
                        event: event
                    });
                }

                // Update the event details in the database
                query = `
                    UPDATE events
                    SET title = ?, description = ?, event_date = ?, location = ?, participant_limit = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE event_id = ?
                    AND organiser_id = ?
                `;

                query_parameters = [
                    formData.title,
                    formData.description,
                    formData.event_date,
                    formData.location,
                    formData.participant_limit || null,
                    req.params.eventId,
                    req.session.userId
                ];

                global.db.run(query, query_parameters,
                    function(err) {

                        if (err) {
                            next(err);
                        } else {
                            res.redirect(`/events/${req.params.eventId}`);
                        }

                    }
                );
            }

        }
    );

});

/**
 * @desc Join an event as a participant
 */
router.post("/:eventId/join", requireLogin, requireRole("participant"), function(req, res, next) {

    // Check the event capacity before joining
    query = `
        SELECT events.participant_limit, COUNT(event_participants.user_id) AS participant_count
        FROM events
        LEFT JOIN event_participants
        ON events.event_id = event_participants.event_id
        WHERE events.event_id = ?
        AND events.status = 'published'
        GROUP BY events.event_id
    `;

    query_parameters = [req.params.eventId];

    global.db.get(query, query_parameters,
        function(err, event) {

            if (err) {
                next(err);
            } else if (!event) {
                res.status(404).send("Event not found");
            } else if (event.participant_limit && event.participant_count >= event.participant_limit) {
                res.status(400).send("This event is full.");
            } else {
                // Add this participant to the event
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
            }

        }
    );

});

module.exports = router;
