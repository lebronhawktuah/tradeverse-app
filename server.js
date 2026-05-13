const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Global Cache for Rolimons Data
let roliCache = { data: null, lastUpdate: 0 };

async function getRoliData() {
    const now = Date.now();
    // Only refresh every 10 minutes to avoid getting banned by Rolimons
    if (roliCache.data && (now - roliCache.lastUpdate < 600000)) return roliCache.data;
    
    try {
        const res = await axios.get('https://www.rolimons.com/itemapi/itemdetails');
        roliCache.data = res.data.items; // This is a massive list of all Limiteds
        roliCache.lastUpdate = now;
        return roliCache.data;
    } catch (e) { return roliCache.data || {}; }
}

// 1. Get Real Player Info & Avatar
app.get('/api/user/:username', async (req, res) => {
    try {
        const userRes = await axios.post('https://users.roblox.com/v1/usernames/users', { usernames: [req.params.username] });
        if (!userRes.data.data.length) return res.status(404).json({ error: "User not found" });
        const user = userRes.data.data[0];
        
        const [info, thumb] = await Promise.all([
            axios.get(`https://users.roblox.com/v1/users/${user.id}`),
            axios.get(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${user.id}&size=420x420&format=Png`)
        ]);

        res.json({
            ...user,
            joined: info.data.created,
            avatar: thumb.data.data[0].imageUrl
        });
    } catch (err) { res.status(500).json({ error: "Roblox API Down" }); }
});

// 2. Get Inventory + Rolimons Values
app.get('/api/inventory/:userId', async (req, res) => {
    try {
        const [invRes, roliData] = await Promise.all([
            axios.get(`https://inventory.roblox.com/v1/users/${req.params.userId}/assets/collectibles?limit=100`),
            getRoliData()
        ]);

        const items = invRes.data.data.map(item => {
            const extra = roliData[item.assetId] || [];
            // Rolimons data index: [3]=Value, [5]=Demand, [7]=Projected, [8]=Hype
            return {
                ...item,
                value: extra[3] === -1 || !extra[3] ? item.recentAveragePrice : extra[3],
                demand: extra[5] || 0,
                isProjected: extra[7] === 1,
                isHyped: extra[8] === 1
            };
        });
        res.json(items);
    } catch (err) { res.status(500).json({ error: "Inventory Private or Error" }); }
});

app.listen(PORT, () => console.log(`Tradeverse Backend Live`));
