/**
 * eventsModel.js
 * I moved the event database code here because routes/events.js was getting too long.
 * The queries are kept as smaller steps so they are easier for me to read and explain.
 */

/**
 * @desc Runs a function for each item in order
 * @input items array, eachItem function and callback
 * @output Calls callback after every item has finished
 */
function runEach(items, eachItem, callback) {
    const remainingItems = items.slice();

    function runNextItem() {
        const item = remainingItems.shift();

        if (!item) {
            return callback();
        }

        eachItem(item, function (err) {
            if (err) {
                return callback(err);
            }

            runNextItem();
        });
    }

    runNextItem();
}

/**
 * @desc Gets all events created by one organiser
 * @input organiserId from the logged in session
 * @output An array of event rows with ticket summaries added
 */
function getOrganiserEvents(organiserId, callback) {
    const query = `
        SELECT events.*, users.user_name AS organiser_name
        FROM events
        JOIN users
        ON events.organiser_id = users.user_id
        WHERE events.organiser_id = ?
        ORDER BY events.event_date ASC
    `;

    const query_parameters = [organiserId];

    global.db.all(query, query_parameters, function (err, events) {
        if (err) {
            return callback(err);
        }

        addEventSummaries(events, null, callback);
    });
}

/**
 * @desc Gets all published events for attendees
 * @input userId from the logged in attendee session
 * @output An array of published event rows with ticket summaries added
 */
function getPublishedEvents(userId, callback) {
    const query = `
        SELECT events.*, users.user_name AS organiser_name
        FROM events
        JOIN users
        ON events.organiser_id = users.user_id
        WHERE events.status = 'published'
        ORDER BY events.event_date ASC
    `;

    global.db.all(query, function (err, events) {
        if (err) {
            return callback(err);
        }

        addEventSummaries(events, userId, callback);
    });
}

/**
 * @desc Adds ticket totals and purchase text to every event row
 * @input events array and optional userId
 * @output The same events array with extra fields used by the EJS pages
 */
function addEventSummaries(events, userId, callback) {
    runEach(
        events,
        function (event, done) {
            addEventSummary(event, userId, done);
        },
        function (err) {
            if (err) {
                return callback(err);
            }

            callback(null, events);
        },
    );
}

/**
 * @desc Adds ticket totals and participant count to one event
 * @input One event row and optional userId
 * @output The event row with summary fields for the page cards
 */
function addEventSummary(event, userId, callback) {
    getTicketsForEvent(event.event_id, function (err, tickets) {
        if (err) {
            return callback(err);
        }

        getParticipantCount(event.event_id, function (err, participantCount) {
            if (err) {
                return callback(err);
            }

            event.participant_count = participantCount;
            event.total_tickets = 0;
            event.total_tickets_sold = 0;

            const availableSummaries = [];
            const ticketSummaries = [];

            tickets.forEach(function (ticket) {
                const totalTickets = Number(ticket.quantity_available) || 0;
                const soldTickets = Number(ticket.quantity_sold) || 0;
                const remainingTickets = Math.max(totalTickets - soldTickets, 0);

                event.total_tickets += totalTickets;
                event.total_tickets_sold += soldTickets;

                availableSummaries.push(
                    `${ticket.ticket_type}: ${remainingTickets} left`,
                );

                ticketSummaries.push(
                    `${ticket.ticket_type}: ${soldTickets} / ${totalTickets} sold at $${ticket.price}`,
                );
            });

            event.available_ticket_summary = availableSummaries.join(',');
            event.ticket_summary = ticketSummaries.join(',');

            if (!userId) {
                return callback();
            }

            getPurchasesForUserAndEvent(
                event.event_id,
                userId,
                function (err, purchases) {
                    if (err) {
                        return callback(err);
                    }

                    event.purchased_ticket_summary = purchases
                        .map(function (purchase) {
                            return `${purchase.ticket_type} x${purchase.quantity}`;
                        })
                        .join(',');

                    callback();
                },
            );
        });
    });
}

/**
 * @desc Counts how many users joined one event
 * @input eventId from the event row
 * @output A number showing the participant count
 */
