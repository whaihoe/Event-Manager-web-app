/**
* index.js
* This is your main app entry point
*/

// Set up express, bodyparser and EJS
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const seedDatabase = require('./seed');
const session = require("express-session");
const requireLogin = require("./middleware/auth.js");
var bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs'); // set the app to use ejs for rendering
app.use(express.static(__dirname + '/public')); // set location of static files
app.use(session({
    secret: "secret",
    resave: false,
    saveUninitialized: false
}));

// Store session details so my EJS pages can access the logged in user
app.use(function(req, res, next) {

    res.locals.currentUserId = req.session.userId;
    res.locals.currentUserName = req.session.userName;
    res.locals.currentUserRole = req.session.userRole;

    next();

});

// Set up SQLite
// Items in the global namespace are accessible throught out the node application
const sqlite3 = require('sqlite3').verbose();
global.db = new sqlite3.Database('./database.db',function(err){
    if(err){
        console.error(err);
        process.exit(1); // bail out we can't connect to the DB
    } else {
        console.log("Database connected");
        global.db.run("PRAGMA foreign_keys=ON"); // tell SQLite to pay attention to foreign key constraints
        seedDatabase(); // seed default users
    }
});

// Handle requests to the home page 
app.get("/", function (req, res) {

    if (!req.session.userId) {
        res.redirect("/auth/login");
    } else if (req.session.userRole === "organiser") {
        res.redirect("/organiser/home");
    } else {
        res.redirect("/attendee/home");
    }

});

app.get("/home", requireLogin, function (req, res) {

    if (req.session.userRole === "organiser") {
        res.redirect("/organiser/home");
    } else {
        res.redirect("/attendee/home");
    }

});

app.get("/organiser/home", requireLogin, function (req, res) {

    if (req.session.userRole !== "organiser") {
        return res.redirect("/attendee/home");
    }

    // Send organiser details to the organiser dashboard
    res.render("organiser-home.ejs", {
        userName: req.session.userName
    });
});

app.get("/attendee/home", requireLogin, function (req, res) {

    if (req.session.userRole !== "participant") {
        return res.redirect("/organiser/home");
    }

    // Send attendee details to the attendee dashboard
    res.render("attendee-home.ejs", {
        userName: req.session.userName
    });
});

// Add all the route handlers in usersRoutes to the app under the path /users
const usersRoutes = require('./routes/users');
app.use('/users', usersRoutes);

const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

// Add all the route handlers in eventsRoutes to the app under the path /events
const eventsRoutes = require('./routes/events');
app.use('/events', eventsRoutes);

// Make the web application listen for HTTP requests
app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
