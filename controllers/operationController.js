'use strict';
const sendMail = require(__dirname + '/../services/mailer');
const wallet = require(__dirname + '/../services/wallet');
const db = require( __dirname + '/../models/' );

//
//makeTransaction = async (
//  emisor, privateKey, receptor, amount, fee


module.exports.executeOperation = async ( oId, votes) => {
  const operation = await db.Operation.findOne({where:
  { id: oId}
  });
  const result = await operation.updateAttributes({
    result: 'Approved'
  });
  if (result) {
    const uw = await db.UserWallet.findOne({ where:
      {id: result.dataValues.userwallet_id}
    });
    const w = await db.Wallet.findOne({ where:
      {publickey: uw.dataValues.wallet_id}
    });
    let txRes = await wallet.makeTransaction(
      w.dataValues.publickey,
      w.dataValues.privatekey,
      operation.dataValues.target,
      operation.dataValues.amount
    );
    for (let vote of votes){
      const user = await db.User.findOne({
        include: [{
          model: db.UserWallet,
          where: {
            id: vote.dataValues.userwallet_id
          }
        }]
      });
      if (txRes) sendMail.operationApproved(user.dataValues.email,operation.dataValues.message);
      else sendMail.operationApprovedButfailed(user.dataValues.email,operation.dataValues.message);
    }
  }
};

module.exports.rejectOperation = async ( oId, votes) => {
  const operation = await db.Operation.findOne({where:
  { id: oId}
  });
  const result = await operation.updateAttributes({
    result: 'Rejected'
  });
  if (result) {
    for (let vote of votes){
      const user = await db.User.findOne({
        include: [{
          model: db.UserWallet,
          where: {
            id: vote.dataValues.userwallet_id
          }
        }]
      });
      sendMail.opearionRejected(user.dataValues.email,operation.dataValues.message);
    }
  }
};

module.exports.getOperation = async (ctx) => {
  //get de UserAuth Id
  const userId = await db.User.findOne({ where:
    { username:ctx.user.username},
  attributes: ['id']
  });

  //get all votes of this operation
  const votes = await db.UserWallet.findAll({
    include: [{
      model: db.Vote,
      where: {
        operation_id: ctx.params.operation_id
      }
    }]
  });
  let userHasRights = false;
  let numberOfUsers = votes.length;
  let numberOfVotes = 0;
  let valueOfVote = 0;
  for (let el of votes) {
    if (el.user_id === userId.id){
      userHasRights = true;
      if (el.Votes[0].value) valueOfVote = el.Votes[0].value;
    }
    else if(el.Votes[0].value) numberOfVotes++;
  }
  if (!userHasRights) ctx.body = {error: 'User has no rights over this operation '};

  //get info of this operation
  const operation = await db.Operation.findOne({where:
    {id:ctx.params.operation_id},
  attributes: ['target','amount','message','result']
  });

  //send the info to the frontend
  ctx.body = {...operation.dataValues,'numberOfVotes':numberOfVotes,'numberOfUsers':numberOfUsers,'valueOfVote':valueOfVote};
};

module.exports.createVotes = async (ctx, opId, wId, opMsg) => {
  let error = false;
  let uwIds = await db.UserWallet.findAll({where:
    {wallet_id: wId}
  });
  for ( let uw of uwIds) {
    let vote = await db.Vote.create({
      userwallet_id: uw.dataValues.id,
      operation_id: opId
    });
    let user = await db.User.findOne({where:
      {id: uw.dataValues.user_id}
    });
    sendMail.readyToVote(user.dataValues,opMsg);
    if (!vote) error = true;
  }
  return error;
};

module.exports.createOperation = async (ctx) => {
  //get userAuth Id
  let userId = await db.User.findOne({ where:
  { username:ctx.user.username},
  attributes: ['id']
  });
  //get id of UserWallet relation
  let userWalletId = await db.UserWallet.findOne({ where:
  { user_id: userId.id, wallet_id: ctx.request.body.publicKey },
  attributes: ['id']
  });
  if (!userWalletId) return ctx.body = {error: 'User has no rights over this wallet'};
  //create the operation
  let operation = await db.Operation.create({
    target: ctx.request.body.target_publicAdress,
    amount: ctx.request.body.amount,
    message: ctx.request.body.message,
    userwallet_id: userWalletId.id
  });
  if (!operation) return ctx.body = {error: 'DB error on inserting'};
  //create all votes for this operation
  let error = await this.createVotes(ctx, operation.dataValues.id, ctx.request.body.publicKey, ctx.request.body.message);
  if (!error) return ctx.body = {msg: 'Operation and votes created'};

  ctx.body = {error: 'DB error on inserting votes'};
};