/**
 * walletModel.js
 * This file keeps the wallet SQL separate from the route code.
 * The wallet is fake money only, so no real card details are stored here.
 */

/**
 * @purpose Gets a wallet using the user's id
 * @input userId from the logged in session
 * @output One wallet row or undefined if it has not been created yet
 */
function getWalletByUserId(userId, callback) {
    const query = `
        SELECT *
        FROM wallets
        WHERE user_id = ?
    `;

    global.db.get(query, [userId], callback);
}

/**
 * @purpose Creates a wallet for a user if they do not already have one
 * @input userId from users table
 * @output The user's wallet row
 */
function createWalletIfNeeded(userId, callback) {
    const query = `
        INSERT OR IGNORE INTO wallets (user_id)
        VALUES (?)
    `;

    global.db.run(query, [userId], function (err) {
        if (err) {
            return callback(err);
        }

        getWalletByUserId(userId, callback);
    });
}

/**
 * @purpose Gets the current wallet balance for a user
 * @input userId from the logged in session
 * @output Number balance from the user's wallet
 */
function getWalletBalance(userId, callback) {
    createWalletIfNeeded(userId, function (err, wallet) {
        if (err) {
            return callback(err);
        }

        callback(null, Number(wallet.balance) || 0);
    });
}

/**
 * @purpose Gets recent wallet transactions for one user
 * @input userId from the logged in session
 * @output Array of wallet transaction rows
 */
function getWalletTransactions(userId, callback) {
    createWalletIfNeeded(userId, function (err, wallet) {
        if (err) {
            return callback(err);
        }

        const query = `
            SELECT *
            FROM wallet_transactions
            WHERE wallet_id = ?
            ORDER BY created_at DESC, wallet_transaction_id DESC
            LIMIT 20
        `;

        global.db.all(query, [wallet.wallet_id], callback);
    });
}

/**
 * @purpose Creates one wallet transaction record
 * @input Wallet id, type, amount, description and optional purchase id
 * @output Inserts a row into wallet_transactions
 */
function createWalletTransaction(
    walletId,
    transactionType,
    amount,
    description,
    relatedPurchaseId,
    callback,
) {
    const query = `
        INSERT INTO wallet_transactions (
            wallet_id,
            transaction_type,
            amount,
            description,
            related_purchase_id
        )
        VALUES (?, ?, ?, ?, ?)
    `;

    const queryParameters = [
        walletId,
        transactionType,
        amount,
        description,
        relatedPurchaseId || null,
    ];

    global.db.run(query, queryParameters, callback);
}

/**
 * @purpose Adds fake money to a user's wallet and records the top up
 * @input userId, amount and description
 * @output Updates the wallet balance and creates a transaction row
 */
function addTopUpAmount(userId, amount, description, callback) {
    createWalletIfNeeded(userId, function (err, wallet) {
        if (err) {
            return callback(err);
        }

        addMoneyToWallet(wallet.wallet_id, amount, function (err) {
            if (err) {
                return callback(err);
            }

            createWalletTransaction(
                wallet.wallet_id,
                'top_up',
                amount,
                description,
                null,
                callback,
            );
        });
    });
}

/**
 * @purpose Removes money from a wallet
 * @input walletId and amount to deduct
 * @output Updates the wallet balance if enough money is available
 */
function deductMoneyFromWallet(walletId, amount, callback) {
    const query = `
        UPDATE wallets
        SET balance = balance - ?,
            updated_at = datetime('now', 'localtime')
        WHERE wallet_id = ?
        AND balance >= ?
    `;

    global.db.run(query, [amount, walletId, amount], callback);
}

/**
 * @purpose Adds money to a wallet
 * @input walletId and amount to add
 * @output Updates the wallet balance
 */
function addMoneyToWallet(walletId, amount, callback) {
    const query = `
        UPDATE wallets
        SET balance = balance + ?,
            updated_at = datetime('now', 'localtime')
        WHERE wallet_id = ?
    `;

    global.db.run(query, [amount, walletId], callback);
}

module.exports = {
    createWalletIfNeeded,
    getWalletBalance,
    getWalletTransactions,
    addTopUpAmount,
    deductMoneyFromWallet,
    addMoneyToWallet,
    createWalletTransaction,
};
