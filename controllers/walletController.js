const wallet = require (__dirname + '/../services/wallet');

const cryptoSer = require( __dirname + '/../services/cryptoSer');
const userWallet = require ( __dirname + '/userWalletController');
const db = require (__dirname + '/../models/');



exports.registerTxInbound = async (ctx, walletid ) => {
  //take the last inbound tx in the db
  const txR = await db.Transaction.findOne({
    where:{
      wallet_id: walletid,
      type: 'inbound'
    },
    order: [['DATE', 'DESC']]
  });
  let tx;
  if ( txR.length === 0 ) tx = await wallet.getInbTransactions(walletid);
  else tx = await wallet.getInbTransactions(walletid,txR.dataValues.transaction_str);

  const result = [];
  for(let txi of tx ) {
    const txToRecord = {
      type: 'inbound',
      amount: txi.value,
      transaction_str: txi.txid,
      date: new Date(txi.time),
      wallet_id: walletid
    };
    await db.Transaction.create(txToRecord);
    result.push(txToRecord);
  }
};

exports.getWallets = async (ctx) => {
  const userId = await db.User.findOne(
    { where: {username:ctx.user.username},
      attributes: ['id']
    });

  const wallets = await db.Wallet.findAll({
    include: [{
      model: db.UserWallet,
      where: {
        user_id: userId.dataValues.id
      }
    }]
  });
  if(!wallets) return ctx.body = {wallets:[]};
  const result = wallets.map(
    (el)=>{
      return {
        'alias': el.alias,
        'publickey': el.publickey,
        'createdAt': el.createdAt
      };
    });
  for( let auxWallet of  result ) {
    auxWallet.balance = await wallet.getWalletBalance(auxWallet.publickey);
    auxWallet.users = await userWallet.usersOfWallet( auxWallet.publickey );
  }
  ctx.jwt.modified = true;
  ctx.body = {wallets:result};
};


exports.createWallet = async (ctx) => {
  if (!ctx.request.body.alias) return ctx.body = {ERROR: 'Missing alias'};
  const newWallet = wallet.createWallet();
  const userId = await db.User.findOne(
    { where: {username:ctx.user.username},
      attributes: ['id']
    });

  const w = await db.Wallet.create({
    publickey: newWallet.address,
    privatekey: cryptoSer.encryptIv(newWallet.privateKey),
    wif: newWallet.privateKeyWIF,
    alias: ctx.request.body.alias
  });
  const uw = db.UserWallet.create({
    user_id: userId.dataValues.id,
    wallet_id: w.dataValues.publickey
  });

  if(!uw) ctx.body = {error: 'Error on creating the wallet'};
  ctx.jwt.modified = true;
  ctx.body = {result:'DONE'};
};