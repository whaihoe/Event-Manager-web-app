/**
 * events.js
 * These routes handle the organiser and attendee event pages.
 * I kept the route file focused on requests and rendering, while the SQL is in models/eventsModel.js.
 */

const express = require('express');
const router = express.Router();
const requireLogin = require('../middleware/auth.js');
const { requireRole } = require('../middleware/roles.js');
const eventModel = require('../models/eventsModel.js');

const FIXED_TICKET_TYPES = ['Full price ticket', 'Concession price ticket'];

/**
 * @desc Gets today's date in YYYY-MM-DD format
 * @output Date string in YYYY-MM-DD format
 */
function getTodayDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

/**
 * @desc Makes sure repeated ticket form fields are always arrays
 * @input A form value which may be empty, a string or an array
 * @output An array version of the value
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
 * @desc Makes the event ticket rows use my fixed ticket types of full price or concession
 * @input Ticket rows from the form or database
 * @output Two ticket rows for full price and concession tickets
 */
function getFixedTicketRows(tickets) {
    return FIXED_TICKET_TYPES.map(function (ticketType, index) {
        const matchingTicket = tickets.find(function (ticket) {
            return (
                ticket.ticket_type &&
                ticket.ticket_type.toLowerCase() === ticketType.toLowerCase()
            );
        });

        const ticket = matchingTicket || tickets[index] || {};

        return {
            ticket_id: ticket.ticket_id || '',
            ticket_type: ticketType,
            quantity_available:
                ticket.quantity_available != null
                    ? ticket.quantity_available
                    : '',
            price: ticket.price != null ? ticket.price : '',
            quantity_sold: ticket.quantity_sold || 0,
        };
    });
}

/**
 * @desc Gets ticket data from the submitted form
 * @input Express req object with ticket fields in req.body
 * @output Array of ticket objects from the form
 */
function getTicketFormData(req) {
    const ticketIds = makeArray(req.body.ticket_id);
    const ticketTypes = makeArray(req.body.ticket_type);
    const ticketQuantities = makeArray(req.body.ticket_quantity);
    const ticketPrices = makeArray(req.body.ticket_price);
    const tickets = [];

    for (let i = 0; i < ticketTypes.length; i++) {
        tickets.push({
            ticket_id: (ticketIds[i] || '').trim(),
            ticket_type: (ticketTypes[i] || '').trim(),
            quantity_available: (ticketQuantities[i] || '').trim(),
            price: (ticketPrices[i] || '').trim(),
        });
    }

    return tickets;
}

/**
 * @desc Validates the ticket rows for an event
 * @input Ticket rows from the form
 * @output An errors object and cleaned ticket rows
 */
function validateTickets(tickets) {
    const errors = {};
    const fixedTickets = getFixedTicketRows(tickets);

    fixedTickets.forEach(function (ticket) {
        if (!ticket.ticket_type) {
            errors.tickets = 'Please choose a valid ticket type';
        } else if (
            !Number.isInteger(Number(ticket.quantity_available)) ||
            Number(ticket.quantity_available) <= 0
        ) {
            errors.tickets = `Please enter a valid quantity for ${ticket.ticket_type}`;
        } else if (isNaN(Number(ticket.price)) || Number(ticket.price) < 0) {
            errors.tickets = `Please enter a valid price for ${ticket.ticket_type}`;
        }
    });

    return {
        errors: errors,
        tickets: fixedTickets,
    };
}

/**
 * @desc Validates the create and edit event forms
 * @input Express req object with event fields in req.body
 * @output Validation errors, form data and ticket rows
 */
function validateEventForm(req) {
    const title = (req.body.title || '').trim();
    const description = (req.body.description || '').trim();
    const eventDate = (req.body.event_date || '').trim();
    const location = (req.body.location || '').trim();
    const errors = {};
    const ticketValidation = validateTickets(getTicketFormData(req));

    const formData = {
        title: title,
        description: description,
        event_date: eventDate,
        location: location,
        tickets: ticketValidation.tickets,
    };

    if (!title) {
        errors.title = 'Please enter an event title';
    }

    if (!eventDate) {
        errors.event_date = 'Please choose an event date';
    } else if (eventDate < getTodayDate()) {
        errors.event_date = 'Event date cannot be earlier than today';
    }

    if (!location) {
        errors.location = 'Please enter a location';
    }

    if (ticketValidation.errors.tickets) {
        errors.tickets = ticketValidation.errors.tickets;
    }

    return {
        errors: errors,
        formData: formData,
        tickets: ticketValidation.tickets,
    };
}

/**
 * @desc Checks the submitted ticket quantities for an attendee purchase
 * @input Tickets from the database and req.body values
 * @output Errors, selected ticket rows and form data
 */
