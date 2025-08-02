require('dotenv').config();
const fs = require('fs');
const https = require('https');
const express = require('express');
const cors = require('cors');
const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction
} = require('@solana/web3.js');
const {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} = require('@solana/spl-token');

const MIN_WITHDRAW_AMOUNT = 1; // 1 token minimum

const app = express();
app.use(cors());
app.use(express.json());

const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

// Load wallet from env
const secretKey = Uint8Array.from(JSON.parse(process.env.PRIVATE_KEY));
const fromWallet = Keypair.fromSecretKey(secretKey);

// SPL token mint
const tokenMint = new PublicKey(process.env.TOKEN_MINT);

app.post('/withdraw', async (req, res) => {
  const { recipient, amount } = req.body;
  console.log("📨 Incoming Withdraw Request", req.body);

  if (!recipient || !amount) {
    return res.status(400).json({ error: "Missing recipient or amount" });
  }

  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount < MIN_WITHDRAW_AMOUNT) {
    return res.status(400).json({ error: `Minimum withdrawal is ${MIN_WITHDRAW_AMOUNT} token(s).` });
  }

  try {
    const toWallet = new PublicKey(recipient);
    const fromTokenAccount = await getAssociatedTokenAddress(tokenMint, fromWallet.publicKey);
    const toTokenAccount = await getAssociatedTokenAddress(tokenMint, toWallet);

    const instructions = [];
    const toAccountInfo = await connection.getAccountInfo(toTokenAccount);

    if (!toAccountInfo) {
      console.log("🔨 Creating recipient token account...");

      const createToAccountIx = createAssociatedTokenAccountInstruction(
        fromWallet.publicKey,
        toTokenAccount,
        toWallet,
        tokenMint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      instructions.push(createToAccountIx);
    }

    const lamports = BigInt(Math.round(numericAmount * 1_000_000_000));
    const transferIx = createTransferInstruction(
      fromTokenAccount,
      toTokenAccount,
      fromWallet.publicKey,
      lamports
    );

    instructions.push(transferIx);

    const tx = new Transaction().add(...instructions);
    const signature = await sendAndConfirmTransaction(connection, tx, [fromWallet]);

    console.log(`✅ Sent ${amount} tokens to ${recipient}. Signature: ${signature}`);
    return res.json({ success: true, signature });
  } catch (err) {
    console.error("Transfer failed", err);
    return res.status(500).json({ error: err.message });
  }
});

// ✅ HTTPS server setup
const sslOptions = {
  key: fs.readFileSync('./server.key'),
  cert: fs.readFileSync('./server.cert')
};

const PORT = 4041;

https.createServer(sslOptions, app).listen(PORT, () => {
  console.log(`🚀 HTTPS Withdraw server running at https://localhost:${PORT}`);
});
