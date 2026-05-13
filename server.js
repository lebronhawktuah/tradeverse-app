// --- NEW: ADVANCED TRADING INTELLIGENCE MODULE ---
const TradeEngine = {
    // Detects "Sharking" or "Projected" scams in a trade comparison
    analyzeTrade: (offer, request, marketItems) => {
        const getSum = (arr, type) => arr.reduce((acc, id) => acc + (marketItems[id]?.[type] || 0), 0);
        
        const sideAValue = getSum(offer, 3); // Value
        const sideARap = getSum(offer, 2);   // RAP
        const sideBValue = getSum(request, 3);
        const sideBRap = getSum(request, 2);

        return {
            winLoss: ((sideBValue - sideAValue) / sideAValue) * 100,
            fairness: Math.abs(sideAValue - sideBValue) < (sideAValue * 0.1) ? 'Fair' : 'Unfair',
            containsProjected: offer.concat(request).some(id => marketItems[id]?.[7] === 1),
            rarityScore: (sideAValue + sideBValue) / 100000 // Handcrafted rarity index
        };
    }
};

// --- NEW: ROBLOX VERIFICATION SYSTEM ---
// Integrates into your existing routing without replacing it
app.post('/api/verify/start', (req, res) => {
    const phrases = ["Tradeverse-Alpha", "Neon-Collector", "Obsidian-Trade", "Cyber-Valk"];
    const phrase = phrases[Math.floor(Math.random() * phrases.length)] + "-" + Math.floor(Math.random() * 999);
    // In a real database, you'd save this to the user's pending record
    res.json({ phrase });
});

app.post('/api/verify/confirm', async (req, res) => {
    try {
        const { username, expectedPhrase } = req.body;
        const userRes = await axios.get(`https://users.roblox.com/v1/users/usernames/${username}`);
        const userId = userRes.data.id;
        const profile = await axios.get(`https://users.roblox.com/v1/users/${userId}`);
        
        if (profile.data.description.includes(expectedPhrase)) {
            // SYNC SUCCESS: Broadcast to existing WebSocket
            const status = { type: 'USER_CONNECTED', user: username, timestamp: Date.now() };
            // (Assuming your wss is globally accessible in server.js)
            wss.clients.forEach(client => client.send(JSON.stringify(status)));
            res.json({ success: true, userId });
        } else {
            res.status(400).json({ error: "Phrase not found in Roblox bio." });
        }
    } catch (e) { res.status(500).send("Verification Error"); }
});
