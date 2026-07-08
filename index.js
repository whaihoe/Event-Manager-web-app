/**
 * index.js
 * This is the main entry point for my Express app.
 */

// Set up express, body parser, sessions and EJS
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const seedDatabase = require('./seed');
const session = require('express-session');
const requireLogin = require('./middleware/auth.js');
const eventModel = require('./models/eventsModel.js');
const walletModel = require('./models/walletModel.js');

app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));

app.use(
    session({
        secret: process.env.SESSION_SECRET || 'dev-secret-for-coursework',
        resave: false,
        saveUninitialized: false,
    }),
);

// Set up SQLite
// Items in the global namespace are accessible throughout the node application.
const sqlite3 = require('sqlite3').verbose();

global.db = new sqlite3.Database('./database.db', function (err) {
    if (err) {
        console.error(err);
        process.exit(1);
    } else {
        console.log('Database connected');
        global.db.run('PRAGMA foreign_keys=ON');
        seedDatabase();
    }
});

/**
 * @desc Gets the site name and description
 * @output One site_settings row from the database
 */
function getSiteSettings(callback) {
    const query = `
        SELECT *
        FROM site_settings
        WHERE setting_id = 1
    `;

    global.db.get(query, callback);
}

/**
 * @desc Renders a simple error page instead of plain Express error text
 * @input Response, status code, page title and message
 * @output Renders views/error.ejs
 */
function renderErrorPage(res, statusCode, pageTitle, message) {
    res.status(statusCode).render('error.ejs', {
        pageTitle: pageTitle,
        message: message,
    });
}

/**
 * @desc Makes common values available in all EJS pages
 * @input Session values and site settings from the database
 * @output res.locals values which can be used in templates
 */
app.use(function (req, res, next) {
    res.locals.currentUserId = req.session.userId;
    res.locals.currentUserName = req.session.userName;
    res.locals.currentUserRole = req.session.userRole;
    res.locals.walletBalance = null;

    res.locals.successMessage = req.session.successMessage;
    delete req.session.successMessage;

    res.locals.errorMessage = req.session.errorMessage;
    delete req.session.errorMessage;

    getSiteSettings(function (err, settings) {
        if (err || !settings) {
            settings = {
                site_name: 'Event Manager',
                site_description: 'Discover events and buy tickets online.',
            };
        }

        res.locals.settings = settings;
        req.settings = settings;

        if (!req.session.userId) {
            return next();
        }

        walletModel.getWalletBalance(req.session.userId, function (err, balance) {
            if (err) {
                console.log(err);
                res.locals.walletBalance = null;
            } else {
                res.locals.walletBalance = balance;
            }

            next();
        });
    });
});

/**
 * @desc Handles requests to the main home page
 * @output Renders main-home.ejs with the site settings
 */
app.get('/', function (req, res) {
    res.render('index.ejs', {
        settings: req.settings,
    });
});

/**
 * @desc Sends a logged in user to the correct home page for their role
 * @input Logged in user's role from the session
 * @output Redirects to organiser or attendee home page
 */
app.get('/home', requireLogin, function (req, res) {
    if (req.session.userRole === 'organiser') {
        res.redirect('/organiser/home');
    } else {
        res.redirect('/attendee/home');
    }
});

/**
 * @desc Displays the organiser home page
 * @input Organiser id from the session
 * @output Renders organiser-home.ejs with draft and published events
 */
app.get('/organiser/home', requireLogin, function (req, res) {
    if (req.session.userRole !== 'organiser') {
        return res.redirect('/attendee/home');
    }

    const sortOption = req.query.sort || "earliest";

    eventModel.getOrganiserEvents(req.session.userId, sortOption, function (err, events) {
        if (err) {
            return res.status(500).send('Could not load events');
        }   

        res.render('organiser-home.ejs', {
            userName: req.session.userName,
            settings: req.settings,
            draftEvents: events.filter(function (event) {
                return event.status === 'draft';
            }),
            publishedEvents: events.filter(function (event) {
                return event.status === 'published';
            }),
            role: 'organiser',
            sortOption: sortOption,
        });
    });
});

/**
 * @desc Displays the attendee home page
 * @input attendee id from the session
 * @output Renders attendee-home.ejs with published events
 */
app.get('/attendee/home', requireLogin, function (req, res) {
    if (req.session.userRole !== 'attendee') {
        return res.redirect('/organiser/home');
    }

    const sortOption = req.query.sort || "earliest";

    eventModel.getPublishedEvents(
        req.session.userId,
        sortOption,
        function (err, events) {
            if (err) {
                return res.status(500).send("Could not load events");
            }

            res.render("attendee-home.ejs", {
                userName: req.session.userName,
                settings: req.settings,
                publishedEvents: events,
                role: "attendee",
                sortOption: sortOption,
            });
        },
    );
});

/**
 * @desc Displays the site settings form
 * @input Current site settings from the database
 * @output Renders site-settings.ejs with the current values
 */
app.get('/organiser/settings', requireLogin, function (req, res) {
    if (req.session.userRole !== 'organiser') {
        return res.redirect('/attendee/home');
    }

    res.render('site-settings.ejs', {
        errors: {},
        formData: req.settings,
    });
});

/**
 * @desc Updates the site name and description
 * @input site_name and site_description from req.body
 * @output Updates the database then redirects to organiser home
 */
app.post('/organiser/settings', requireLogin, function (req, res) {
    if (req.session.userRole !== 'organiser') {
        return res.redirect('/attendee/home');
    }

    const siteName = (req.body.site_name || '').trim();
    const siteDescription = (req.body.site_description || '').trim();
    const errors = {};

    if (!siteName) {
        errors.site_name = 'Please enter a site name';
    }

    if (!siteDescription) {
        errors.site_description = 'Please enter a site description';
    }

    if (Object.keys(errors).length > 0) {
        return res.render('site-settings.ejs', {
            errors: errors,
            formData: {
                site_name: siteName,
                site_description: siteDescription,
            },
        });
    }

    const query = `
        UPDATE site_settings
        SET site_name = ?, site_description = ?
        WHERE setting_id = 1
    `;

    global.db.run(query, [siteName, siteDescription], function (err) {
        if (err) {
            return res.status(500).send('Could not update site settings');
        }

        res.redirect('/organiser/home');
    });
});

// Add all the route handlers in authRoutes to the app under the path /auth
const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

// Add all the route handlers in eventsRoutes to the app under the path /events
const eventsRoutes = require('./routes/events');
app.use('/events', eventsRoutes);

// Add all the route handlers in walletRoutes to the app under the path /wallet
const walletRoutes = require('./routes/wallet');
app.use('/wallet', walletRoutes);

/**
 * @desc Handles pages that do not match any route
 * @output Shows a simple 404 page
 */
app.use(function (req, res) {
    renderErrorPage(
        res,
        404,
        'Page Not Found',
        'The page you are looking for does not exist.',
    );
});

/**
 * @desc Handles unexpected server errors
 * @input Error passed from route handlers
 * @output Shows a simple error page
 */
app.use(function (err, req, res, next) {
    console.log(err);

    renderErrorPage(
        res,
        500,
        'Something Went Wrong',
        'The app could not complete this request. Please try again.',
    );
});

// Make the web application listen for HTTP requests
app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