function getParticipantCount(eventId, callback) {
    const query = `
        SELECT COUNT(*) AS participant_count
        FROM event_participants
        WHERE event_id = ?
    `;

    global.db.get(query, [eventId], function (err, row) {
        if (err) {
            return callback(err);
        }

        callback(null, row.participant_count || 0);
    });
}

/**
 * @desc Gets how many tickets have been sold for one ticket type
 * @input ticketId from event_tickets
 * @output A number showing the quantity sold
 */
function getQuantitySoldForTicket(ticketId, callback) {
    const query = `
        SELECT SUM(quantity) AS quantity_sold
        FROM ticket_purchases
        WHERE ticket_id = ?
    `;

    global.db.get(query, [ticketId], function (err, row) {
        if (err) {
            return callback(err);
        }

        callback(null, row.quantity_sold || 0);
    });
}

/**
 * @desc Gets how many tickets this attendee already bought for one ticket type
 * @input ticketId and userId
 * @output A number showing the quantity bought by the logged in attendee
 */
function getQuantityBoughtForTicket(ticketId, userId, callback) {
    const query = `
        SELECT SUM(quantity) AS quantity_bought
        FROM ticket_purchases
        WHERE ticket_id = ?
        AND user_id = ?
    `;

    global.db.get(query, [ticketId, userId], function (err, row) {
        if (err) {
            return callback(err);
        }

        callback(null, row.quantity_bought || 0);
    });
}

/**
 * @desc Gets all ticket rows for one event and adds the sold count
 * @input eventId from the selected event
 * @output Array of ticket rows with quantity_sold added
 */
function getTicketsForEvent(eventId, callback) {
    const query = `
        SELECT *
        FROM event_tickets
        WHERE event_id = ?
        ORDER BY ticket_id ASC
    `;

    global.db.all(query, [eventId], function (err, tickets) {
        if (err) {
            return callback(err);
        }

        runEach(
            tickets,
            function (ticket, done) {
                getQuantitySoldForTicket(ticket.ticket_id, function (err, sold) {
                    if (err) {
                        return done(err);
                    }

                    ticket.quantity_sold = sold;
                    done();
                });
            },
            function (err) {
                if (err) {
                    return callback(err);
                }

                callback(null, tickets);
            },
        );
    });
}

/**
 * @desc Gets tickets for the attendee booking page
 * @input eventId and userId
 * @output Array of ticket rows with quantity_sold and quantity_bought added
 */
function getTicketsForAttendee(eventId, userId, callback) {
    getTicketsForEvent(eventId, function (err, tickets) {
        if (err) {
            return callback(err);
        }

        runEach(
            tickets,
            function (ticket, done) {
                getQuantityBoughtForTicket(
                    ticket.ticket_id,
                    userId,
                    function (err, bought) {
                        if (err) {
                            return done(err);
                        }

                        ticket.quantity_bought = bought;
                        done();
                    },
                );
            },
            function (err) {
                if (err) {
                    return callback(err);
                }

                callback(null, tickets);
            },
        );
    });
}

/**
 * @desc Adds ticket records after an event has been created
 * @input eventId and array of ticket objects
 * @output Calls callback after all tickets are inserted
 */
function addEventTickets(eventId, tickets, callback) {
    const ticketsToAdd = tickets.slice();

    function addNextTicket() {
        const ticket = ticketsToAdd.shift();

        if (!ticket) {
            return callback();
        }

        const query = `
            INSERT INTO event_tickets (event_id, ticket_type, quantity_available, price)
            VALUES (?, ?, ?, ?)
        `;

        const query_parameters = [
            eventId,
            ticket.ticket_type,
            ticket.quantity_available,
            ticket.price,
        ];

        global.db.run(query, query_parameters, function (err) {
            if (err) {
                return callback(err);
            }

            addNextTicket();
        });
    }

    addNextTicket();
}

/**
 * @desc Inserts the main event row into the events table
 * @input Event form data and organiserId
 * @output The new event id from SQLite
 */
function createEvent(eventData, organiserId, callback) {
    const query = `
        INSERT INTO events (title, description, event_date, location, organiser_id)
        VALUES (?, ?, ?, ?, ?)
    `;

    const query_parameters = [
        eventData.title,
        eventData.description,
        eventData.event_date,
        eventData.location,
        organiserId,
    ];

    global.db.run(query, query_parameters, function (err) {
        if (err) {
            return callback(err);
        }

        callback(null, this.lastID);
    });
}

