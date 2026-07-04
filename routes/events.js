const express = require("express");
const router = express.Router();
const requireLogin = require("../middleware/auth.js");
const { requireRole } = require("../middleware/roles.js");
const FIXED_TICKET_TYPES = ["Full price ticket", "Concession price ticket"];

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
 * @desc Makes sure repeated ticket form fields are always arrays
 */
function makeArray(value) {

    if (!value) {
        return [];
    }

    if (Array.isArray(value)) {
        return value;
    }

    return [value];
}

/**
 * @desc Makes the event ticket rows use my fixed ticket types
 */
function getFixedTicketRows(tickets) {

    return FIXED_TICKET_TYPES.map(function(ticketType, index) {

        const matchingTicket = tickets.find(function(ticket) {
            return ticket.ticket_type && ticket.ticket_type.toLowerCase() === ticketType.toLowerCase();
        });

        const ticket = matchingTicket || tickets[index] || {};

        return {
            ticket_id: ticket.ticket_id || "",
            ticket_type: ticketType,
            quantity_available: ticket.quantity_available || "",
            price: ticket.price || "",
            quantity_sold: ticket.quantity_sold || 0
        };

    });
}

/**
 * @desc Gets ticket data from the submitted form
 */
function getTicketFormData(req) {

    const ticketIds = makeArray(req.body.ticket_id);
    const ticketTypes = makeArray(req.body.ticket_type);
    const ticketQuantities = makeArray(req.body.ticket_quantity);
    const ticketPrices = makeArray(req.body.ticket_price);
    const tickets = [];

    for (let i = 0; i < ticketTypes.length; i++) {
        tickets.push({
            ticket_id: (ticketIds[i] || "").trim(),
            ticket_type: (ticketTypes[i] || "").trim(),
            quantity_available: (ticketQuantities[i] || "").trim(),
            price: (ticketPrices[i] || "").trim()
        });
    }

    return tickets;
}

/**
 * @desc Validates the ticket rows for an event
 */
function validateTickets(tickets) {

    const errors = {};
    const fixedTickets = getFixedTicketRows(tickets);

    fixedTickets.forEach(function(ticket) {
        if (!ticket.ticket_type) {
            errors.tickets = "Please choose a valid ticket type";
        } else if (!Number.isInteger(Number(ticket.quantity_available)) || Number(ticket.quantity_available) <= 0) {
            errors.tickets = `Please enter a valid quantity for ${ticket.ticket_type}`;
        } else if (isNaN(Number(ticket.price)) || Number(ticket.price) < 0) {
            errors.tickets = `Please enter a valid price for ${ticket.ticket_type}`;
        }
    });

    return {
        errors: errors,
        tickets: fixedTickets
    };
}

/**
 * @desc Validates the create and edit event forms
 */
