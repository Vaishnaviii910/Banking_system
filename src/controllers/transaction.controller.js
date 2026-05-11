const transactionModel = require("../models/transaction.model")
const ledgerModel = require("../models/ledger.model")
const accountModel = require("../models/account.model")
const emailService = require("../services/email.service")
const mongoose = require("mongoose")



async function createTransaction(req,res) {
    /**
     * 1.Validate Request
     */

    const { fromAccount, toAccount, amount, idempotencyKey} = req.body
    
    if(!fromAccount || !toAccount ||!amount ||!idempotencyKey){
        return res.status(400).json({
            message: "fromAccount , toAccount , amount and idempotencyKey are required"
        })
    }

    const fromUserAccount = await accountModel.findOne({
        _id: fromAccount,
    })
    
    const toUserAccount = await accountModel.findOne({
        _id:toAccount,
    })
    
    if(!fromUserAccount || !toUserAccount){
        return res.status(404).json({
            message:"Invalid fromAccount or toAccount"
        })
    }

    /**
     *  2. Validate idempotency Key
     */

    const isTransactionAlreadyExists = await transactionModel.findOne({
        idempotencyKey:idempotencyKey
    })

    if(isTransactionAlreadyExists){
       if(isTransactionAlreadyExists.status = "COMPLETED"){
        return res.status(200).json({
                message: "Transaction already processed",
                transaction:isTransactionAlreadyExists
                })
       }

       if(isTransactionAlreadyExists.status = "PENDING"){
        return res.status(200).json({
                message: "Transaction is still in processing",
                })
       }
       if(isTransactionAlreadyExists.status = "FAILED"){
        return res.status(500).json({
                message:"Previous processing falied. please try again later!"
                })
       }
       if(isTransactionAlreadyExists.status = "REVERSED"){
        return res.status(500).json({
                message:"Previous processing falied. please try again later!"
                })
       }

    }

    /**
     *  3. Check account status
     */
    
    if(fromUserAccount.status!="ACTIVE"|| toUserAccount.status!="ACTIVE"){
        return res.status(400).json({
            message:"Both fromAccount and toAccount should be ACTIVE to process the transaction"
        })
    }

    /**
     * 4. Derive sender balance from ledger
     */

    const balance = await fromUserAccount.getBalance()

    if(balance<amount){
        return res.status(400).json({
            message:`Indufficient balance. Current balance is ${balance}.Requested balance is ${amount}`
        })
    }

    /**
     * 5. Create transaction (PENDING)
     */

    const session = await mongoose.startSession()
    session.startTransaction()

    const transaction = new transactionModel.create({
        fromAccount,
        toAccount,
        amount,
        idempotencyKey,
        status:"PENDING"
    })

    const debitLedgerEntry = await ledgerModel.create([{
        account : fromAccount,
        amount:amount,
        transaction:transaction._id,
        type:"DEBIT"
    }],{session})


    const creditLedgerEntry = await ledgerModel.create([{
        account : toAccount,
        amount:amount,
        transaction:transaction._id,
        type:"CREDIT"
    }],{session})

    transaction.status = "COMPLETED"
    await transaction.save({session})

    await session.commitTransaction()
    session.endSession()

    /**
     * 10. send email notification
     */

    await emailService.sendTransactionEmail(req.user.email, req.user.name, amount, toAccount)

    return res.status(201).json({
        message:"Transaction completed successfully",
        transaction : transaction
    })
}

async function createInitialFundsTransaction(req,res){
    const {toAccount, amount , idempotencyKey} = req.body

    if(!toAccount || !amount || !idempotencyKey){
        return res.status(400).json({
            message:"toAccount , amount and idempotencyKey are required"
        })
    }
    const toUserAccount = await accountModel.findOne({
        _id: toAccount,
    })
    if(!toUserAccount){
        return res.status(400).json({
            message: "toAccount is invalid"
        })
    }

    const fromUserAccount = await accountModel.findOne({
        // systemUser: true,
        user: req.user._id
    })

    if(!fromUserAccount){
        return res.status(400).json({
            message: "System user account not found"
        })
    }

    const session = await mongoose.startSession()
    session.startTransaction()

    const transaction = new transactionModel({
        fromAccount : fromUserAccount._id,
        toAccount,
        amount,
        idempotencyKey,
        status:"PENDING"
    })

    
    const debitLedgerEntry = await ledgerModel.create([{
        account: fromUserAccount._id,
        amount: amount,
        transaction: transaction._id,
        type:"DEBIT"
    }],{session})

    const creditLedgerEntry= await ledgerModel.create([{
        account: toAccount,
        amount: amount,
        transaction: transaction._id,
        type:"CREDIT"
    }],{session})

    transaction.status = "COMPLETED"
    await session.commitTransaction()
    session.endSession()

    return res.status(201).json({
        message:" Initial funds transaction completed successfully",
        transaction: transaction
    })
}

module.exports = {
    createTransaction,
    createInitialFundsTransaction
    
}