/**
 * @desc Publishes a draft event that belongs to the logged in organiser
 * @input eventId from URL and organiserId from session
 * @output Updates the event status and timestamp
 */
function publishEvent(eventId, organiserId, callback) {
    const query = `
        UPDATE events
        SET status = 'published',
            published_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE event_id = ?
        AND organiser_id = ?
        AND status = 'draft'
    `;

    global.db.run(query, [eventId, organiserId], callback);
}

/**
 * @desc Deletes the event and the rows linked to it
 * @input eventId from URL and organiserId from session
 * @output Removes the event from the database
 */
function deleteEvent(eventId, organiserId, callback) {
    const query_parameters = [eventId, organiserId];

    const deleteParticipantsQuery = `
        DELETE FROM event_participants
        WHERE event_id = ?
        AND event_id IN (
            SELECT event_id
            FROM events
            WHERE organiser_id = ?
        )
    `;

    const deletePurchasesQuery = `
        DELETE FROM ticket_purchases
        WHERE event_id = ?
        AND event_id IN (
            SELECT event_id
            FROM events
            WHERE organiser_id = ?
        )
    `;

    const deleteTicketsQuery = `
        DELETE FROM event_tickets
        WHERE event_id = ?
        AND event_id IN (
            SELECT event_id
            FROM events
            WHERE organiser_id = ?
        )
    `;

    const deleteEventQuery = `
        DELETE FROM events
        WHERE event_id = ?
        AND organiser_id = ?
    `;

    // These deletes are done in order because the other tables depend on events.
    global.db.run(deleteParticipantsQuery, query_parameters, function (err) {
        if (err) {
            return callback(err);
        }

        global.db.run(deletePurchasesQuery, query_parameters, function (err) {
            if (err) {
                return callback(err);
            }

            global.db.run(deleteTicketsQuery, query_parameters, function (err) {
                if (err) {
                    return callback(err);
                }

                global.db.run(deleteEventQuery, query_parameters, callback);
            });
        });
    });
}

/**
 * @desc Gets one published event for the attendee event page
 * @input eventId from URL
 * @output One event row or undefined if it is not found
 */
function getPublishedEventById(eventId, callback) {
    const query = `
        SELECT events.*, users.user_name AS organiser_name
        FROM events
        JOIN users
        ON events.organiser_id = users.user_id
        WHERE events.event_id = ?
        AND events.status = 'published'
    `;

    global.db.get(query, [eventId], callback);
}

/**
 * @desc Gets one event only if it belongs to the logged in organiser
 * @input eventId from URL and organiserId from session
 * @output One event row for the edit page
 */
function getOrganiserEventById(eventId, organiserId, callback) {
    const query = `
        SELECT *
        FROM events
        WHERE event_id = ?
        AND organiser_id = ?
    `;

    global.db.get(query, [eventId, organiserId], function (err, event) {
        if (err) {
            return callback(err);
        }

        if (!event) {
            return callback(null, null);
        }

        getParticipantCount(event.event_id, function (err, participantCount) {
            if (err) {
                return callback(err);
            }

            event.participant_count = participantCount;
            callback(null, event);
        });
    });
}

/**
 * @desc Gets all participants for one event
 * @input eventId from the organiser edit page
 * @output Array of participant rows with ticket summary text added
 */
function getParticipantsForEvent(eventId, callback) {
    const query = `
        SELECT
            users.user_id,
            users.user_name,
            email_accounts.email_address,
            event_participants.joined_at
        FROM event_participants
        JOIN users
        ON event_participants.user_id = users.user_id
        LEFT JOIN email_accounts
        ON users.user_id = email_accounts.user_id
        WHERE event_participants.event_id = ?
        ORDER BY users.user_name ASC
    `;

    global.db.all(query, [eventId], function (err, participants) {
        if (err) {
            return callback(err);
        }

        runEach(
            participants,
            function (participant, done) {
                getPurchasesForUserAndEvent(
                    eventId,
                    participant.user_id,
                    function (err, purchases) {
                        if (err) {
                            return done(err);
                        }

                        participant.ticket_summary = purchases
                            .map(function (purchase) {
                                return `${purchase.ticket_type} x${purchase.quantity}`;
                            })
                            .join(', ');

                        done();
                    },
                );
            },
            function (err) {
                if (err) {
                    return callback(err);
                }

                callback(null, participants);
            },
        );
    });
}

