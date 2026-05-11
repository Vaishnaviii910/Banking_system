const express = require("express")
const authMiddleware = require("../middleware/auth.middleware")
const accountController = require("../controllers/account.controller")

const router = express.Router()

/**
 * - POST/api/accounts/
 *  -create a new account
 * =Protected Route
 */

router.post("/", authMiddleware.authMiddleware, accountController.createAccountController)


/**
 * -GET/api/accounts/
 * - Get all accounts of the logged-in user
 * -Protected api
 */

router.get("/", authMiddleware.authMiddleware, accountController.getUserAccountsController)


module.exports = router