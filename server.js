const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// This allows your website to talk to this server
app.use(cors());
app.use(express.json());

// This serves your HTML file automatically
app.use(express.static('public'));

// API 1: Find a Roblox User by Name
app.get('/api/user/:username', async (req, res) => {
    try {
        const response = await axios.post('https://users.roblox.com/v1/usernames/users', {
            usernames: [req.params.username],
            excludeBannedUsers: true
        });
        if (response.data.data.length === 0) return res.status(404).json({ error: "User not found" });
        res.json(response.data.data[0]);
    } catch (err) {
        res.status(500).json({ error: "Roblox API Error" });
    }
});

// API 2: Get Real Collectibles (Limiteds)
app.get('/api/inventory/:userId', async (req, res) => {
    try {
        const url = `https://inventory.roblox.com/v1/users/${req.params.userId}/assets/collectibles?limit=100`;
        const response = await axios.get(url);
        res.json(response.data.data);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch inventory" });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
