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
    } else {
        res.redirect("/home");
    }

});

app.get("/home", requireLogin, function (req, res) {
    res.render("index.ejs");
});

// Add all the route handlers in usersRoutes to the app under the path /users
const usersRoutes = require('./routes/users');
app.use('/users', usersRoutes);

const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);


// Make the web application listen for HTTP requests
app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