function validatePurchaseForm(req, tickets) {
    const errors = {};
    const selectedTickets = [];
    const attendeeName = (req.body.attendee_name || '').trim();
    const formData = {
        attendee_name: attendeeName,
    };

    if (!attendeeName) {
        errors.attendee_name = 'Please enter the attendee name';
    }

    tickets.forEach(function (ticket) {
        const fieldName = `ticket_${ticket.ticket_id}`;
        const quantity = Number(req.body[fieldName] || 0);
        const remainingTickets = ticket.quantity_available - ticket.quantity_sold;

        formData[fieldName] = req.body[fieldName] || 0;

        if (quantity < 0 || !Number.isInteger(quantity)) {
            errors.tickets = 'Please enter a valid ticket quantity';
        } else if (quantity > remainingTickets) {
            errors.tickets = `Not enough ${ticket.ticket_type} tickets available`;
        } else if (quantity > 0) {
            selectedTickets.push({
                ticket_id: ticket.ticket_id,
                quantity: quantity,
            });
        }
    });

    if (selectedTickets.length === 0 && !errors.tickets) {
        errors.tickets = 'Please select at least one ticket';
    }

    return {
        errors: errors,
        selectedTickets: selectedTickets,
        attendeeName: attendeeName,
        formData: formData,
    };
}

/**
 * @desc Shows the ticket purchase confirmation page
 * @input eventId and purchaseId from the URL, userId from session
 * @output Renders the confirmation page for that attendee's purchase
 */
router.get(
    '/:eventId/purchases/:purchaseId/confirmation',
    requireLogin,
    requireRole('attendee'),
    function (req, res, next) {
        eventModel.getPurchaseConfirmation(
            req.params.purchaseId,
            req.params.eventId,
            req.session.userId,
            function (err, purchase) {
                if (err) {
                    return next(err);
                }

                if (!purchase) {
                    return res.status(404).send('Purchase not found');
                }

                res.render('events/purchase-confirmation.ejs', {
                    purchase: purchase,
                    totalPrice: purchase.total_price,
                });
            },
        );
    },
);

/**
 * @desc Creates a blank draft event and redirects to its edit page
 * @input Logged in organiser session
 * @output Inserts an event and two default ticket rows
 */
router.post(
    '/new-draft',
    requireLogin,
    requireRole('organiser'),
    function (req, res, next) {
        const eventData = {
            title: 'Untitled event',
            description: '',
            event_date: getTodayDate(),
            location: 'To be confirmed',
        };

        const defaultTickets = getFixedTicketRows([
            {
                quantity_available: 1,
                price: 0,
            },
            {
                quantity_available: 1,
                price: 0,
            },
        ]);

        eventModel.createEventWithTickets(
            eventData,
            req.session.userId,
            defaultTickets,
            function (err, eventId) {
                if (err) {
                    return next(err);
                }

                res.redirect(`/events/${eventId}/edit`);
            },
        );
    },
);

/**
 * @desc Publishes a draft event so attendees can see it
 * @input eventId from URL and organiser id from session
 * @output Updates the event status then redirects back to edit page
 */
router.post(
    '/:eventId/publish',
    requireLogin,
    requireRole('organiser'),
    function (req, res, next) {
        eventModel.publishEvent(
            req.params.eventId,
            req.session.userId,
            function (err) {
                if (err) {
                    return next(err);
                }

                req.session.successMessage = 'Event published successfully. Attendees can now view and book it.';

                const redirectBack = req.get('Referrer') || '/organiser/home';

                res.redirect(redirectBack);
            },
        );
    },
);

/**
 * @desc Deletes an event owned by the logged in organiser
 * @input eventId from URL and organiser id from session
 * @output Removes the event and redirects to the event list
 */
router.post(
    '/:eventId/delete',
    requireLogin,
    requireRole('organiser'),
    function (req, res, next) {
        eventModel.deleteEvent(
            req.params.eventId,
            req.session.userId,
            function (err) {
                if (err) {
                    return next(err);
                }

                res.redirect('/organiser/home');
            },
        );
    },
);

/**
 * @desc Displays one published event for attendees
 * @input eventId from URL and userId from session
 * @output Renders attendee-details.ejs with event and ticket data
 */
router.get('/:eventId', requireLogin, function (req, res, next) {
    if (req.session.userRole === 'organiser') {
        return res.redirect(`/events/${req.params.eventId}/edit`);
    }

    eventModel.getAttendeeEventDetails(
        req.params.eventId,
        req.session.userId,
        function (err, pageData) {
            if (err) {
                return next(err);
            }

            if (!pageData) {
                return res.status(404).send('Event not found');
            }

            res.render('events/attendee-details.ejs', {
                event: pageData.event,
                tickets: pageData.tickets,
                errors: {},
                formData: {},
            });
        },
    );
});

