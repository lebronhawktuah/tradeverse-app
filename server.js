const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const http = require('http');
const NodeCache = require('node-cache');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

const cache = new NodeCache({
    stdTTL: 120
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

const connectedUsers = new Map();

const MARKET = {
    live: [],
    projected: [],
    updates: []
};

function broadcast(data) {
    wss.clients.forEach(client => {
        if(client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

wss.on('connection', ws => {
    console.log('Socket Connected');

    ws.send(JSON.stringify({
        type: 'CONNECTED',
        message: 'Connected to TRADEVERSE realtime network.'
    }));
});

async function getUser(username) {

    const cached = cache.get(`user_${username}`);
    if(cached) return cached;

    const lookup = await axios.post(
        'https://users.roblox.com/v1/usernames/users',
        {
            usernames: [username],
            excludeBannedUsers: false
        }
    );

    if(!lookup.data.data[0]) {
        throw new Error('User not found');
    }

    const user = lookup.data.data[0];

    const profile = await axios.get(
        `https://users.roblox.com/v1/users/${user.id}`
    );

    const thumb = await axios.get(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=420x420&format=Png&isCircular=false`
    );

    const finalUser = {
        id: user.id,
        username: user.name,
        displayName: user.displayName,
        avatar: thumb.data.data[0].imageUrl,
        created: profile.data.created,
        banned: profile.data.isBanned
    };

    cache.set(`user_${username}`, finalUser);

    return finalUser;
}

function estimateValue(rap) {

    if(!rap) return 0;

    const multiplier =
        rap > 100000 ? 1.22 :
        rap > 50000 ? 1.15 :
        rap > 10000 ? 1.09 :
        1.04;

    return Math.floor(rap * multiplier);
}

function calculateDemand(item) {

    let score = 3;

    if(item.recentAveragePrice > 100000)
        score++;

    if(item.recentAveragePrice > 500000)
        score++;

    if(item.owned < 1000)
        score++;

    return Math.min(5, score);
}

function detectProjected(item) {

    if(!item.value || !item.recentAveragePrice)
        return false;

    if(item.recentAveragePrice > item.value * 1.8)
        return true;

    if(item.recentAveragePrice > 5000000 && item.owned > 10000)
        return true;

    return false;
}

function rarity(item) {

    if(!item.owned) return 50;

    return Math.max(
        1,
        100 - Math.floor(item.owned / 100)
    );
}

function trend(item) {

    if(item.value > item.recentAveragePrice)
        return 'Rising';

    if(item.value < item.recentAveragePrice)
        return 'Falling';

    return 'Stable';
}

function hype(item) {

    return item.value > item.recentAveragePrice * 1.15;
}

async function fetchInventory(userId) {

    const cached = cache.get(`inv_${userId}`);
    if(cached) return cached;

    const inventory = await axios.get(
        `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?assetType=null&sortOrder=Asc&limit=100`
    );

    const items = [];

    for(const item of inventory.data.data) {

        try {

            const details = await axios.get(
                `https://economy.roblox.com/v2/assets/${item.assetId}/details`
            );

            const data = details.data;

            const value = estimateValue(data.recentAveragePrice);

            const built = {
                assetId: item.assetId,
                userAssetId: item.userAssetId,
                name: item.name,
                recentAveragePrice: data.recentAveragePrice || 0,
                value,
                demand: calculateDemand(data),
                rarity: rarity(data),
                trend: trend({
                    value,
                    recentAveragePrice: data.recentAveragePrice
                }),
                isProjected: detectProjected({
                    value,
                    recentAveragePrice: data.recentAveragePrice,
                    owned: data.unitsAvailableForConsumption || 0
                }),
                isHyped: hype({
                    value,
                    recentAveragePrice: data.recentAveragePrice
                }),
                thumbnail:
                    `https://www.roblox.com/asset-thumbnail/image?assetId=${item.assetId}&width=420&height=420&format=png`
            };

            items.push(built);

        } catch(err) {
            console.log('Item Error:', item.assetId);
        }
    }

    cache.set(`inv_${userId}`, items);

    return items;
}

/*
==================================================
SYNC ENDPOINT
==================================================
*/

app.get('/api/sync/:username', async (req, res) => {

    try {

        const username = req.params.username;

        const profile = await getUser(username);

        const inventory = await fetchInventory(profile.id);

        connectedUsers.set(profile.id, {
            username,
            lastSeen: Date.now()
        });

        broadcast({
            type: 'USER_SYNCED',
            username,
            inventoryCount: inventory.length
        });

        res.json({
            success: true,
            profile,
            inventory
        });

    } catch(err) {

        console.log(err.message);

        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

/*
==================================================
VERIFY SYSTEM
==================================================
*/

app.post('/api/verify/start', (req, res) => {

    const phrases = [
        'Tradeverse-Alpha',
        'Neon-Collector',
        'Obsidian-Trade',
        'Cyber-Valk'
    ];

    const phrase =
        phrases[
            Math.floor(Math.random() * phrases.length)
        ] +
        '-' +
        Math.floor(Math.random() * 9999);

    res.json({
        phrase
    });
});

app.post('/api/verify/confirm', async (req, res) => {

    try {

        const {
            username,
            expectedPhrase
        } = req.body;

        const user = await getUser(username);

        const profile = await axios.get(
            `https://users.roblox.com/v1/users/${user.id}`
        );

        const desc =
            profile.data.description || '';

        if(desc.includes(expectedPhrase)) {

            broadcast({
                type: 'USER_CONNECTED',
                username,
                userId: user.id
            });

            return res.json({
                success: true,
                userId: user.id
            });
        }

        res.status(400).json({
            success: false,
            error: 'Phrase not found in bio.'
        });

    } catch(err) {

        res.status(500).json({
            success: false,
            error: 'Verification failed'
        });
    }
});

/*
==================================================
TRADE ANALYSIS
==================================================
*/

app.post('/api/trade/analyze', async (req, res) => {

    try {

        const {
            yourItems,
            theirItems
        } = req.body;

        const sum = arr =>
            arr.reduce((a,b)=>a+b.value,0);

        const yourValue = sum(yourItems);
        const theirValue = sum(theirItems);

        const diff = theirValue - yourValue;

        let result = 'Fair';

        if(diff > yourValue * 0.1)
            result = 'Win';

        if(diff < -yourValue * 0.1)
            result = 'Loss';

        res.json({
            result,
            difference: diff,
            yourValue,
            theirValue
        });

    } catch(err) {

        res.status(500).json({
            error: 'Trade analyzer failed'
        });
    }
});

/*
==================================================
MARKET FEED
==================================================
*/

app.get('/api/market/live', (req, res) => {

    res.json(MARKET);
});

/*
==================================================
LIVE MARKET LOOP
==================================================
*/

setInterval(() => {

    const update = {
        type: 'MARKET_UPDATE',
        timestamp: Date.now(),
        spike: Math.floor(Math.random() * 100),
        message: 'Market activity updated'
    };

    MARKET.updates.unshift(update);

    if(MARKET.updates.length > 100) {
        MARKET.updates.pop();
    }

    broadcast(update);

}, 30000);

/*
==================================================
ROOT
==================================================
*/

app.get('*', (req, res) => {

    res.sendFile(
        path.join(__dirname, 'public', 'index.html')
    );
});

server.listen(PORT, () => {

    console.log(
        `TRADEVERSE ONLINE ${PORT}`
    );
});
