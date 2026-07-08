/**
 * eventsModel.js
 * I moved the event database code here because routes/events.js was getting too long.
 * The route file should mainly decide what page to show, while this file handles the SQL.
 */

const walletModel = require('./walletModel.js');

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
function getOrganiserEvents(organiserId, sortOption, callback) {
    let orderBy = 'events.event_date ASC';

    switch (sortOption) {
        case 'latest':
            orderBy = 'events.event_date DESC';
            break;
        case 'earliest':
            orderBy = 'events.event_date ASC';
            break;
    }

    const query = `
        SELECT events.*, users.user_name AS organiser_name
        FROM events
        JOIN users
        ON events.organiser_id = users.user_id
        WHERE events.organiser_id = ?
        ORDER BY ${orderBy}
    `;

    global.db.all(query, [organiserId], function (err, events) {
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
function getPublishedEvents(userId, sortOption, callback) {
    let orderBy = 'events.event_date ASC';
    
    switch (sortOption) {
        case 'latest':
            orderBy = 'events.event_date DESC';
            break;
        case 'earliest':
            orderBy = 'events.event_date ASC';
            break;
    }

    const query = `
        SELECT events.*, users.user_name AS organiser_name
        FROM events
        JOIN users
        ON events.organiser_id = users.user_id
        WHERE events.status = 'published'
        ORDER BY ${orderBy}
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
 * @desc Adds ticket totals and attendee count to one event
 * @input One event row and optional userId
 * @output The event row with summary fields for the page cards
 */
function addEventSummary(event, userId, callback) {
    getTicketsForEvent(event.event_id, function (err, tickets) {
        if (err) {
            return callback(err);
        }

        getAttendeeCount(event.event_id, function (err, attendeeCount) {
            if (err) {
                return callback(err);
            }

            event.attendee_count = attendeeCount;
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

            event.available_ticket_summary = availableSummaries.join(', ');
            event.ticket_summary = ticketSummaries.join(', ');

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
                        .join(', ');

                    callback();
                },
            );
        });
    });
}

/**
 * @desc Counts how many users joined one event
 * @input eventId from the event row
 * @output A number showing the attendee count
 */
function getAttendeeCount(eventId, callback) {
    const query = `
        SELECT COUNT(*) AS attendee_count
        FROM event_attendees
        WHERE event_id = ?
    `;

    global.db.get(query, [eventId], function (err, row) {
        if (err) {
            return callback(err);
        }

        callback(null, row.attendee_count || 0);
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
        FROM purchase_ticket_items
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
        SELECT SUM(purchase_ticket_items.quantity) AS quantity_bought
        FROM purchase_ticket_items
        JOIN ticket_purchases
        ON purchase_ticket_items.purchase_id = ticket_purchases.purchase_id
        WHERE purchase_ticket_items.ticket_id = ?
        AND ticket_purchases.user_id = ?
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
 * @desc Gets a published event with its ticket rows for the attendee page
 * @input eventId from URL and userId from session
 * @output Event and tickets used by attendee-details.ejs
 */
function getAttendeeEventDetails(eventId, userId, callback) {
    getPublishedEventById(eventId, function (err, event) {
        if (err) {
            return callback(err);
        }

        if (!event) {
            return callback(null, null);
        }

        getTicketsForAttendee(eventId, userId, function (err, tickets) {
            if (err) {
                return callback(err);
            }

            callback(null, {
                event: event,
                tickets: tickets,
            });
        });
    });
}

/**
 * @desc Gets one organiser event with tickets and attendees for the edit page
 * @input eventId and organiserId
 * @output Event, ticket rows and attendees
 */
function getOrganiserEventDetails(eventId, organiserId, callback) {
    getOrganiserEventById(eventId, organiserId, function (err, event) {
        if (err) {
            return callback(err);
        }

        if (!event) {
            return callback(null, null);
        }

        getTicketsForEvent(eventId, function (err, tickets) {
            if (err) {
                return callback(err);
            }

            getAttendeesForEvent(eventId, function (err, attendees) {
                if (err) {
                    return callback(err);
                }

                callback(null, {
                    event: event,
                    tickets: tickets,
                    attendees: attendees,
                });
            });
        });
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
 * @desc Creates an event and adds its two ticket rows
 * @input Event form data, organiserId and ticket rows
 * @output The new event id
 */
function createEventWithTickets(eventData, organiserId, tickets, callback) {
    createEvent(eventData, organiserId, function (err, eventId) {
        if (err) {
            return callback(err);
        }

        addEventTickets(eventId, tickets, function (err) {
            if (err) {
                return callback(err);
            }

            callback(null, eventId);
        });
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
            published_at = datetime('now', 'localtime'),
            updated_at = datetime('now', 'localtime')
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

    const clearWalletTransactionsQuery = `
        UPDATE wallet_transactions
        SET related_purchase_id = NULL
        WHERE related_purchase_id IN (
            SELECT purchase_id
            FROM ticket_purchases
            WHERE event_id = ?
            AND event_id IN (
                SELECT event_id
                FROM events
                WHERE organiser_id = ?
            )
        )
    `;

    const deleteAttendeesQuery = `
        DELETE FROM event_attendees
        WHERE event_id = ?
        AND event_id IN (
            SELECT event_id
            FROM events
            WHERE organiser_id = ?
        )
    `;

    const deletePurchaseItemsQuery = `
        DELETE FROM purchase_ticket_items
        WHERE purchase_id IN (
            SELECT purchase_id
            FROM ticket_purchases
            WHERE event_id = ?
            AND event_id IN (
                SELECT event_id
                FROM events
                WHERE organiser_id = ?
            )
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
    global.db.run(clearWalletTransactionsQuery, query_parameters, function (err) {
        if (err) {
            return callback(err);
        }

        global.db.run(deleteAttendeesQuery, query_parameters, function (err) {
            if (err) {
                return callback(err);
            }

            global.db.run(deletePurchaseItemsQuery, query_parameters, function (err) {
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

        getAttendeeCount(event.event_id, function (err, attendeeCount) {
            if (err) {
                return callback(err);
            }

            event.attendee_count = attendeeCount;
            callback(null, event);
        });
    });
}

/**
 * @desc Gets all attendees for one event
 * @input eventId from the organiser edit page
 * @output Array of attendee rows with ticket summary text added
 */
function getAttendeesForEvent(eventId, callback) {
    const query = `
        SELECT
            users.user_id,
            users.user_name,
            email_accounts.email_address,
            event_attendees.joined_at
        FROM event_attendees
        JOIN users
        ON event_attendees.user_id = users.user_id
        LEFT JOIN email_accounts
        ON users.user_id = email_accounts.user_id
        WHERE event_attendees.event_id = ?
        ORDER BY users.user_name ASC
    `;

    global.db.all(query, [eventId], function (err, attendees) {
        if (err) {
            return callback(err);
        }

        runEach(attendees, function (attendee, done) {
                getPurchasesForUserAndEvent(
                    eventId,
                    attendee.user_id,
                    function (err, purchases) {
                        if (err) {
                            return done(err);
                        }

                        attendee.ticket_summary = purchases
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

                callback(null, attendees);
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
            updated_at = datetime('now', 'localtime')
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
 * @output Inserts into event_attendees if it does not exist yet
 */
function addAttendee(eventId, userId, callback) {
    const query = `
        INSERT OR IGNORE INTO event_attendees (event_id, user_id)
        VALUES (?, ?)
    `;

    global.db.run(query, [eventId, userId], callback);
}

/**
 * @desc Creates a paid ticket purchase and transfers fake wallet money
 * @input eventId, userId, attendee name and selected tickets
 * @output The new purchase id if the wallet payment succeeds
 */
function createPaidTicketPurchase(
    eventId,
    userId,
    attendeeName,
    selectedTickets,
    callback,
) {
    global.db.run('BEGIN TRANSACTION', function (err) {
        if (err) {
            return callback(err);
        }

        getPurchasePaymentData(
            eventId,
            userId,
            selectedTickets,
            function (err, paymentData) {
                if (err) {
                    return rollbackPurchase(err, callback);
                }

                savePurchaseRows(
                    eventId,
                    userId,
                    attendeeName,
                    paymentData.selectedTickets,
                    paymentData.attendeeWallet,
                    paymentData.organiserWallet,
                    paymentData.totalPrice,
                    function (err, purchaseId) {
                        if (err) {
                            return rollbackPurchase(err, callback);
                        }

                        global.db.run('COMMIT', function (err) {
                            if (err) {
                                return rollbackPurchase(err, callback);
                            }

                            callback(null, purchaseId);
                        });
                    },
                );
            },
        );
    });
}

/**
 * @desc Rolls back the ticket purchase if any payment step fails
 * @input Error from the failed step and final callback
 * @output Rolls back the database transaction
 */
function rollbackPurchase(err, callback) {
    global.db.run('ROLLBACK', function () {
        callback(err);
    });
}

/**
 * @desc Loads the event and checks the ticket prices for a purchase
 * @input eventId, attendee userId and selected tickets from the form
 * @output Data needed to save the purchase
 */
function getPurchasePaymentData(eventId, userId, selectedTickets, callback) {
    getPublishedEventById(eventId, function (err, event) {
        if (err) {
            return callback(err);
        }

        if (!event) {
            return callback(makePaymentError('EVENT_NOT_FOUND'));
        }

        getTicketsForEvent(eventId, function (err, tickets) {
            if (err) {
                return callback(err);
            }

            const paymentDetails = checkTicketPayment(
                tickets,
                selectedTickets,
            );

            if (paymentDetails.error) {
                return callback(paymentDetails.error);
            }

            getWalletsForPurchase(
                userId,
                event.organiser_id,
                paymentDetails,
                callback,
            );
        });
    });
}

/**
 * @desc Gets both wallets and checks balance if the booking is not free
 * @input Attendee id, organiser id and calculated payment details
 * @output Payment data with attendee and organiser wallet rows
 */
function getWalletsForPurchase(
    userId,
    organiserId,
    paymentDetails,
    callback,
) {
    walletModel.createWalletIfNeeded(userId, function (err, attendeeWallet) {
        if (err) {
            return callback(err);
        }

        walletModel.createWalletIfNeeded(
            organiserId,
            function (err, organiserWallet) {
                if (err) {
                    return callback(err);
                }

                if (
                    paymentDetails.totalPrice > 0 &&
                    Number(attendeeWallet.balance) < paymentDetails.totalPrice
                ) {
                    return callback(makePaymentError('INSUFFICIENT_FUNDS'));
                }

                callback(null, {
                    attendeeWallet: attendeeWallet,
                    organiserWallet: organiserWallet,
                    selectedTickets: paymentDetails.selectedTickets,
                    totalPrice: paymentDetails.totalPrice,
                });
            },
        );
    });
}

/**
 * @desc Creates a small error with a code used by the route
 * @input Error code string
 * @output Error object
 */
function makePaymentError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

/**
 * @desc Rechecks ticket availability and works out the total price
 * @input Ticket rows from the database and selected tickets from the form
 * @output Selected ticket rows with database prices and total price
 */
function checkTicketPayment(tickets, selectedTickets) {
    let totalPrice = 0;
    const checkedTickets = [];

    for (let i = 0; i < selectedTickets.length; i++) {
        const selectedTicket = selectedTickets[i];
        const matchingTicket = tickets.find(function (ticket) {
            return String(ticket.ticket_id) === String(selectedTicket.ticket_id);
        });

        if (!matchingTicket) {
            return { error: makePaymentError('INVALID_TICKET') };
        }

        const remainingTickets =
            matchingTicket.quantity_available - matchingTicket.quantity_sold;

        if (selectedTicket.quantity > remainingTickets) {
            return { error: makePaymentError('NOT_ENOUGH_TICKETS') };
        }

        checkedTickets.push({
            ticket_id: matchingTicket.ticket_id,
            quantity: selectedTicket.quantity,
            price: Number(matchingTicket.price),
            ticket_type: matchingTicket.ticket_type,
        });

        totalPrice += Number(matchingTicket.price) * selectedTicket.quantity;
    }

    return {
        selectedTickets: checkedTickets,
        totalPrice: Number(totalPrice.toFixed(2)),
    };
}

/**
 * @desc Saves purchase rows and records the wallet side of the booking
 * @input Purchase details, wallets and total price
 * @output New purchase id after all related rows are saved
 */
function savePurchaseRows(
    eventId,
    userId,
    attendeeName,
    selectedTickets,
    attendeeWallet,
    organiserWallet,
    totalPrice,
    callback,
) {
    addAttendee(eventId, userId, function (err) {
        if (err) {
            return callback(err);
        }

        const purchaseQuery = `
            INSERT INTO ticket_purchases (event_id, user_id, attendee_name)
            VALUES (?, ?, ?)
        `;

        global.db.run(
            purchaseQuery,
            [eventId, userId, attendeeName],
            function (err) {
                if (err) {
                    return callback(err);
                }

                const purchaseId = this.lastID;

                runEach(
                    selectedTickets,
                    function (ticket, done) {
                        const itemQuery = `
                            INSERT INTO purchase_ticket_items (purchase_id, ticket_id, quantity)
                            VALUES (?, ?, ?)
                        `;

                        global.db.run(
                            itemQuery,
                            [purchaseId, ticket.ticket_id, ticket.quantity],
                            done,
                        );
                    },
                    function (err) {
                        if (err) {
                            return callback(err);
                        }

                        if (totalPrice === 0) {
                            return recordFreeTicketTransactions(
                                attendeeWallet,
                                organiserWallet,
                                purchaseId,
                                callback,
                            );
                        }

                        transferWalletMoney(
                            attendeeWallet,
                            organiserWallet,
                            totalPrice,
                            purchaseId,
                            callback,
                        );
                    },
                );
            },
        );
    });
}

/**
 * @desc Records a free booking in both wallets without changing balances
 * @input Attendee wallet, organiser wallet and purchase id
 * @output Creates two zero amount wallet transaction rows
 */
function recordFreeTicketTransactions(
    attendeeWallet,
    organiserWallet,
    purchaseId,
    callback,
) {
    walletModel.createWalletTransaction(
        attendeeWallet.wallet_id,
        'ticket_payment',
        0,
        'Free ticket booking',
        purchaseId,
        function (err) {
            if (err) {
                return callback(err);
            }

            walletModel.createWalletTransaction(
                organiserWallet.wallet_id,
                'ticket_sale',
                0,
                'Free ticket booking received',
                purchaseId,
                function (err) {
                    if (err) {
                        return callback(err);
                    }

                    callback(null, purchaseId);
                },
            );
        },
    );
}

/**
 * @desc Moves fake money from attendee wallet to organiser wallet
 * @input Attendee wallet, organiser wallet, amount and purchase id
 * @output Updates balances and creates transaction records
 */
function transferWalletMoney(
    attendeeWallet,
    organiserWallet,
    totalPrice,
    purchaseId,
    callback,
) {
    walletModel.deductMoneyFromWallet(
        attendeeWallet.wallet_id,
        totalPrice,
        function (err) {
            if (err) {
                return callback(err);
            }

            if (this.changes === 0) {
                return callback(makePaymentError('INSUFFICIENT_FUNDS'));
            }

            walletModel.addMoneyToWallet(
                organiserWallet.wallet_id,
                totalPrice,
                function (err) {
                    if (err) {
                        return callback(err);
                    }

                    walletModel.createWalletTransaction(
                        attendeeWallet.wallet_id,
                        'ticket_payment',
                        totalPrice,
                        'Ticket purchase payment',
                        purchaseId,
                        function (err) {
                            if (err) {
                                return callback(err);
                            }

                            walletModel.createWalletTransaction(
                                organiserWallet.wallet_id,
                                'ticket_sale',
                                totalPrice,
                                'Ticket sale received',
                                purchaseId,
                                function (err) {
                                    if (err) {
                                        return callback(err);
                                    }

                                    callback(null, purchaseId);
                                },
                            );
                        },
                    );
                },
            );
        },
    );
}

/**
 * @desc Gets the total tickets bought by one attendee for one event
 * @input eventId and userId
 * @output Array of ticket rows grouped by ticket type
 */
function getPurchasesForUserAndEvent(eventId, userId, callback) {
    const query = `
        SELECT
            event_tickets.ticket_type,
            SUM(purchase_ticket_items.quantity) AS quantity
        FROM ticket_purchases
        JOIN purchase_ticket_items
        ON ticket_purchases.purchase_id = purchase_ticket_items.purchase_id
        JOIN event_tickets
        ON purchase_ticket_items.ticket_id = event_tickets.ticket_id
        WHERE ticket_purchases.event_id = ?
        AND ticket_purchases.user_id = ?
        GROUP BY event_tickets.ticket_id,
             event_tickets.ticket_type
        ORDER BY event_tickets.ticket_id ASC
    `;

    global.db.all(query, [eventId, userId], callback);
}

/**
 * @desc Gets a purchase confirmation record for the logged in attendee
 * @input purchaseId, eventId and userId
 * @output One purchase with event details and all ticket items
 */
function getPurchaseConfirmation(purchaseId, eventId, userId, callback) {
    const purchaseQuery = `
        SELECT
            ticket_purchases.*,
            events.title,
            events.event_date,
            events.location,
            users.user_name AS organiser_name
        FROM ticket_purchases
        JOIN events
        ON ticket_purchases.event_id = events.event_id
        JOIN users
        ON events.organiser_id = users.user_id
        WHERE ticket_purchases.purchase_id = ?
        AND ticket_purchases.event_id = ?
        AND ticket_purchases.user_id = ?
    `;

    global.db.get(
        purchaseQuery,
        [purchaseId, eventId, userId],
        function (err, purchase) {
            if (err) {
                return callback(err);
            }

            if (!purchase) {
                return callback(null, null);
            }

            const itemsQuery = `
                SELECT
                    purchase_ticket_items.purchase_item_id,
                    purchase_ticket_items.ticket_id,
                    purchase_ticket_items.quantity,
                    event_tickets.ticket_type,
                    event_tickets.price
                FROM purchase_ticket_items
                JOIN event_tickets
                ON purchase_ticket_items.ticket_id = event_tickets.ticket_id
                WHERE purchase_ticket_items.purchase_id = ?
                ORDER BY purchase_ticket_items.purchase_item_id ASC
            `;

            global.db.all(itemsQuery, [purchaseId], function (err, tickets) {
                if (err) {
                    return callback(err);
                }

                let totalPrice = 0;

                tickets.forEach(function (ticket) {
                    totalPrice += ticket.price * ticket.quantity;
                });

                purchase.tickets = tickets;
                purchase.total_price = totalPrice;

                callback(null, purchase);
            });
        },
    );
}

module.exports = {
    getOrganiserEvents,
    getPublishedEvents,
    getAttendeeEventDetails,
    getOrganiserEventDetails,
    createEventWithTickets,
    publishEvent,
    deleteEvent,
    updateEvent,
    saveEventTickets,
    createPaidTicketPurchase,
    getPurchaseConfirmation,
};
