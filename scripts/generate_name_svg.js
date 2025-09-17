// scripts/generate_svg.js
const fs = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '..', 'assets', 'name.svg');

// Calcola mese in TZ Europe/Rome (1..12)
const month = Number(
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome',
    month: 'numeric'
  }).format(new Date())
);

// Mappa mese -> stagione
const season =
  month >= 3 && month <= 5 ? 'spring' :
  month >= 6 && month <= 8 ? 'summer' :
  month >= 9 && month <= 11 ? 'autumn' : 'winter';

// Tema per stagione
const themes = {
  spring: { bg: '#ecfdf5', fg: '#065f46', accent: '#22c55e', emoji: '🌸', label: 'Spring' },
  summer: { bg: '#fff7ed', fg: '#7c2d12', accent: '#f59e0b', emoji: '☀️', label: 'Summer' },
  autumn: { bg: '#fffbeb', fg: '#78350f', accent: '#d97706', emoji: '🍂', label: 'Autumn' },
  winter: { bg: '#eff6ff', fg: '#1e3a8a', accent: '#60a5fa', emoji: '❄️', label: 'Winter' },
};

const t = themes[season];

// Semplice banner SVG (400x120). Personalizza come vuoi :)
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg fill="none" viewBox="0 0 800 100" width="800" height="100" xmlns="http://www.w3.org/2000/svg">
	<foreignObject width="100%" height="100%">
		<div xmlns="http://www.w3.org/1999/xhtml">
			<style>
				@keyframes gradientText {
				  0% {
				    background-position: 0% 50%;
				  }
				  50% {
				    background-position: 100% 50%;
				  }
				  100% {
				    background-position: 0% 50%;
				  }
				}
        .snowflake {
          color: #fff;
          font-size: 1em;
          font-family: Arial;
          text-shadow: 0 0 1px #000;
        }
				h1 {
				  font-family: 'Inter',
					-apple-system,
					BlinkMacSystemFont, 
					'Segoe UI', 
					'Roboto', 
					'Oxygen', 
					'Ubuntu', 
					'Cantarell', 
					'Fira Sans', 
					'Droid Sans', 
					'Helvetica Neue', 
					sans-serif;
				  margin: 0;
				  font-size: 4em;
				  font-weight: 900;
				  letter-spacing: -.05em;
				  text-align: center;
				  background: -webkit-linear-gradient(right,#19c37d,#00bcd4);
				  background: linear-gradient(270deg,#19c37d 0,#00bcd4);
				  background-size: 200%;
				  background-clip: text;
				  -webkit-background-clip: text;
				  -webkit-text-fill-color: transparent;
				  -webkit-animation: gradientText 3s ease infinite;
				  animation: gradientText 3s ease infinite;
				}
        @-webkit-keyframes snowflakes-fall{0%{top:-10%}100%{top:100%}}@-webkit-keyframes snowflakes-shake{0%{-webkit-transform:translateX(0px);transform:translateX(0px)}50%{-webkit-transform:translateX(80px);transform:translateX(80px)}100%{-webkit-transform:translateX(0px);transform:translateX(0px)}}@keyframes snowflakes-fall{0%{top:-10%}100%{top:100%}}@keyframes snowflakes-shake{0%{transform:translateX(0px)}50%{transform:translateX(80px)}100%{transform:translateX(0px)}}.snowflake{position:fixed;top:-10%;z-index:9999;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;cursor:default;-webkit-animation-name:snowflakes-fall,snowflakes-shake;-webkit-animation-duration:10s,3s;-webkit-animation-timing-function:linear,ease-in-out;-webkit-animation-iteration-count:infinite,infinite;-webkit-animation-play-state:running,running;animation-name:snowflakes-fall,snowflakes-shake;animation-duration:10s,3s;animation-timing-function:linear,ease-in-out;animation-iteration-count:infinite,infinite;animation-play-state:running,running}.snowflake:nth-of-type(0){left:1%;-webkit-animation-delay:0s,0s;animation-delay:0s,0s}.snowflake:nth-of-type(1){left:10%;-webkit-animation-delay:1s,1s;animation-delay:1s,1s}.snowflake:nth-of-type(2){left:20%;-webkit-animation-delay:6s,.5s;animation-delay:6s,.5s}.snowflake:nth-of-type(3){left:30%;-webkit-animation-delay:4s,2s;animation-delay:4s,2s}.snowflake:nth-of-type(4){left:40%;-webkit-animation-delay:2s,2s;animation-delay:2s,2s}.snowflake:nth-of-type(5){left:50%;-webkit-animation-delay:8s,3s;animation-delay:8s,3s}.snowflake:nth-of-type(6){left:60%;-webkit-animation-delay:6s,2s;animation-delay:6s,2s}.snowflake:nth-of-type(7){left:70%;-webkit-animation-delay:2.5s,1s;animation-delay:2.5s,1s}.snowflake:nth-of-type(8){left:80%;-webkit-animation-delay:1s,0s;animation-delay:1s,0s}.snowflake:nth-of-type(9){left:90%;-webkit-animation-delay:3s,1.5s;animation-delay:3s,1.5s}
			</style>
			<h1>Giovanni Pascuzzi</h1>
      <div xmlns="http://www.w3.org/1999/xhtml" class="snowflake">${t.emoji}</div>
      <div xmlns="http://www.w3.org/1999/xhtml" class="snowflake">${t.emoji}</div>
      <div xmlns="http://www.w3.org/1999/xhtml" class="snowflake">${t.emoji}</div>
      <div xmlns="http://www.w3.org/1999/xhtml" class="snowflake">${t.emoji}</div>
      <div xmlns="http://www.w3.org/1999/xhtml" class="snowflake">${t.emoji}</div>
      <div xmlns="http://www.w3.org/1999/xhtml" class="snowflake">${t.emoji}</div>
      <div xmlns="http://www.w3.org/1999/xhtml" class="snowflake">${t.emoji}</div>
	  <div xmlns="http://www.w3.org/1999/xhtml" class="snowflake">${t.emoji}</div>

		</div>
	</foreignObject>
</svg>
`;

// Scrive solo se cambia (per ridurre commit inutili)
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
let prev = '';
try { prev = fs.readFileSync(OUT_PATH, 'utf8'); } catch {}
if (prev.trim() === svg.trim()) {
  console.log('No change in SVG. Skipping write.');
  process.exit(0);
}
fs.writeFileSync(OUT_PATH, svg, 'utf8');
console.log(`Wrote ${OUT_PATH} for season: ${season}`);
