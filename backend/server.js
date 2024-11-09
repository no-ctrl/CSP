import express from 'express';
import sqlite3 from 'sqlite3';
import {open} from 'sqlite';
import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import {ethers} from 'ethers';
import * as bitcoin from 'bitcoinjs-lib';
import * as bip39 from 'bip39';
import * as ecc from 'tiny-secp256k1';
import {BIP32Factory} from 'bip32';
import {WebSocketServer} from 'ws';
import http from 'http';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import fs from 'fs-extra';
import cron from 'node-cron';
import winston from 'winston';
import { body, query, validationResult } from 'express-validator';
import { subDays } from 'date-fns';
import helmet from 'helmet';
import DailyRotateFile from 'winston-daily-rotate-file';
import util from 'util';
import { TronWeb } from 'tronweb';


dotenv.config();

const tronApi = process.env.TRON_API;
const tronApiKey = process.env.TRON_API_KEY;
const tronWeb = new TronWeb({
    fullHost: tronApi,
    headers: { 'TRON-PRO-API-KEY': tronApiKey },
});


const app = express();
const port = process.env.PORT || 3000;
const backupDir = path.join(process.cwd(), 'backups');
const usdtContractAddress = process.env.USDT_CONTRACT
app.set('trust proxy', 1);

const server = http.createServer(app);
app.use(cors({
    origin: [process.env.FRONTEND_URL],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
}));

