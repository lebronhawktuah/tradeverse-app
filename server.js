const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public'));

// Real-time Data Cache (Updates every 10 mins)
let marketData = { items: {}, lastSync: 0 };

async function syncMarket() {
    try {
        const res = await axios.get('https://www.rolimons.com/itemapi/itemdetails');
        marketData.items = res.data.items; // Real Rolimons Values
        marketData.lastSync = Date.now();
    } catch (e) { console.error("Market Sync Failed"); }
}
setInterval(syncMarket, 600000); syncMarket();

// REAL ROBLOX ACCOUNT SYNC ENDPOINT
app.get('/api/sync/:username', async (req, res) => {
    try {
        // 1. Get User ID from Username
        const userSearch = await axios.post('https://users.roblox.com/v1/usernames/users', { usernames: [req.params.username] });
        if (!userSearch.data.data.length) return res.status(404).send("User not found");
        const userId = userSearch.data.data[0].id;

        // 2. Fetch Inventory, Avatar, and Profile in Parallel
        const [inv, thumb, profile] = await Promise.all([
            axios.get(`https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100`),
            axios.get(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png`),
            axios.get(`https://users.roblox.com/v1/users/${userId}`)
        ]);

        // 3. Map Rolimons Values to Roblox Items
        const richInventory = inv.data.data.map(item => {
            const extra = marketData.items[item.assetId] || [];
            return {
                ...item,
                value: extra[3] || item.recentAveragePrice, // Use Value, fallback to RAP
                demand: ["None", "Low", "Normal", "High", "Amazing"][extra[5]] || "None",
                isProjected: extra[7] === 1
            };
        });

        res.json({
            profile: { ...profile.data, avatar: thumb.data.data[0].imageUrl },
            inventory: richInventory
        });
    } catch (err) { res.status(500).json({ error: "Roblox API Timeout" }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TRADEVERSE ACTIVE: http://localhost:${PORT}`));