/**
 * @desc Purchases selected tickets for an attendee
 * @input eventId from URL, attendee name and ticket quantities from req.body
 * @output Saves one purchase with multiple ticket items, then redirects to confirmation page
 */
router.post(
    '/:eventId/purchase',
    requireLogin,
    requireRole('attendee'),
    function (req, res, next) {
        eventModel.getAttendeeEventDetails(
            req.params.eventId,
            req.session.userId,
            function (err, pageData) {
                if (err) {
                    return next(err);
                }

                if (!pageData) {
                    return res.status(404).send('Event not found');
                }

                const validation = validatePurchaseForm(req, pageData.tickets);

                if (
                    validation.errors.tickets ||
                    validation.errors.attendee_name
                ) {
                    return res.render('events/attendee-details.ejs', {
                        event: pageData.event,
                        tickets: pageData.tickets,
                        errors: validation.errors,
                        formData: validation.formData,
                    });
                }

                eventModel.createTicketPurchase(
                    req.params.eventId,
                    req.session.userId,
                    validation.attendeeName,
                    validation.selectedTickets,
                    function (err, purchaseId) {
                        if (err) {
                            return next(err);
                        }

                        res.redirect(
                            `/events/${req.params.eventId}/purchases/${purchaseId}/confirmation`,
                        );
                    },
                );
            },
        );
    },
);

/**
 * @desc Displays the organiser edit page for one event
 * @input eventId from URL and organiser id from session
 * @output Renders edit.ejs with event, tickets and attendee data
 */
router.get(
    '/:eventId/edit',
    requireLogin,
    requireRole('organiser'),
    function (req, res, next) {
        eventModel.getOrganiserEventDetails(
            req.params.eventId,
            req.session.userId,
            function (err, pageData) {
                if (err) {
                    return next(err);
                }

                if (!pageData) {
                    return res.status(404).send('Event not found');
                }

                pageData.event.tickets = getFixedTicketRows(pageData.tickets);

                res.render('events/edit.ejs', {
                    errors: {},
                    formData: pageData.event,
                    event: pageData.event,
                    attendees: pageData.attendees,
                });
            },
        );
    },
);

/**
 * @desc Updates an event from the organiser edit page
 * @input eventId from URL, edited event details and ticket rows from req.body
 * @output Updates the event and redirects back to the edit page
 */
router.post(
    '/:eventId/edit',
    requireLogin,
    requireRole('organiser'),
    function (req, res, next) {
        eventModel.getOrganiserEventDetails(
            req.params.eventId,
            req.session.userId,
            function (err, pageData) {
                if (err) {
                    return next(err);
                }

                if (!pageData) {
                    return res.status(404).send('Event not found');
                }

                const validation = validateEventForm(req);
                const errors = validation.errors;
                const formData = validation.formData;

                validation.tickets.forEach(function (ticket) {
                    const existingTicket = pageData.tickets.find(
                        function (existingTicket) {
                            return (
                                String(existingTicket.ticket_id) ===
                                String(ticket.ticket_id)
                            );
                        },
                    );

                    if (
                        existingTicket &&
                        Number(ticket.quantity_available) <
                            Number(existingTicket.quantity_sold)
                    ) {
                        errors.tickets = `${ticket.ticket_type} quantity cannot be lower than tickets already sold`;
                    }

                    if (existingTicket) {
                        ticket.quantity_sold = existingTicket.quantity_sold;
                    }
                });

                if (Object.keys(errors).length > 0) {
                    pageData.event.tickets = getFixedTicketRows(
                        validation.tickets,
                    );

                    return res.render('events/edit.ejs', {
                        errors: errors,
                        formData: formData,
                        event: pageData.event,
                        attendees: pageData.attendees,
                    });
                }

                eventModel.updateEvent(
                    req.params.eventId,
                    req.session.userId,
                    formData,
                    function (err) {
                        if (err) {
                            return next(err);
                        }

                        eventModel.saveEventTickets(
                            req.params.eventId,
                            validation.tickets,
                            function (err) {
                                if (err) {
                                    return next(err);
                                }

                                if (req.body.publish_after_save) {
                                    return eventModel.publishEvent(
                                        req.params.eventId,
                                        req.session.userId,
                                        function (err) {
                                            if (err) {
                                                return next(err);
                                            }

                                            req.session.successMessage = 'Event saved and published successfully.';

                                            res.redirect(
                                                `/events/${req.params.eventId}/edit`,
                                            );
                                        },
                                    );
                                }

                                res.redirect(
                                    `/events/${req.params.eventId}/edit`,
                                );
                            },
                        );
                    },
                );
            },
        );
    },
);

module.exports = router;
