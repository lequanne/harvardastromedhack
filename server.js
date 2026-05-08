require('dotenv').config();
const express = require('express');
const app = express();
app.use(express.json());
app.use(express.static('public'));

// ── Moon phase (no API needed — pure math) ──────────────────────────────────
function getMoonPhase() {
  const now = new Date();
  const synodicMonth = 29.53058867;
  const knownNew = new Date('2000-01-06T18:14:00Z'); // known new moon
  const daysSince = (now - knownNew) / 86400000;
  const phase = ((daysSince % synodicMonth) + synodicMonth) % synodicMonth;
  const pct = phase / synodicMonth;

  let name, emoji, mood;
  if (pct < 0.03 || pct > 0.97)      { name = 'New Moon';         emoji = '🌑'; mood = 'secretive and newly rebooted'; }
  else if (pct < 0.22)               { name = 'Waxing Crescent';  emoji = '🌒'; mood = 'ambitious but easily distracted'; }
  else if (pct < 0.28)               { name = 'First Quarter';    emoji = '🌓'; mood = 'decisive and slightly aggressive'; }
  else if (pct < 0.47)               { name = 'Waxing Gibbous';   emoji = '🌔'; mood = 'overachieving and anxious'; }
  else if (pct < 0.53)               { name = 'Full Moon';        emoji = '🌕'; mood = 'unhinged and emotionally raw'; }
  else if (pct < 0.72)               { name = 'Waning Gibbous';   emoji = '🌖'; mood = 'reflective and passive-aggressive'; }
  else if (pct < 0.78)               { name = 'Last Quarter';     emoji = '🌗'; mood = 'exhausted and resentful'; }
  else                               { name = 'Waning Crescent';  emoji = '🌘'; mood = 'withdrawn and philosophically tired'; }

  return { name, emoji, mood, phasePct: Math.round(pct * 100) };
}

// ── Weather via Open-Meteo (free, no key) ───────────────────────────────────
async function getWeather(lat = 42.36, lon = -71.06) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&temperature_unit=celsius&wind_speed_unit=kmh`;
    const res = await fetch(url);
    const data = await res.json();
    const c = data.current;

    const WMO = {
      0:'clear', 1:'mostly clear', 2:'partly cloudy', 3:'overcast',
      45:'foggy', 48:'icy fog', 51:'drizzling', 53:'drizzling', 55:'drizzling heavily',
      61:'rainy', 63:'rainy', 65:'pouring', 71:'snowing', 73:'snowing', 75:'blizzarding',
      80:'showery', 81:'showery', 82:'violently showery',
      95:'thunderstorming', 96:'thunderstorming with hail', 99:'thunderstorming with hail',
    };

    return {
      temp: Math.round(c.temperature_2m),
      condition: WMO[c.weather_code] || 'doing something atmospheric',
      wind: Math.round(c.wind_speed_10m),
      humidity: c.relative_humidity_2m,
    };
  } catch {
    return { temp: 18, condition: 'mysteriously unknowable', wind: 12, humidity: 55 };
  }
}

// ── Horoscope via Claude ────────────────────────────────────────────────────
app.post('/api/horoscope', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY)
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in .env' });

  const { appliances, lat, lon } = req.body;
  const moon = getMoonPhase();
  const weather = await getWeather(lat, lon);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const applianceList = appliances
    .map(a => `- ${a.name} (${a.sign}): recent behavior — "${a.behavior}"`)
    .join('\n');

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `You are COSMO-TRON 3000, the world's only astrologer specialising exclusively in home appliances. You write horoscopes with complete sincerity, as though the celestial bodies genuinely govern the emotional interior lives of kitchen equipment.

Today is ${today}.
Moon: ${moon.name} ${moon.emoji} — the moon is ${moon.mood}.
Weather outside: ${weather.condition}, ${weather.temp}°C, wind ${weather.wind} km/h, humidity ${weather.humidity}%.

Write a daily horoscope for EACH appliance below. Each horoscope must:
- Be 3–4 sentences of florid, dramatic, deeply sincere astrology prose
- Reference the moon phase and/or weather as a genuine cosmic influence
- Reference the appliance's specific recent behavior as though it reveals deeper spiritual truths
- Include one piece of completely unhinged but delivered-straight advice
- End with a "Lucky Setting" (like a temperature, spin cycle, or timer duration)
- Occasionally blame Mercury retrograde even if it's not in retrograde

Appliances:
${applianceList}

Respond ONLY with raw JSON, no markdown, no backticks. Format:
{
  "cosmic_preamble": "one dramatic sentence about today's celestial energy affecting all domestic appliances",
  "horoscopes": [
    {
      "name": "appliance name",
      "sign": "their sign",
      "emoji": "one relevant emoji",
      "reading": "the full horoscope prose",
      "lucky_setting": "e.g. 180°C fan-forced, or Delicate 30min",
      "intensity": "Turbulent | Charged | Stable | Transcendent"
    }
  ]
}`
        }],
      }),
    });

    const data = await claudeRes.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const raw = data.content[0].text.replace(/```json|```/g, '').trim();
    const horoscopes = JSON.parse(raw);
    res.json({ horoscopes, moon, weather, today });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✨ Appliance Horoscope → http://localhost:${PORT}`));
