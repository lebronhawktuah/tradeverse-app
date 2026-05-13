const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let roliCache = { data: null, lastFetch: 0 };

// Helper: Fetch Rolimons Item Details (Values, Demand, Hype)
async function getRoliData() {
    const now = Date.now();
    if (roliCache.data && (now - roliCache.lastFetch < 300000)) return roliCache.data; // 5 min cache

    try {
        const res = await axios.get('https://www.rolimons.com/itemapi/itemdetails');
        roliCache.data = res.data.items; // Rolimons returns an object where keys are ItemIDs
        roliCache.lastFetch = now;
        return roliCache.data;
    } catch (e) { return roliCache.data || {}; }
}

app.get('/api/user/:username', async (req, res) => {
    try {
        const userRes = await axios.post('https://users.roblox.com/v1/usernames/users', { usernames: [req.params.username] });
        if (!userRes.data.data.length) return res.status(404).json({ error: "User not found" });
        const user = userRes.data.data[0];
        const info = await axios.get(`https://users.roblox.com/v1/users/${user.id}`);
        const thumb = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${user.id}&size=420x420&format=Png`);
        res.json({ ...user, created: info.data.created, avatar: thumb.data.data[0].imageUrl });
    } catch (err) { res.status(500).json({ error: "API Error" }); }
});

app.get('/api/inventory/:userId', async (req, res) => {
    try {
        const [invRes, roliData] = await Promise.all([
            axios.get(`https://inventory.roblox.com/v1/users/${req.params.userId}/assets/collectibles?limit=100`),
            getRoliData()
        ]);

        const items = invRes.data.data.map(item => {
            const extra = roliData[item.assetId] || [];
            // Rolimons format: [name, acronym, rap, value, default_val, demand, trend, projected, hype, rare]
            return {
                ...item,
                roliValue: extra[3] === -1 ? item.recentAveragePrice : extra[3],
                demand: extra[5], // -1: None, 0: Terrible, 1: Low, 2: Normal, 3: High, 4: Amazing
                trend: extra[6],
                isProjected: extra[7] === 1,
                isHyped: extra[8] === 1
            };
        });
        res.json(items);
    } catch (err) { res.status(500).json({ error: "Inv Error" }); }
});

app.listen(PORT, () => console.log(`Rolimons Engine Live`));
