/**
 * @purpose Checks that the logged in user has the required role
 * @input Required role and user role from the session
 * @output Allows the request or returns a 403 error
 */
function requireRole(role) {
    return checkRole.bind(null, role);
}

/**
 * @purpose Checks one request against the required role
 * @input Required role, request, response and next middleware function
 * @output Continues the request or renders a 403 error page
 */
function checkRole(role, req, res, next) {
    // This stops attendees from using organiser pages and organisers from using attendee booking pages.
    if (req.session.userRole !== role) {
        return res.status(403).render('error.ejs', {
            pageTitle: 'Access Denied',
            message: 'You do not have permission to access this page.',
        });
    }

    next();
}

module.exports = {
    requireRole,
};
