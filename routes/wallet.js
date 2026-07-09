/**
 * wallet.js
 * These routes show the fake wallet page and handle wallet top ups.
 * Card details are only checked in this request and are not saved.
 */

const express = require('express');
const router = express.Router();
const requireLogin = require('../middleware/auth.js');
const walletModel = require('../models/walletModel.js');

/**
 * @purpose Checks a card number using the Luhn algorithm
 * @input Card number from the fake payment form
 * @output true if the number passes the Luhn check
 */
function isValidLuhn(cardNumber) {
    const digits = String(cardNumber || '').replace(/\D/g, '');

    if (digits.length < 12) {
        return false;
    }

    let total = 0;
    let shouldDouble = false;

    for (let i = digits.length - 1; i >= 0; i--) {
        let digit = Number(digits[i]);

        if (shouldDouble) {
            digit = digit * 2;

            if (digit > 9) {
                digit = digit - 9;
            }
        }

        total += digit;
        shouldDouble = !shouldDouble;
    }

    return total % 10 === 0;
}

/**
 * @purpose Checks that the fake card expiry has not passed
 * @input Expiry value in YYYY-MM, MM/YY or MM/YYYY format
 * @output true if the expiry month is this month or later
 */
function isValidExpiry(expiry) {
    const expiryText = String(expiry || '').trim();
    let month;
    let year;

    if (/^\d{4}-\d{2}$/.test(expiryText)) {
        const parts = expiryText.split('-');
        year = Number(parts[0]);
        month = Number(parts[1]);
    } else if (/^\d{2}\/\d{2}$/.test(expiryText)) {
        const parts = expiryText.split('/');
        month = Number(parts[0]);
        year = 2000 + Number(parts[1]);
    } else if (/^\d{2}\/\d{4}$/.test(expiryText)) {
        const parts = expiryText.split('/');
        month = Number(parts[0]);
        year = Number(parts[1]);
    } else {
        return false;
    }

    if (month < 1 || month > 12 || !year) {
        return false;
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    return year > currentYear || (year === currentYear && month >= currentMonth);
}

/**
 * @purpose Checks that the fake CVV is three digits
 * @input CVV from the fake payment form
 * @output true if the CVV is in the expected format
 */
function isValidCvv(cvv) {
    return /^\d{3}$/.test(String(cvv || '').trim());
}

/**
 * @purpose Renders the wallet page with the latest balance and transactions
 * @input Logged in user id from the session
 * @output Renders wallet/index.ejs
 */
function renderWalletPage(req, res, errors, formData) {
    walletModel.getWalletTransactions(
        req.session.userId,
        function (err, transactions) {
            if (err) {
                return res.status(500).send('Could not load wallet transactions');
            }

            res.render('wallet/index.ejs', {
                transactions: transactions,
                errors: errors || {},
                formData: formData || {},
            });
        },
    );
}

/**
 * @purpose Shows the logged in user's wallet page
 * @input Logged in user session
 * @output Wallet balance, top up form and recent transactions
 */
router.get('/', requireLogin, function (req, res) {
    renderWalletPage(req, res);
});

/**
 * @purpose Adds fake money to the user's wallet after validating card details
 * @input Amount and fake card details from req.body
 * @output Updates the wallet then redirects back to the wallet page
 */
router.post('/top-up', requireLogin, function (req, res) {
    const amount = Number(req.body.amount);
    const cardNumber = req.body.card_number || '';
    const expiry = req.body.expiry || '';
    const cvv = req.body.cvv || '';
    const errors = {};
    const formData = {
        amount: req.body.amount || '',
        card_number: '',
        expiry: expiry,
        cvv: '',
    };

    if (isNaN(amount) || amount <= 0) {
        errors.amount = 'Please enter a positive top up amount';
    }

    if (!isValidLuhn(cardNumber)) {
        errors.card_number = 'Please enter a valid fake card number';
    }

    if (!isValidExpiry(expiry)) {
        errors.expiry = 'Please enter an expiry date that has not passed';
    }

    if (!isValidCvv(cvv)) {
        errors.cvv = 'Please enter a 3 digit CVV';
    }

    if (Object.keys(errors).length > 0) {
        res.locals.errorMessage = 'Invalid card details.';
        return renderWalletPage(req, res, errors, formData);
    }

    walletModel.addTopUpAmount(
        req.session.userId,
        Number(amount.toFixed(2)),
        'Fake card wallet top up',
        function (err) {
            if (err) {
                return res.status(500).send('Could not top up wallet');
            }

            req.session.successMessage = 'Wallet topped up successfully.';
            res.redirect('/wallet');
        },
    );
});

module.exports = router;