function validateEventForm(req) {

    const title = (req.body.title || "").trim();
    const description = (req.body.description || "").trim();
    const eventDate = (req.body.event_date || "").trim();
    const location = (req.body.location || "").trim();
    const errors = {};
    const ticketValidation = validateTickets(getTicketFormData(req));

    const formData = {
        title: title,
        description: description,
        event_date: eventDate,
        location: location,
        tickets: ticketValidation.tickets
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

    if (ticketValidation.errors.tickets) {
        errors.tickets = ticketValidation.errors.tickets;
    }

    return {
        errors: errors,
        formData: formData,
        tickets: ticketValidation.tickets
    };
}

/**
 * @desc Adds ticket records for an event
 */
function addEventTickets(eventId, tickets, callback) {

    function addNextTicket() {

        const ticket = tickets.shift();

        if (!ticket) {
            return callback();
        }

        query = `
            INSERT INTO event_tickets (event_id, ticket_type, quantity_available, price)
            VALUES (?, ?, ?, ?)
        `;

        query_parameters = [
            eventId,
            ticket.ticket_type,
            ticket.quantity_available,
            ticket.price
        ];

        global.db.run(query, query_parameters,
            function(err) {

                if (err) {
                    return callback(err);
                }

                addNextTicket();

            }
        );
    }

    addNextTicket();
}

/**
 * @desc Saves edited ticket records without losing old ticket purchase links
 */
function saveEventTickets(eventId, tickets, callback) {

    function saveNextTicket() {

        const ticket = tickets.shift();

        if (!ticket) {
            return callback();
        }

        if (ticket.ticket_id) {
            query = `
                UPDATE event_tickets
                SET ticket_type = ?, quantity_available = ?, price = ?
                WHERE ticket_id = ?
                AND event_id = ?
            `;

            query_parameters = [
                ticket.ticket_type,
                ticket.quantity_available,
                ticket.price,
                ticket.ticket_id,
                eventId
            ];
        } else {
            query = `
                INSERT INTO event_tickets (event_id, ticket_type, quantity_available, price)
                VALUES (?, ?, ?, ?)
            `;

            query_parameters = [
                eventId,
                ticket.ticket_type,
                ticket.quantity_available,
                ticket.price
            ];
        }

        global.db.run(query, query_parameters,
            function(err) {

                if (err) {
                    return callback(err);
                }

                saveNextTicket();

            }
        );
    }

    saveNextTicket();
}

/**
 * @desc Gets ticket records for one event
 */
function getTicketsForEvent(eventId, callback) {

    query = `
        SELECT
            event_tickets.*,
            (
                SELECT COALESCE(SUM(ticket_purchases.quantity), 0)
                FROM ticket_purchases
                WHERE ticket_purchases.ticket_id = event_tickets.ticket_id
            ) AS quantity_sold
        FROM event_tickets
        WHERE event_tickets.event_id = ?
        ORDER BY ticket_id ASC
    `;

    query_parameters = [eventId];

    global.db.all(query, query_parameters, callback);
}

/**
 * @desc Adds ticket purchase rows one at a time
 */
function addTicketPurchases(eventId, userId, selectedTickets, callback) {

    const purchaseIds = [];

    function addNextPurchase() {

        const ticket = selectedTickets.shift();

        if (!ticket) {
            return callback(null, purchaseIds);
        }

        query = `
            INSERT INTO ticket_purchases (event_id, ticket_id, user_id, quantity)
            VALUES (?, ?, ?, ?)
        `;

        query_parameters = [eventId, ticket.ticket_id, userId, ticket.quantity];

        global.db.run(query, query_parameters,
            function(err) {

                if (err) {
                    return callback(err);
                }

                purchaseIds.push(this.lastID);
                addNextPurchase();

            }
        );
    }

    addNextPurchase();
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
                events.status,
                events.created_at,
                events.published_at,
                events.updated_at,
                users.user_name AS organiser_name,
                COUNT(DISTINCT joined_users.user_id) AS participant_count,
                (
                    SELECT COALESCE(SUM(all_tickets.quantity_available), 0)
                    FROM event_tickets AS all_tickets
                    WHERE all_tickets.event_id = events.event_id
                ) AS total_tickets,
                (
                    SELECT COALESCE(SUM(all_purchases.quantity), 0)
                    FROM ticket_purchases AS all_purchases
                    WHERE all_purchases.event_id = events.event_id
                ) AS total_tickets_sold,
                GROUP_CONCAT(DISTINCT event_tickets.ticket_type || ': ' || MAX(event_tickets.quantity_available - (
                    SELECT COALESCE(SUM(ticket_purchases.quantity), 0)
                    FROM ticket_purchases
                    WHERE ticket_purchases.ticket_id = event_tickets.ticket_id
                ), 0) || ' left') AS available_ticket_summary,
                GROUP_CONCAT(DISTINCT event_tickets.ticket_type || ': ' || (
                    SELECT COALESCE(SUM(ticket_purchases.quantity), 0)
                    FROM ticket_purchases
                    WHERE ticket_purchases.ticket_id = event_tickets.ticket_id
                ) || ' / ' || event_tickets.quantity_available || ' sold at $' || event_tickets.price) AS ticket_summary
            FROM events
            JOIN users
            ON events.organiser_id = users.user_id
            LEFT JOIN event_participants AS joined_users
            ON events.event_id = joined_users.event_id
            LEFT JOIN event_tickets
            ON events.event_id = event_tickets.event_id
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
                events.status,
                events.created_at,
                events.published_at,
                events.updated_at,
                users.user_name AS organiser_name,
                COUNT(DISTINCT joined_users.user_id) AS participant_count,
                (
                    SELECT COALESCE(SUM(all_tickets.quantity_available), 0)
                    FROM event_tickets AS all_tickets
                    WHERE all_tickets.event_id = events.event_id
                ) AS total_tickets,
                (
                    SELECT COALESCE(SUM(all_purchases.quantity), 0)
                    FROM ticket_purchases AS all_purchases
                    WHERE all_purchases.event_id = events.event_id
                ) AS total_tickets_sold,
                GROUP_CONCAT(DISTINCT event_tickets.ticket_type || ': ' || MAX(event_tickets.quantity_available - (
                    SELECT COALESCE(SUM(all_ticket_purchases.quantity), 0)
                    FROM ticket_purchases AS all_ticket_purchases
                    WHERE all_ticket_purchases.ticket_id = event_tickets.ticket_id
                ), 0) || ' left') AS available_ticket_summary,
                GROUP_CONCAT(DISTINCT event_tickets.ticket_type || ': ' || event_tickets.quantity_available || ' tickets at $' || event_tickets.price) AS ticket_summary,
                GROUP_CONCAT(DISTINCT purchased_tickets.ticket_type || ' x' || ticket_purchases.quantity) AS purchased_ticket_summary
            FROM events
            JOIN users
            ON events.organiser_id = users.user_id
            LEFT JOIN event_participants AS joined_users
            ON events.event_id = joined_users.event_id
            LEFT JOIN event_tickets
            ON events.event_id = event_tickets.event_id
            LEFT JOIN ticket_purchases
            ON events.event_id = ticket_purchases.event_id
            AND ticket_purchases.user_id = ?
            LEFT JOIN event_tickets AS purchased_tickets
            ON ticket_purchases.ticket_id = purchased_tickets.ticket_id
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
 * @desc Shows the ticket purchase confirmation page
 */
router.get("/:eventId/purchases/:purchaseId/confirmation", requireLogin, requireRole("participant"), function(req, res, next) {

    // Get the purchase that belongs to the logged in attendee
    query = `
        SELECT
            ticket_purchases.*,
            event_tickets.ticket_type,
            event_tickets.price,
            events.title,
            events.event_date,
            events.location,
            users.user_name AS organiser_name
        FROM ticket_purchases
        JOIN event_tickets
        ON ticket_purchases.ticket_id = event_tickets.ticket_id
        JOIN events
        ON ticket_purchases.event_id = events.event_id
        JOIN users
        ON events.organiser_id = users.user_id
        WHERE ticket_purchases.purchase_id = ?
        AND ticket_purchases.event_id = ?
        AND ticket_purchases.user_id = ?
    `;

    query_parameters = [
        req.params.purchaseId,
        req.params.eventId,
        req.session.userId
    ];

    global.db.get(query, query_parameters,
        function(err, purchase) {

            if (err) {
                next(err);
            } else if (!purchase) {
                res.status(404).send("Purchase not found");
            } else {
                res.render("events/purchase-confirmation.ejs", {
                    purchase: purchase,
                    totalPrice: purchase.price * purchase.quantity
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
        formData: {
            tickets: getFixedTicketRows([])
        }
    });

});

/**
 * @desc Add a new event to the database based on data from the submitted form
 */
router.post("/", requireLogin, requireRole("organiser"), function(req, res, next) {

    // Check the submitted event details before inserting
    const validation = validateEventForm(req);
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
        INSERT INTO events (title, description, event_date, location, organiser_id)
        VALUES (?, ?, ?, ?, ?)
    `;

    query_parameters = [
        formData.title,
        formData.description,
        formData.event_date,
        formData.location,
        req.session.userId
    ];

    global.db.run(query, query_parameters,
        function(err) {

            if (err) {
                next(err);
            } else {
                const eventId = this.lastID;

                addEventTickets(eventId, validation.tickets, function(err) {

                    if (err) {
                        next(err);
                    } else {
                        res.redirect(`/events/${eventId}/edit`);
                    }

                });
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
                res.redirect(`/events/${req.params.eventId}/edit`);
            }

        }
    );

});

/**
 * @desc Deletes an event from the database
 */
router.post("/:eventId/delete", requireLogin, requireRole("organiser"), function(req, res, next) {

    // Delete linked records first so the event can be removed
    global.db.serialize(function() {

        query_parameters = [req.params.eventId, req.session.userId];

        global.db.run(
            "DELETE FROM event_participants WHERE event_id = ? AND event_id IN (SELECT event_id FROM events WHERE organiser_id = ?)",
            query_parameters
        );

        global.db.run(
            "DELETE FROM ticket_purchases WHERE event_id = ? AND event_id IN (SELECT event_id FROM events WHERE organiser_id = ?)",
            query_parameters
        );

        global.db.run(
            "DELETE FROM event_tickets WHERE event_id = ? AND event_id IN (SELECT event_id FROM events WHERE organiser_id = ?)",
            query_parameters
        );

        global.db.run(
            "DELETE FROM events WHERE event_id = ? AND organiser_id = ?",
            query_parameters,
            function(err) {

                if (err) {
                    next(err);
                } else {
                    res.redirect("/events");
                }

            }
        );

    });

});

/**
 * @desc Display a single published event for attendees
 */
router.get("/:eventId", requireLogin, function(req, res, next) {

    if (req.session.userRole === "organiser") {
        return res.redirect(`/events/${req.params.eventId}/edit`);
    }

    // Get the published event shown in the URL
    query = `
        SELECT events.*, users.user_name AS organiser_name
        FROM events
        JOIN users
        ON events.organiser_id = users.user_id
        WHERE events.event_id = ?
        AND events.status = 'published'
    `;

    query_parameters = [req.params.eventId];

    global.db.get(query, query_parameters,
        function(err, event) {

            if (err) {
                next(err);
            } else if (!event) {
                res.status(404).send("Event not found");
            } else {
                // Get ticket types and how many are still available
                query = `
                    SELECT
                        event_tickets.ticket_id,
                        event_tickets.ticket_type,
                        event_tickets.quantity_available,
                        event_tickets.price,
                        (
                            SELECT COALESCE(SUM(all_purchases.quantity), 0)
                            FROM ticket_purchases AS all_purchases
                            WHERE all_purchases.ticket_id = event_tickets.ticket_id
                        ) AS quantity_sold,
                        (
                            SELECT COALESCE(SUM(my_purchases.quantity), 0)
                            FROM ticket_purchases AS my_purchases
                            WHERE my_purchases.ticket_id = event_tickets.ticket_id
                            AND my_purchases.user_id = ?
                        ) AS quantity_bought
                    FROM event_tickets
                    WHERE event_tickets.event_id = ?
                    ORDER BY event_tickets.ticket_id ASC
                `;

                query_parameters = [req.session.userId, req.params.eventId];

                global.db.all(query, query_parameters,
                    function(err, tickets) {

                        if (err) {
                            next(err);
                        } else {
                            res.render("events/attendee-details.ejs", {
                                event: event,
                                tickets: tickets,
                                errors: {},
                                formData: {}
                            });
                        }

                    }
                );
            }

        }
    );

});

/**
 * @desc Purchases selected tickets for an attendee
 */
router.post("/:eventId/purchase", requireLogin, requireRole("participant"), function(req, res, next) {

    // Make sure the event is published before allowing ticket purchase
    query = `
        SELECT events.*, users.user_name AS organiser_name
        FROM events
        JOIN users
        ON events.organiser_id = users.user_id
        WHERE events.event_id = ?
        AND events.status = 'published'
    `;

    query_parameters = [req.params.eventId];

    global.db.get(query, query_parameters,
        function(err, event) {

            if (err) {
                next(err);
            } else if (!event) {
                res.status(404).send("Event not found");
            } else {
                query = `
                    SELECT
                        event_tickets.ticket_id,
                        event_tickets.ticket_type,
                        event_tickets.quantity_available,
                        event_tickets.price,
                        (
                            SELECT COALESCE(SUM(all_purchases.quantity), 0)
                            FROM ticket_purchases AS all_purchases
                            WHERE all_purchases.ticket_id = event_tickets.ticket_id
                        ) AS quantity_sold,
                        (
                            SELECT COALESCE(SUM(my_purchases.quantity), 0)
                            FROM ticket_purchases AS my_purchases
                            WHERE my_purchases.ticket_id = event_tickets.ticket_id
                            AND my_purchases.user_id = ?
                        ) AS quantity_bought
                    FROM event_tickets
                    WHERE event_tickets.event_id = ?
                    ORDER BY event_tickets.ticket_id ASC
                `;

                query_parameters = [req.session.userId, req.params.eventId];

                global.db.all(query, query_parameters,
                    function(err, tickets) {

                        if (err) {
                            next(err);
                        } else {
                            const errors = {};
                            const selectedTickets = [];
                            const selectedTicketId = (req.body.ticket_id || "").trim();
                            const quantity = Number(req.body.ticket_quantity || 0);
                            const selectedTicket = tickets.find(function(ticket) {
                                return String(ticket.ticket_id) === selectedTicketId;
                            });

                            if (!selectedTicket) {
                                errors.tickets = "Please choose a ticket type";
                            } else {
                                const remainingTickets = selectedTicket.quantity_available - selectedTicket.quantity_sold;

                                if (quantity <= 0 || !Number.isInteger(quantity)) {
                                    errors.tickets = "Please enter a valid ticket quantity";
                                } else if (quantity > remainingTickets) {
                                    errors.tickets = `Not enough ${selectedTicket.ticket_type} tickets available`;
                                } else {
                                    selectedTickets.push({
                                        ticket_id: selectedTicket.ticket_id,
                                        quantity: quantity
                                    });
                                }
                            }

                            if (errors.tickets) {
                                return res.render("events/attendee-details.ejs", {
                                    event: event,
                                    tickets: tickets,
                                    errors: errors,
                                    formData: {
                                        ticket_id: selectedTicketId,
                                        ticket_quantity: req.body.ticket_quantity
                                    }
                                });
                            }

                            // Record this attendee for the event
                            query = `
                                INSERT OR IGNORE INTO event_participants (event_id, user_id)
                                VALUES (?, ?)
                            `;

                            query_parameters = [req.params.eventId, req.session.userId];

                            global.db.run(query, query_parameters,
                                function(err) {

                                    if (err) {
                                        next(err);
                                    } else {
                                        addTicketPurchases(req.params.eventId, req.session.userId, selectedTickets, function(err, purchaseIds) {

                                            if (err) {
                                                next(err);
                                            } else {
                                                res.redirect(`/events/${req.params.eventId}/purchases/${purchaseIds[0]}/confirmation`);
                                            }

                                        });
                                    }

                                }
                            );
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

    global.db.get(query, query_parameters,
        function(err, event) {

            if (err) {
                next(err);
            } else if (!event) {
                res.status(404).send("Event not found");
            } else {
                getTicketsForEvent(req.params.eventId, function(err, tickets) {

                    if (err) {
                        next(err);
                    } else {
                        event.tickets = getFixedTicketRows(tickets);

                        // Get attendees and the tickets they bought for this event
                        query = `
                            SELECT
                                users.user_id,
                                users.user_name,
                                email_accounts.email_address,
                                event_participants.joined_at,
                                GROUP_CONCAT(event_tickets.ticket_type || ' x' || ticket_purchases.quantity) AS ticket_summary
                            FROM event_participants
                            JOIN users
                            ON event_participants.user_id = users.user_id
                            LEFT JOIN email_accounts
                            ON users.user_id = email_accounts.user_id
                            LEFT JOIN ticket_purchases
                            ON event_participants.event_id = ticket_purchases.event_id
                            AND event_participants.user_id = ticket_purchases.user_id
                            LEFT JOIN event_tickets
                            ON ticket_purchases.ticket_id = event_tickets.ticket_id
                            WHERE event_participants.event_id = ?
                            GROUP BY users.user_id
                            ORDER BY users.user_name ASC
                        `;

                        query_parameters = [req.params.eventId];

                        global.db.all(query, query_parameters,
                            function(err, participants) {

                                if (err) {
                                    next(err);
                                } else {
                                    res.render("events/edit.ejs", {
                                        errors: {},
                                        formData: event,
                                        event: event,
                                        participants: participants
                                    });
                                }

                            }
                        );
                    }

                });
            }

        }
    );

});

/**
 * @desc Update an event based on data from the submitted form
 */
router.post("/:eventId/edit", requireLogin, requireRole("organiser"), function(req, res, next) {

    // Get the current event first so I can make sure it belongs to this organiser
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
                const validation = validateEventForm(req);
                const errors = validation.errors;
                const formData = validation.formData;

                if (Object.keys(errors).length > 0) {
                    return res.render("events/edit.ejs", {
                        errors: errors,
                        formData: formData,
                        event: event,
                        participants: []
                    });
                }

                // Update the event details in the database
                query = `
                    UPDATE events
                    SET title = ?, description = ?, event_date = ?, location = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE event_id = ?
                    AND organiser_id = ?
                `;

                query_parameters = [
                    formData.title,
                    formData.description,
                    formData.event_date,
                    formData.location,
                    req.params.eventId,
                    req.session.userId
                ];

                global.db.run(query, query_parameters,
                    function(err) {

                        if (err) {
                            next(err);
                        } else {
                            // Save the ticket rows without breaking ticket purchases
                            saveEventTickets(req.params.eventId, validation.tickets, function(err) {

                                if (err) {
                                    next(err);
                                } else {
                                    res.redirect(`/events/${req.params.eventId}/edit`);
                                }

                            });
                        }

                    }
                );
            }

        }
    );

});

module.exports = router;
