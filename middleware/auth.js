/**
 * @desc Checks if the user is logged in before allowing access to a route
 * @input Session userId
 * @output Continues to the route or redirects to login
 */
function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.redirect('/auth/login');
    }

    next();
}

module.exports = requireLogin;