/**
 * @desc Updates the main event details
 * @input eventId, organiserId and edited form data
 * @output Updates the event row in the database
 */
function updateEvent(eventId, organiserId, eventData, callback) {
    const query = `
        UPDATE events
        SET title = ?,
            description = ?,
            event_date = ?,
            location = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE event_id = ?
        AND organiser_id = ?
    `;

    const query_parameters = [
        eventData.title,
        eventData.description,
        eventData.event_date,
        eventData.location,
        eventId,
        organiserId,
    ];

    global.db.run(query, query_parameters, callback);
}

/**
 * @desc Updates or inserts ticket rows for an event
 * @input eventId and array of ticket rows from the form
 * @output Saves the ticket changes to the database
 */
function saveEventTickets(eventId, tickets, callback) {
    const ticketsToSave = tickets.slice();

    function saveNextTicket() {
        const ticket = ticketsToSave.shift();

        if (!ticket) {
            return callback();
        }

        let query;
        let query_parameters;

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
                eventId,
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
                ticket.price,
            ];
        }

        global.db.run(query, query_parameters, function (err) {
            if (err) {
                return callback(err);
            }

            saveNextTicket();
        });
    }

    saveNextTicket();
}

/**
 * @desc Records the attendee as joined for the event
 * @input eventId and userId
 * @output Inserts into event_participants if it does not exist yet
 */
function addParticipant(eventId, userId, callback) {
    const query = `
        INSERT OR IGNORE INTO event_participants (event_id, user_id)
        VALUES (?, ?)
    `;

    global.db.run(query, [eventId, userId], callback);
}

/**
 * @desc Adds ticket purchase rows one at a time
 * @input eventId, userId, attendee name and selected tickets
 * @output Array of new purchase ids
 */
function addTicketPurchases(
    eventId,
    userId,
    attendeeName,
    selectedTickets,
    callback,
) {
    const ticketsToBuy = selectedTickets.slice();
    const purchaseIds = [];

    function addNextPurchase() {
        const ticket = ticketsToBuy.shift();

        if (!ticket) {
            return callback(null, purchaseIds);
        }

        const query = `
            INSERT INTO ticket_purchases (event_id, ticket_id, user_id, attendee_name, quantity)
            VALUES (?, ?, ?, ?, ?)
        `;

        const query_parameters = [
            eventId,
            ticket.ticket_id,
            userId,
            attendeeName,
            ticket.quantity,
        ];

        global.db.run(query, query_parameters, function (err) {
            if (err) {
                return callback(err);
            }

            purchaseIds.push(this.lastID);
            addNextPurchase();
        });
    }

    addNextPurchase();
}

/**
 * @desc Gets purchases for one user in one event
 * @input eventId and userId
 * @output Array of purchase rows with ticket type included
 */
function getPurchasesForUserAndEvent(eventId, userId, callback) {
    const query = `
        SELECT ticket_purchases.*, event_tickets.ticket_type
        FROM ticket_purchases
        JOIN event_tickets
        ON ticket_purchases.ticket_id = event_tickets.ticket_id
        WHERE ticket_purchases.event_id = ?
        AND ticket_purchases.user_id = ?
        ORDER BY ticket_purchases.purchase_id ASC
    `;

    global.db.all(query, [eventId, userId], callback);
}

/**
 * @desc Gets a purchase confirmation record for the logged in attendee
 * @input purchaseId, eventId and userId
 * @output One purchase row with event and ticket details
 */
function getPurchaseConfirmation(purchaseId, eventId, userId, callback) {
    const query = `
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

    global.db.get(query, [purchaseId, eventId, userId], callback);
}

module.exports = {
    getOrganiserEvents,
    getPublishedEvents,
    getTicketsForEvent,
    getTicketsForAttendee,
    addEventTickets,
    createEvent,
    publishEvent,
    deleteEvent,
    getPublishedEventById,
    getOrganiserEventById,
    getParticipantsForEvent,
    updateEvent,
    saveEventTickets,
    addParticipant,
    addTicketPurchases,
    getPurchaseConfirmation,
};