const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss',
        }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            return `${timestamp} [${level}]: ${message} ${meta && Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
    ),
    transports: [
        new winston.transports.Console(),

        new DailyRotateFile({
            filename: 'logs/application-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '14d',
            zippedArchive: true
        })
    ]
});

app.use(helmet({
    contentSecurityPolicy: false,
}));
app.disable('x-powered-by')

app.use((req, res, next) => {
    logger.info(`Received request: ${req.method} ${req.url}`);
    next();
});


// Error handling middleware
app.use((err, req, res, next) => {
    logger.error(`Error: ${err.message}`, { stack: err.stack });
    res.status(err.status || 500).json({ error: err.message });
});

const bip32 = BIP32Factory(ecc);

const dbPromise = open({
    filename: path.join(process.cwd(), 'database.db'),
    driver: sqlite3.Database,
});

const wss = new WebSocketServer({noServer: true});


const prices = {
    BTC: {value: null, timestamp: null},
    ETH: {value: null, timestamp: null},
    LTC: {value: null, timestamp: null},
    BNB: {value: null, timestamp: null},
    USDT: {value: null, timestamp: null},
};

const PRICE_UPDATE_INTERVAL = process.env.PRICE_UPDATE_INTERVAL
const BACKUP_RETENTION_DAYS = process.env.BACKUP_RETENTION_DAYS
const BACKUP_INTERVAL = process.env.DB_BACKUP_INTERVAL;

// Create a rate limiter middleware
const limiter = rateLimit({
    windowMs: process.env.RATE_LIMIT_WINDOW_MS,
    max: process.env.RATE_LIMIT_MAX,
    message: 'Too many requests from this IP, please try again later.'
});

// Apply the rate limiter to all requests
app.use(limiter);


async function backupDatabase() {
    try {
        const dbFilePath = path.join(process.cwd(), 'database.db');
        const timestamp = new Date().toISOString().replace(/:/g, '-'); // Ensure valid filename
        const backupFile = path.join(backupDir, `database_backup_${timestamp}.db`);

        await fs.copy(dbFilePath, backupFile);
        logger.info(`Database backed up to ${backupFile}`);
    } catch (error) {
        logger.error('Error backing up database:', error);
    }
}


async function cleanupOldBackups() {
    const files = await fs.readdir(backupDir);
    const cutoffDate = subDays(new Date(), BACKUP_RETENTION_DAYS);

    for (const file of files) {
        if (file.startsWith('database_backup_') && file.endsWith('.db')) {
            const filePath = path.join(backupDir, file);
            const stats = await fs.stat(filePath);
            const fileDate = new Date(stats.mtime);

            if (fileDate < cutoffDate) {
                await fs.remove(filePath);
                logger.log(`Old backup removed: ${filePath}`);
            }
        }
    }
}

// Schedule hourly backups
cron.schedule(BACKUP_INTERVAL, async () => {
    logger.log('Running scheduled backup...');
    await backupDatabase();
    await cleanupOldBackups();
});



function generateUSDTWallet(tronWebInstance) {

    const account = tronWebInstance.utils.accounts.generateAccount();

    const address = account.address.base58;
    const seedPhrase = account.privateKey;  // TRON uses private keys, not mnemonic seed phrases

    return { address, seedPhrase };
}





tronWeb.setAddress(usdtContractAddress);

async function getUSDTBalance(address) {
    try {
        // Create a contract instance
        const contract = await tronWeb.contract().at(usdtContractAddress);

        // Get the balance of the specified address
        const balance = await contract.methods.balanceOf(address).call();
        // Convert balance from wei to USDT (6 decimal places)
        const balanceInUSDT = Number(balance) / 1e6;

        return balanceInUSDT;
    } catch (error) {
        logger.error('Error fetching USDT balance:', error);
        throw error;
    }
}
function generateBitcoinWallet() {
    const seedPhrase = bip39.generateMnemonic();  // Generate mnemonic phrase
    const seed = bip39.mnemonicToSeedSync(seedPhrase);  // Convert mnemonic to seed
    const root = bip32.fromSeed(seed);  // Use bip32 factory method
    const account = root.derivePath("m/84'/0'/0'/0/0");  // Derive first account for SegWit (P2WPKH)

    // Generate P2WPKH address (SegWit)
    const {address} = bitcoin.payments.p2wpkh({pubkey: account.publicKey});

    return {address, seedPhrase};
}

function generateEthereumWallet() {
    const wallet = ethers.Wallet.createRandom();
    // Generate EIP-55 checksum address
    const address = wallet.address;
    return {address, seedPhrase: wallet.mnemonic.phrase};
}

function generateLitecoinWallet() {
    const seedPhrase = bip39.generateMnemonic();  // Generate mnemonic phrase
    const seed = bip39.mnemonicToSeedSync(seedPhrase);  // Convert mnemonic to seed
    const root = bip32.fromSeed(seed);  // Use bip32 factory method
    const account = root.derivePath("m/84'/2'/0'/0/0");  // BIP84 path for Litecoin (SegWit Bech32)

    const litecoinNetwork = {
        messagePrefix: '\x19Litecoin Signed Message:\n',
        bech32: 'ltc',
        bip32: {
            public: 0x019da462,
            private: 0x019d9cfe
        },
        pubKeyHash: 0x30,  // P2PKH address prefix
        scriptHash: 0x32,  // P2SH address prefix
        wif: 0xb0          // Wallet import format prefix
    };

    // Generate Native SegWit Bech32 address for Litecoin
    const {address} = bitcoin.payments.p2wpkh({
        pubkey: account.publicKey,
        network: litecoinNetwork
    });

    return {address, seedPhrase};
}

function generateBNBWallet() {
    const wallet = ethers.Wallet.createRandom();
    const address = wallet.address;  // Same format as Ethereum
    return {address, seedPhrase: wallet.mnemonic.phrase};
}

async function getBNBBalance(address) {
    try {
        const apiKey = process.env.BNB_API_KEY;
        const baseUrl = process.env.BSC_API_URL;
        const url = `${baseUrl}?module=account&action=balance&address=${address}&tag=latest&apikey=${apiKey}`;
        // Fetch the data from the API
        const response = await axios.get(url);

        // Check if the API response is successful
        if (response.data.status === '1' && response.data.result) {
            // Convert balance from Wei (string) to BNB (number)
            const balanceInWei = BigInt(response.data.result);
            const balanceInBNB = Number(balanceInWei) / 1e18; // Convert Wei to BNB
            return balanceInBNB;
        } else {
            throw new Error(`Error fetching data: ${response.data.message}`);
        }
    } catch (error) {
        logger.error('Error in getBNBBalance:', error);
        throw error;
    }
}

async function fetchCryptoPrice(cryptoId) {
    try {

        const coinGeckoIds = {
            BTC: 'bitcoin',
            ETH: 'ethereum',
            LTC: 'litecoin',
            BNB: 'binancecoin',
            USDT: 'tether',
        };

        const coingeckoId = coinGeckoIds[cryptoId.toUpperCase()];

        if (!coingeckoId) {
            logger.warn(`Unsupported cryptocurrency ID: ${cryptoId}`);
            return null;
        }

        // Fetch price for BNB
        if (cryptoId.toUpperCase() === 'BNB') {
            logger.debug(`Fetching BNB price`);
            const response = await axios.get(process.env.BSC_API_URL, {
                params: {
                    module: 'stats',
                    action: 'bnbprice',
                    apikey: process.env.BSC_API_KEY,
                },
                headers: {
                    'User-Agent': 'APP/1.0',
                    'Accept': 'application/json',
                },
                timeout: 5000,
            });

            logger.debug(`Fetching BNB response: ${JSON.stringify(response.data)}`);

            if (response.data && response.data.status === '1' && response.data.result) {
                const price = parseFloat(response.data.result.ethusd);
                if (!isNaN(price)) {
                    logger.info(`Fetched BNB price: $${price}`);
                    return price;
                } else {
                    logger.warn(`Invalid price for BNB: ${response.data.result.ethusd}`);
                    throw new Error(`Invalid price for BNB: ${response.data.result.ethusd}`);
                }
            } else {
                logger.warn(`Unexpected response structure for BNB: ${JSON.stringify(response.data)}`);
                throw new Error(`Invalid response structure for BNB`);
            }
        }

        const params = {
            ids: coingeckoId,
            vs_currencies: 'usd',
        };

        const response = await axios.get(process.env.COINGECKO_API_URL, {
            params,
            headers: {
                'User-Agent': 'APP/1.0',
                'Accept': 'application/json',
            },
            timeout: 5000,
        });


        if (response.data && response.data[coingeckoId] && typeof response.data[coingeckoId].usd === 'number') {
            const price = parseFloat(response.data[coingeckoId].usd);
            logger.info(`Fetched price for ${cryptoId}: $${price}`);
            return price;
        } else {
            logger.warn(`Unexpected response structure for ${cryptoId}: ${JSON.stringify(response.data)}`);
            throw new Error(`Invalid response structure for ${cryptoId}`);
        }
    } catch (error) {
        if (error.response) {
            const { status, data } = error.response;
            let safeData;
            try {
                safeData = JSON.stringify(data);
            } catch (e) {
                safeData = util.inspect(data, { depth: 1 });
            }
            logger.error(`Error fetching ${cryptoId} price: Status ${status}`, { data: safeData });
        } else if (error.request) {
            const requestInfo = util.inspect(error.request, { depth: 1 });
            logger.error(`No response received when fetching ${cryptoId} price.`, { request: requestInfo });
        } else {
            logger.error(`Error setting up request for ${cryptoId} price: ${error.message}`, { stack: error.stack });
        }

        // Fallback to Coinbase for USD price rates
        if (cryptoId.toUpperCase() === 'USDT' || !['BTC', 'ETH', 'LTC'].includes(cryptoId.toUpperCase())) {
            return await fetchUSDPrice(cryptoId);
        }

        return null; // If it's not USDT and not a supported crypto, return null
    }
}

async function fetchUSDPrice(cryptoId) {
    try {

        const response = await axios.get(process.env.C0INBASE_API_URL, {
            params: { currency: 'USD' },
            headers: {
                'User-Agent': 'APP/1.0',
                'Accept': 'application/json',
            },
            timeout: 5000,
        });


        const rate = response.data.data.rates[cryptoId.toUpperCase()];
        if (rate) {
            const price = parseFloat(rate);
            logger.info(`Fetched price for ${cryptoId} from Coinbase: $${price}`);
            return price;
        } else {
            logger.warn(`Currency not found in Coinbase rates: ${cryptoId}`);
            return null;
        }
    } catch (error) {
        logger.error(`Error fetching price from Coinbase for ${cryptoId}: ${error.message}`);
        return null;
    }
}

// Utility function to delay execution
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function updateCryptoPrices() {
    logger.info('Starting to update cryptocurrency prices...');

    const delayDuration = process.env.UPDATE_PRICES_DELAY;
    const cryptoSymbols = ['BTC', 'ETH', 'LTC', 'BNB', 'USDT'];
    const pricesArray = [];

    for (const symbol of cryptoSymbols) {
        try {
            // Fetch the price
            const price = await fetchCryptoPrice(symbol);
            pricesArray.push({ symbol, price });

            // Update prices in the prices object if valid
            if (price !== null) {
                prices[symbol] = { value: price, timestamp: Date.now() };
            } else {
                logger.warn(`Price for ${symbol} is null. Skipping update.`);
            }

        } catch (error) {
            logger.error(`Error fetching price for ${symbol}:`, {
                message: error.message,
                stack: error.stack
            });
        } finally {

            await delay(delayDuration);
        }
    }

    logger.info('Cryptocurrency prices updated successfully.', prices);
}



updateCryptoPrices();
setInterval(updateCryptoPrices, PRICE_UPDATE_INTERVAL);

async function getBitcoinBalance(address) {
    try {
        const baseUrl = process.env.BITCOIN_BALANCE_API;
        const response = await axios.get(`${baseUrl}/${address}`);
        const satoshis = response.data.final_balance;
        const btcBalance = satoshis / 100000000; // Convert satoshis to Bitcoin
        return btcBalance;
    } catch (error) {
        logger.error('Error fetching Bitcoin balance:', error);
        return 0;
    }
}

async function getEthereumBalance(address) {
    try {
        const baseUrl = process.env.ETHEREUM_BALANCE_API
        const response = await axios.get(`${baseUrl}/${address}/wallet`);
        return parseFloat(response.data.balance) / 1e18; // Balance in ETH
    } catch (error) {
        logger.error('Error fetching Ethereum balance:', error);
        return 0;
    }
}

async function getLitecoinBalance(address) {
    try {
        const baseUrl = process.env.LITECOIN_BALANCE_API
        const response = await axios.get(`${baseUrl}/${address}`);
        return response.data.final_balance / 1e8; // Convert satoshis to LTC
    } catch (error) {
        logger.error('Error fetching Litecoin balance:', error);
        return 0;
    }
}

function convertToUSD(balance, crypto) {
    if (crypto == 'Ethereum') {
        crypto = 'ETH';
    }
    if (crypto == 'Bitcoin') {
        crypto = 'BTC';
    }
    if (crypto == 'Litecoin') {
        crypto = 'LTC';
    }
    if (crypto == 'BNB') {
        crypto = 'BNB';
    }
    if (crypto == 'USDT') {
        crypto = 'USDT';
    }
    const price = prices[crypto]?.value;

    if (!price) return 0;
    return balance * price;
}

function generateToken() {
    return Math.random().toString(36).substr(2, 16);
}

wss.on('connection', (ws, req) => {
    const userId = req.url.split('?')[2];

    ws.on('message', async (message) => {
        const {crypto, amount, userId} = JSON.parse(message);
        if (!crypto || !amount || !userId) {
            ws.send(JSON.stringify({ error: 'Invalid message format' }));
            return;
        }
        try {
            // Check payment status on the blockchain
            const paymentStatus = await checkPaymentOnBlockchain(crypto, amount, userId);

            if (paymentStatus.isCompleted) {
                const db = await dbPromise;

                // Retrieve the unique code from the database
                let result = await db.get('SELECT uniqueCode FROM payments WHERE userId = ? AND crypto = ?', [userId, crypto]);
                let uniqueCode = result?.uniqueCode;

                // If uniqueCode is missing or invalid, generate a new one
                if (!uniqueCode) {
                    uniqueCode = generateToken();
                    await db.run(
                        'UPDATE payments SET completed = 1, uniqueCode = ? WHERE userId = ? AND crypto = ?',
                        [uniqueCode, userId, crypto]
                    );
                }

                ws.send(JSON.stringify({
                    paymentCompleted: true,
                    uniqueCode,
                }));
            } else {
                ws.send(JSON.stringify({
                    paymentCompleted: false,
                    amountPaid: paymentStatus.amountPaid
                }));
            }
        } catch (error) {
            ws.send(JSON.stringify({ error: 'Error processing message' }));
        }
    });
});

async function checkPaymentOnBlockchain(crypto, amount, userId) {
    const db = await dbPromise;
    const userPayment = await db.get('SELECT * FROM payments WHERE userId = ? AND crypto = ?', [userId, crypto]);

    if (!userPayment) {
        throw new Error('Payment record not found');
    }

    let balance;
    logger.debug('Checking balance for cryptocurrency:', crypto);
    if (crypto.toUpperCase() === 'BITCOIN') {
        balance = await getBitcoinBalance(userPayment.address);
    } else if (crypto.toUpperCase() === 'ETHEREUM') {
        balance = await getEthereumBalance(userPayment.address);
    } else if (crypto.toUpperCase() === 'LITECOIN') {
        balance = await getLitecoinBalance(userPayment.address);
    }
    else if(crypto.toUpperCase() === 'BNB'){
        balance = await getBNBBalance(userPayment.address);
    }
    else if (crypto.toUpperCase() === 'USDT') {
        balance = await getUSDTBalance(userPayment.address);
    }
    else {
        throw new Error('Unsupported cryptocurrency');
    }

    const balanceInUSD = convertToUSD(balance, crypto);
    logger.debug("Balance in USD:", {balanceInUSD});
    const requiredAmountInUSD = userPayment.totalAmount;
    logger.debug("Required amount in USD:", {requiredAmountInUSD});
    await db.run(
        'UPDATE payments SET amountPaid = ? WHERE userId = ? AND crypto = ?',
        [balanceInUSD, userId, crypto]
    );

    return {isCompleted: balanceInUSD >= requiredAmountInUSD, amountPaid: balanceInUSD};
}

app.use(express.json());

app.get('/api/payment-details', [
    query('crypto').isIn(['Bitcoin', 'Ethereum', 'Litecoin','BNB','USDT']),
    query('userId').isString().trim(),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const {crypto, userId, total} = req.query;

    if (!crypto || !userId) {
        return res.status(400).json({error: 'Missing required parameters'});
    }

    try {
        const db = await dbPromise;
        const userPayment = await db.get('SELECT * FROM payments WHERE userId = ? AND crypto = ?', [userId, crypto]);

        if (userPayment) {
            if (userPayment.completed == false) {
                await db.run(
                    `UPDATE payments
                     SET totalAmount = ?
                     WHERE crypto = ? AND userId = ?`,
                    [total, crypto, userId]
                );
            }

            res.json({
                address: userPayment.address,
                price: convertToUSD(1, crypto),
                required: total / convertToUSD(1, crypto),
                amountPaid: userPayment.amountPaid
            });
        } else {
            let wallet;
            if (crypto.toUpperCase() === 'BITCOIN') {
                wallet = generateBitcoinWallet();
            } else if (crypto.toUpperCase() === 'ETHEREUM') {
                wallet = generateEthereumWallet();
            } else if (crypto.toUpperCase() === 'LITECOIN') {
                wallet = generateLitecoinWallet();
            } else if (crypto.toUpperCase() === 'BNB') {
                wallet = generateBNBWallet();
            }
            else if (crypto.toUpperCase() === 'USDT') {
                wallet = generateUSDTWallet(tronWeb);
            }
            else {
                return res.status(400).json({error: 'Unsupported cryptocurrency'});
            }

            const amountPaid = 0;

            await db.run(
                'INSERT INTO payments (crypto, totalAmount, amountPaid, completed, address, seedPhrase, userId) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [crypto, total, amountPaid, 0, wallet.address, wallet.seedPhrase, userId]
            );

            res.json({
                address: wallet.address,
                price: convertToUSD(1, crypto),
                required: total / convertToUSD(1, crypto),
            });
        }
    } catch (err) {
        logger.error('Error fetching wallet address', err);
        res.status(500).json({error: 'Internal Server Error'});
    }
});

app.post('/api/check-payment', [
    body('crypto').isIn(['Bitcoin', 'Ethereum', 'Litecoin','BNB','USDT']),
    body('amount').isFloat({ gt: 0 }),
    body('userId').isString().trim(),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const {crypto, amount, userId} = req.body;

    if (!crypto || !amount || !userId) {
        return res.status(400).json({error: 'Missing required parameters'});
    }

    try {

        // Check payment status
        const paymentStatus = await checkPaymentOnBlockchain(crypto, amount, userId);
        if (paymentStatus.amountPaid > 0) {
            const db = await dbPromise;

            const userData = await db.get('SELECT * FROM payments WHERE userId = ? AND crypto = ?', [userId, crypto]);

        }
        if (paymentStatus.isCompleted) {
            const db = await dbPromise;

            // Retrieve the unique code from the database
            let result = await db.get('SELECT uniqueCode FROM payments WHERE userId = ? AND crypto = ?', [userId, crypto]);
            let uniqueCode = result?.uniqueCode;

            if (!uniqueCode) {
                uniqueCode = generateToken();
                await db.run(
                    'UPDATE payments SET completed = 1, uniqueCode = ? WHERE userId = ? AND crypto = ?',
                    [uniqueCode, userId, crypto]
                );
            }

            res.status(200).json({
                paymentCompleted: true,
                uniqueCode,
                amountPaid: paymentStatus.amountPaid,
            });
        } else {
            res.status(200).json({
                paymentCompleted: false,
                amountPaid: paymentStatus.amountPaid,
            });
        }
    } catch (error) {
        logger.error('Error checking payment:', error);
        res.status(500).json({error: 'Internal Server Error'});
    }
});

async function initializeDatabase() {
    const db = await dbPromise;

    await db.exec(`
        CREATE TABLE IF NOT EXISTS payments
        (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            crypto      TEXT    NOT NULL,
            totalAmount REAL    NOT NULL,
            amountPaid  REAL    NOT NULL,
            completed   INTEGER NOT NULL,
            address     TEXT    NOT NULL,
            seedPhrase  TEXT    NOT NULL,
            userId      TEXT    NOT NULL,
            uniqueCode  TEXT,
            UNIQUE (userId, crypto)
        );
    `);
}

initializeDatabase().then(() => {
    server.listen(port, () => {
        logger.info(`Server is running on port ${port}`);
    });
}).catch(err => {
    logger.error('Failed to initialize database:', err);
});

app.get('/health', async (req, res) => {
    const db = await dbPromise;
    try {
        await db.get('SELECT 1');
        res.status(200).send('Database is healthy');
    } catch (error) {
        logger.error('Health check failed:', error);
        res.status(500).send('Database is not reachable');
    }
});


server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

backupDatabase();
