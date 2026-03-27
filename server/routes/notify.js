const express = require('express');
const router = express.Router();

router.post('/whatsapp', async (req, res) => {
  try {
    const { phone, apikey, text } = req.body;
    if (!phone || !apikey || !text) {
      return res.status(400).json({ error: 'phone, apikey and text are required' });
    }
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
    const response = await fetch(url);
    const result = await response.text();
    res.json({ ok: response.ok, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
