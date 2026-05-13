const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. Resolve Username to UserID
app.get('/api/user/:username', async (req, res) => {
    try {
        const userRes = await axios.post('https://users.roblox.com/v1/usernames/users', {
            usernames: [req.params.username],
            excludeBannedUsers: false
        });
        if (userRes.data.data.length === 0) return res.status(404).json({ error: "User not found" });
        const user = userRes.data.data[0];

        // Fetch Avatar and Extra Info
        const infoRes = await axios.get(`https://users.roblox.com/v1/users/${user.id}`);
        const thumbRes = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${user.id}&size=420x420&format=Png&isCircular=false`);
        
        res.json({
            ...user,
            description: infoRes.data.description,
            created: infoRes.data.created,
            avatar: thumbRes.data.data[0].imageUrl
        });
    } catch (err) {
        res.status(500).json({ error: "Roblox API Error" });
    }
});

// 2. Get Real Collectibles & Market Data
app.get('/api/inventory/:userId', async (req, res) => {
    try {
        const invUrl = `https://inventory.roblox.com/v1/users/${req.params.userId}/assets/collectibles?limit=100`;
        const response = await axios.get(invUrl);
        res.json(response.data.data);
    } catch (err) {
        res.status(500).json({ error: "Inventory Fetch Failed" });
    }
});

app.listen(PORT, () => console.log(`Rolimons-Clone Node active on ${PORT}`));
