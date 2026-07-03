/**
 * @desc Checks that the logged in user has the required role
 */
function requireRole(role) {

    return function(req, res, next) {

        // Stop users from accessing pages meant for another role
        if (req.session.userRole !== role) {
            return res.status(403).send("You do not have permission to access this page.");
        }

        next();

    };
}

module.exports = {
    requireRole
};
