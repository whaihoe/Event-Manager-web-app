/**
 * @desc Checks that the logged in user has the required role
 * @input Required role and user role from the session
 * @output Allows the request or returns a 403 error
 */
function requireRole(role) {
    return function (req, res, next) {
        // This stops attendees from using organiser pages and organisers from using attendee booking pages.
        if (req.session.userRole !== role) {
            return res.status(403).render('error.ejs', {
                pageTitle: 'Access Denied',
                message: 'You do not have permission to access this page.',
            });
        }

        next();
    };
}

module.exports = {
    requireRole,
};
