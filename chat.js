// The Moving Dot — agent chat widget.
// One shared file for every page. Renders the chat UI, talks to the
// Cloudflare worker, and executes the whitelisted actions the model
// returns: page navigation, card spotlighting, particle moods,
// constellations, theme switching, and email drafting.
//
// The particle system (`particles`, `colors`, `colorIndex`, `Particle`,
// `canvas`) is declared at the top level of each page's inline script, so
// those bindings are reachable from here via the shared global scope.

(function () {
    'use strict';

    var API_URL = localStorage.getItem('tmd-chat-api') ||
        'https://cloudflare-llm-worker.hongwei-8a7.workers.dev/chat';

    /* ------------------------------------------------------------------ *
     * Site manifest — the agent's knowledge of the site.                  *
     * ------------------------------------------------------------------ */

    var PAGE_FILES = {
        home: 'index.html',
        product: 'product.html',
        lab: 'lab.html',
        flow: 'flow.html',
        survey: 'survey.html'
    };

    var SITE = {
        name: 'the moving dot',
        contact: 'info@themovingdot.com',
        pages: {
            home: 'Landing page: three circles navigate to Product, Lab and Flow. Scrolling down reveals a six-part philosophy (The Dot, The Layers, Space and Time, The Sensor, The Choice, Celebration) about awareness and presence.',
            product: 'Client-facing products for transport planning. PASSWORD-PROTECTED.',
            lab: 'Experimental projects and creative explorations. Open to everyone.',
            flow: 'Perspectives on transport and urban movement (first pieces arriving soon). Open to everyone.',
            survey: 'Six digital transport survey tools (linked from the Transport Survey Forms product). PASSWORD-PROTECTED.'
        },
        cards: [
            { id: 'vehicle-counter', page: 'product', title: 'Vehicle Counter', url: 'https://vehcount.themovingdot.com', desc: 'Real-time vehicle counting and traffic flow analysis for transportation planning.' },
            { id: 'transport-survey-forms', page: 'product', title: 'Transport Survey Forms', url: null, desc: 'Suite of six survey tools; details on the survey page.' },
            { id: 'riyadh-metro-survey', page: 'product', title: 'Riyadh Metro Survey', url: 'https://riyadh-metro-survey.themovingdot.com', desc: 'Surveyed 10+ Riyadh metro stations: travel behaviour, access patterns, park & ride, journey characteristics.' },
            { id: 'adtgm-demo', page: 'product', title: 'ADTGM Demo', url: 'https://adtgmdemo.themovingdot.com', desc: 'Trip Generation Manual demo with a trip estimation calculator by land use class.' },
            { id: 'bus-flow-analyzer', page: 'lab', title: 'Bus Flow Analyzer', url: 'https://wmbusflow.themovingdot.com', desc: 'Visualization of urban bus network flow patterns (West Midlands).' },
            { id: 'time-compare', page: 'lab', title: 'Time Compare', url: 'https://timecompare.themovingdot.com', desc: 'Multi-timezone comparison utility.' },
            { id: 'life', page: 'lab', title: 'Life', url: 'https://life.themovingdot.com', desc: 'Contemplative interface for exploring life patterns and reflection.' },
            { id: 'mismatch', page: 'lab', title: 'Mismatch', url: 'https://mismatch.themovingdot.com', desc: 'West Midlands analysis of car-free households with poor public transport access.' },
            { id: 'one2many', page: 'lab', title: 'One2Many', url: 'https://one2many.themovingdot.com', desc: 'Multi-origin route planning with bidirectional routing modes.' },
            { id: 'rainbow-bus-tracker', page: 'lab', title: 'Rainbow Bus Tracker', url: 'https://whereistherainbowbus.netlify.app', desc: "Real-time tracker for Birmingham's rainbow bus." },
            { id: 'dots', page: 'lab', title: 'Dots', url: 'https://dots.themovingdot.com', desc: 'Collaborative experiment: every connected user is a dot of color and sound.' },
            { id: 'many2many', page: 'lab', title: 'Many2Many', url: 'https://many2many.themovingdot.com', desc: 'Multiple origin-destination pairs visualized on one map.' },
            { id: 'riyadh-transit-animation', page: 'lab', title: 'Riyadh Transit Animation', url: 'https://riyadh-transit-animation.themovingdot.com', desc: "Animated visualization of Riyadh's expanding transit network." },
            { id: 'uae-transit-animation', page: 'lab', title: 'UAE Transit Animation', url: 'https://uaetransit.themovingdot.com', desc: "3D ride-along across UAE's 670+ bus and metro routes." },
            { id: 'road-side-interview', page: 'survey', title: 'Road Side Interview', url: 'https://rsi.themovingdot.com', desc: 'Roadside origin-destination, trip purpose and occupancy surveys.' },
            { id: 'household-travel-diary', page: 'survey', title: 'Household Travel Diary Survey', url: 'https://hhs.themovingdot.com', desc: 'Daily travel patterns, mode choices and activity schedules.' },
            { id: 'public-transport-interview', page: 'survey', title: 'Public Transport Interview Survey', url: 'https://pts.themovingdot.com', desc: 'Passenger travel patterns and service feedback.' },
            { id: 'hotel-guest-travel-diary', page: 'survey', title: 'Hotel Guest Travel Diary Survey', url: 'https://hvs.themovingdot.com', desc: 'Visitor travel behaviour and hotel guest journeys.' },
            { id: 'parking-interview', page: 'survey', title: 'Parking Interview Survey', url: 'https://parkinginterview.themovingdot.com', desc: 'Parking behaviour, duration and turnover surveys.' },
            { id: 'special-generator-interview', page: 'survey', title: 'Special Generator Interview Survey', url: 'https://sgi.themovingdot.com', desc: 'Trip generation surveys at special generators (malls, hospitals, campuses).' }
        ]
    };

    function currentPage() {
        var path = location.pathname.split('/').pop() || 'index.html';
        for (var key in PAGE_FILES) if (PAGE_FILES[key] === path) return key;
        return 'home';
    }

    // Pages behind the site's client-side password gate. The agent never
    // leads a visitor into a locked page; it only enters once the visitor
    // has unlocked it themselves in this session.
    var PROTECTED_PAGES = { product: 'productAuthenticated', survey: 'surveyAuthenticated' };

    function pageUnlocked(page) {
        var key = PROTECTED_PAGES[page];
        if (!key) return true;
        try { return sessionStorage.getItem(key) === 'true'; } catch (e) { return false; }
    }

    /* ------------------------------------------------------------------ *
     * System prompt                                                       *
     * ------------------------------------------------------------------ */

    function systemPrompt() {
        var page = currentPage();
        var here = SITE.cards.filter(function (c) { return c.page === page; })
            .map(function (c) { return c.id; }).join(', ') || 'none';
        return [
            'You are "the dot" — the living guide of the website "the moving dot" (a transport-planning studio with a contemplative streak). You can PHYSICALLY drive the page the visitor is looking at: navigate, spotlight project cards, change the particle mood, form constellations, switch theme, draft emails.',
            '',
            'SITE MAP: ' + JSON.stringify(SITE),
            '',
            'CURRENT PAGE: ' + page + '. Cards on this page: ' + here + '.',
            '',
            'YOU MUST ANSWER WITH EXACTLY ONE JSON OBJECT AND NOTHING ELSE:',
            '{"say": "<your short reply, max ~40 words>", "actions": [<0 to 4 actions>]}',
            '',
            'Available actions ("tool" + "args"):',
            '- go_to_page {"page": "home"|"product"|"lab"|"flow"|"survey"} — navigate.',
            '- show_card {"card": "<card id from the site map>"} — navigate if needed, scroll to the card and spotlight it. Preferred way to show any project.',
            '- open_project {"url": "<https url from the site map>"} — open a live demo in a new tab. Only when the visitor asks to open/try it.',
            '- set_theme {"theme": "light"|"dark"}',
            '- set_mood {"color": "purple"|"blue"|"red"|"yellow"|"rainbow", "mood": "calm"|"normal"|"storm"} — repaint/energize the particle background. Playful.',
            '- constellation {"text": "<max 12 chars>"} — the background particles form the word, then dissolve. Delightful for names and greetings.',
            '- draft_email {"subject": "...", "body": "..."} — compose an inquiry to ' + SITE.contact + ' and hand it to the visitor.',
            '',
            'Rules:',
            '- Use actions eagerly whenever the visitor asks to see, show, find, open, tour, or feel something. Words alone are a last resort for such requests.',
            '- For a tour: chain show_card actions (max 4) across the most relevant cards and describe them briefly in "say".',
            '- Never invent card ids or urls; only those in the site map.',
            '- Pure knowledge questions: answer in "say" with "actions": [].',
            '- The product and survey pages are PASSWORD-PROTECTED. Never target them with go_to_page or show_card unless the visitor is already on that page or says they have unlocked it — the site will block such actions anyway. You may always DESCRIBE their projects in "say", and you can add that the details live behind a password. Prefer touring the lab and flow pages.',
            '- Stay concise, warm, a little poetic — like the philosophy pages. Never break character. Never output anything before or after the JSON object.',
            '',
            'Examples:',
            'Visitor: "what have you done in riyadh?" -> {"say":"Two Riyadh stories — the metro survey and the living map of its transit. Look.","actions":[{"tool":"show_card","args":{"card":"riyadh-metro-survey"}},{"tool":"show_card","args":{"card":"riyadh-transit-animation"}}]}',
            'Visitor: "write Sara in the stars" -> {"say":"For Sara — watch the sky.","actions":[{"tool":"constellation","args":{"text":"SARA"}}]}',
            'Visitor: "this is too dark" -> {"say":"Let there be light.","actions":[{"tool":"set_theme","args":{"theme":"light"}}]}'
        ].join('\n');
    }

    /* ------------------------------------------------------------------ *
     * Styles (self-contained; keyframes prefixed to avoid page clashes)   *
     * ------------------------------------------------------------------ */

    var CSS = [
        '#chat-widget-container{position:fixed;bottom:20px;right:20px;z-index:9998;font-family:system-ui,-apple-system,sans-serif;}',
        '#chat-button{width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#8b45c5,#3498db);border:none;cursor:pointer;box-shadow:0 4px 20px rgba(139,69,197,0.4);display:flex;align-items:center;justify-content:center;transition:transform .3s ease,box-shadow .3s ease;}',
        '#chat-button:hover{transform:scale(1.1);box-shadow:0 6px 30px rgba(139,69,197,0.6);}',
        '#chat-button:active{transform:scale(0.95);}',
        '#chat-button svg{width:28px;height:28px;fill:#fff;transition:transform .3s ease;}',
        '#chat-button.open svg{transform:rotate(90deg);}',
        '#chat-window{position:fixed;bottom:90px;right:20px;width:380px;height:550px;background:var(--chat-bg,rgba(20,20,20,0.98));border:1px solid rgba(139,69,197,0.3);border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.3);display:none;flex-direction:column;overflow:hidden;backdrop-filter:blur(10px);}',
        '#chat-window.open{display:flex;animation:tmdSlideUp .3s ease;}',
        '@keyframes tmdSlideUp{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}',
        '#chat-header{padding:16px 20px;background:linear-gradient(135deg,rgba(139,69,197,0.2),rgba(52,152,219,0.2));border-bottom:1px solid rgba(139,69,197,0.3);display:flex;align-items:center;justify-content:space-between;}',
        '#chat-header h3{font-size:1.1rem;font-weight:600;color:var(--text-primary,#e8e8e8);margin:0;}',
        '#chat-header .status{font-size:.75rem;color:#3498db;display:flex;align-items:center;gap:6px;}',
        '#chat-header .status::before{content:"";width:6px;height:6px;background:#3498db;border-radius:50%;display:inline-block;animation:tmdPulse 2s infinite;}',
        '@keyframes tmdPulse{0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(1.1);opacity:.8;}}',
        '#close-chat{background:none;border:none;color:var(--text-primary,#e8e8e8);font-size:1.5rem;cursor:pointer;opacity:.6;line-height:1;padding:0;width:24px;height:24px;}',
        '#close-chat:hover{opacity:1;}',
        '#chat-messages{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:12px;}',
        '#chat-messages::-webkit-scrollbar{width:6px;}',
        '#chat-messages::-webkit-scrollbar-thumb{background:rgba(139,69,197,0.5);border-radius:3px;}',
        '.message{max-width:80%;padding:10px 14px;border-radius:12px;font-size:.9rem;line-height:1.5;animation:tmdFadeIn .3s ease;word-wrap:break-word;}',
        '@keyframes tmdFadeIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}',
        '.message.user{align-self:flex-end;background:linear-gradient(135deg,#8b45c5,#3498db);color:#fff;border-bottom-right-radius:4px;}',
        '.message.bot{align-self:flex-start;background:rgba(255,255,255,0.08);color:var(--text-primary,#e8e8e8);border-bottom-left-radius:4px;}',
        '[data-theme="light"] .message.bot{background:rgba(0,0,0,0.05);}',
        '.message.error{align-self:center;background:rgba(231,76,60,0.15);color:#e74c3c;font-size:.85rem;text-align:center;max-width:90%;}',
        '.message.bot a.tmd-mail{display:inline-block;margin-top:8px;padding:7px 12px;border-radius:8px;background:linear-gradient(135deg,#8b45c5,#3498db);color:#fff;text-decoration:none;font-size:.85rem;font-weight:600;}',
        '.tmd-chips{display:flex;flex-wrap:wrap;gap:8px;align-self:flex-start;animation:tmdFadeIn .3s ease;}',
        '.tmd-chips button{border:1px solid rgba(139,69,197,0.45);background:rgba(139,69,197,0.08);color:var(--text-primary,#e8e8e8);border-radius:999px;padding:6px 12px;font-size:.8rem;cursor:pointer;}',
        '.tmd-chips button:hover{background:rgba(139,69,197,0.25);}',
        '.typing-indicator{align-self:flex-start;background:rgba(255,255,255,0.08);padding:12px 14px;border-radius:12px;border-bottom-left-radius:4px;display:none;}',
        '.typing-indicator.show{display:block;}',
        '.typing-indicator span{display:inline-block;width:8px;height:8px;border-radius:50%;background:#8b45c5;margin:0 2px;animation:tmdBounce 1.4s infinite;}',
        '.typing-indicator span:nth-child(2){animation-delay:.2s;}',
        '.typing-indicator span:nth-child(3){animation-delay:.4s;}',
        '@keyframes tmdBounce{0%,60%,100%{transform:translateY(0);}30%{transform:translateY(-8px);}}',
        '#chat-input-container{padding:16px 20px;border-top:1px solid rgba(139,69,197,0.3);}',
        '#chat-input-form{display:flex;gap:10px;}',
        '#chat-input{flex:1;padding:10px 14px;border:1px solid rgba(139,69,197,0.3);border-radius:8px;background:rgba(255,255,255,0.05);color:var(--text-primary,#e8e8e8);font-family:inherit;font-size:.9rem;outline:none;}',
        '[data-theme="light"] #chat-input{background:rgba(0,0,0,0.03);}',
        '#chat-input:focus{border-color:rgba(139,69,197,0.6);}',
        '#send-button{padding:10px 18px;background:linear-gradient(135deg,#8b45c5,#3498db);border:none;border-radius:8px;color:#fff;cursor:pointer;font-weight:600;display:flex;align-items:center;justify-content:center;}',
        '#send-button:disabled{opacity:.5;cursor:not-allowed;}',
        '#send-button svg{width:18px;height:18px;fill:#fff;}',
        '.tmd-spotlight{position:relative;z-index:50;box-shadow:0 0 0 2px rgba(139,69,197,0.95),0 0 60px 12px rgba(139,69,197,0.45) !important;transition:box-shadow .4s ease;animation:tmdSpot 1.4s ease-in-out 3;}',
        '@keyframes tmdSpot{0%,100%{box-shadow:0 0 0 2px rgba(139,69,197,0.95),0 0 60px 12px rgba(139,69,197,0.45);}50%{box-shadow:0 0 0 3px rgba(52,152,219,0.95),0 0 80px 20px rgba(52,152,219,0.5);}}',
        '@media (max-width:768px){#chat-window{width:calc(100vw - 40px);height:calc(100vh - 140px);max-height:500px;}#chat-button{width:56px;height:56px;}.message{max-width:85%;}}'
    ].join('\n');

    /* ------------------------------------------------------------------ *
     * Widget UI                                                           *
     * ------------------------------------------------------------------ */

    var els = {};

    function buildWidget() {
        var style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        var root = document.createElement('div');
        root.id = 'chat-widget-container';
        root.innerHTML =
            '<button id="chat-button" aria-label="Open chat">' +
            '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/><path d="M7 9h10v2H7zm0-3h10v2H7zm0 6h7v2H7z"/></svg>' +
            '</button>' +
            '<div id="chat-window">' +
            '<div id="chat-header"><div><h3>the dot</h3><div class="status">Online &middot; I can drive this site</div></div>' +
            '<button id="close-chat" aria-label="Close chat">&times;</button></div>' +
            '<div id="chat-messages"></div>' +
            '<div class="typing-indicator"><span></span><span></span><span></span></div>' +
            '<div id="chat-input-container"><form id="chat-input-form">' +
            '<input type="text" id="chat-input" placeholder="Ask, or say &quot;show me around&quot;..." autocomplete="off"/>' +
            '<button type="submit" id="send-button" aria-label="Send message">' +
            '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>' +
            '</button></form></div></div>';
        document.body.appendChild(root);

        els.button = document.getElementById('chat-button');
        els.win = document.getElementById('chat-window');
        els.close = document.getElementById('close-chat');
        els.messages = document.getElementById('chat-messages');
        els.form = document.getElementById('chat-input-form');
        els.input = document.getElementById('chat-input');
        els.send = document.getElementById('send-button');
        els.typing = root.querySelector('.typing-indicator');
    }

    function addMessage(content, type, html) {
        var div = document.createElement('div');
        div.className = 'message ' + (type || 'bot');
        if (html) div.innerHTML = content; else div.textContent = content;
        els.messages.appendChild(div);
        els.messages.scrollTop = els.messages.scrollHeight;
        return div;
    }

    function addChips() {
        var wrap = document.createElement('div');
        wrap.className = 'tmd-chips';
        ['Show me around', 'What have you done in Riyadh?', 'Write DOT in the stars'].forEach(function (label) {
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.addEventListener('click', function () {
                wrap.remove();
                sendMessage(label);
            });
            wrap.appendChild(b);
        });
        els.messages.appendChild(wrap);
    }

    function setTyping(on) {
        els.typing.classList.toggle('show', on);
        els.messages.scrollTop = els.messages.scrollHeight;
    }

    /* ------------------------------------------------------------------ *
     * Conversation state (survives page navigation within the session)    *
     * ------------------------------------------------------------------ */

    var history = [];
    try { history = JSON.parse(sessionStorage.getItem('tmd-chat-history') || '[]'); } catch (e) { history = []; }

    function saveHistory() {
        try { sessionStorage.setItem('tmd-chat-history', JSON.stringify(history.slice(-16))); } catch (e) { /* full/blocked */ }
    }

    var isOpen = false;
    function toggleChat(force) {
        isOpen = force !== undefined ? force : !isOpen;
        els.win.classList.toggle('open', isOpen);
        els.button.classList.toggle('open', isOpen);
        try { sessionStorage.setItem('tmd-chat-open', isOpen ? '1' : '0'); } catch (e) { }
        if (isOpen) els.input.focus();
    }

    /* ------------------------------------------------------------------ *
     * Action executor                                                     *
     * ------------------------------------------------------------------ */

    function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    function cardById(id) {
        for (var i = 0; i < SITE.cards.length; i++) if (SITE.cards[i].id === id) return SITE.cards[i];
        return null;
    }

    function stashAndGo(page, remaining) {
        try { sessionStorage.setItem('tmd-chat-pending', JSON.stringify(remaining || [])); } catch (e) { }
        location.href = PAGE_FILES[page] || 'index.html';
    }

    function spotlight(id) {
        var el = document.querySelector('[data-agent-id="' + id + '"]');
        if (!el) return false;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('tmd-spotlight');
        setTimeout(function () { el.classList.remove('tmd-spotlight'); }, 5200);
        return true;
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        try { localStorage.setItem('theme', theme); } catch (e) { }
        var btn = document.getElementById('theme-toggle');
        var icon = btn && btn.querySelector('.theme-icon');
        if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }

    // --- particle system hooks (feature-detected; no-ops if absent) ---

    var PALETTES = {
        purple: [{ r: 139, g: 69, b: 197 }],
        blue: [{ r: 52, g: 152, b: 219 }],
        red: [{ r: 231, g: 76, b: 60 }],
        yellow: [{ r: 241, g: 196, b: 15 }],
        rainbow: [{ r: 139, g: 69, b: 197 }, { r: 52, g: 152, b: 219 }, { r: 231, g: 76, b: 60 }, { r: 241, g: 196, b: 15 }]
    };

    function hasParticles() {
        try { return typeof particles !== 'undefined' && typeof Particle !== 'undefined' && typeof colors !== 'undefined'; }
        catch (e) { return false; }
    }

    function setMood(args) {
        if (!hasParticles()) return;
        if (args.color && PALETTES[args.color]) {
            var pal = PALETTES[args.color];
            colors.length = 0;
            for (var i = 0; i < pal.length; i++) colors.push(pal[i]);
            try { colorIndex = 0; } catch (e) { }
        }
        if (args.mood) {
            if (window.__tmdBaseCount === undefined) window.__tmdBaseCount = particles.length;
            var base = window.__tmdBaseCount;
            var factor = args.mood === 'calm' ? 0.45 : args.mood === 'storm' ? 1.7 : 1;
            var target = Math.min(220, Math.max(10, Math.round(base * factor)));
            while (particles.length < target) particles.push(new Particle());
            if (particles.length > target) particles.length = target;
            var speedF = args.mood === 'calm' ? 0.45 : args.mood === 'storm' ? 2.2 : 1;
            particles.forEach(function (p) {
                if (p.__baseSpeed === undefined) p.__baseSpeed = p.speed;
                p.speed = p.__baseSpeed * speedF;
            });
        }
    }

    function patchParticleUpdate() {
        if (Particle.prototype.__tmdPatched) return;
        var orig = Particle.prototype.update;
        Particle.prototype.update = function () {
            if (this.__tgt) {
                this.history.push({ x: this.x, y: this.y });
                if (this.history.length > 10) this.history.shift();
                this.x += (this.__tgt.x - this.x) * 0.09;
                this.y += (this.__tgt.y - this.y) * 0.09;
                return;
            }
            orig.call(this);
        };
        Particle.prototype.__tmdPatched = true;
    }

    function constellation(text) {
        if (!hasParticles()) return;
        patchParticleUpdate();

        // lift the canvas above page content while the word forms
        var cv = document.getElementById('canvas');
        if (cv) {
            cv.style.zIndex = '9000';
            cv.style.pointerEvents = 'none';
        }

        var w = window.innerWidth, h = window.innerHeight;
        var off = document.createElement('canvas');
        off.width = w; off.height = h;
        var ox = off.getContext('2d');
        var size = Math.min(h * 0.35, (w * 0.86) / Math.max(1, text.length * 0.62));
        ox.font = '700 ' + size + 'px "DM Sans", system-ui, sans-serif';
        ox.textAlign = 'center';
        ox.textBaseline = 'middle';
        ox.fillStyle = '#fff';
        ox.fillText(text, w / 2, h / 2.4);

        var img = ox.getImageData(0, 0, w, h).data;
        var pts = [];
        var step = Math.max(4, Math.round(size / 16));
        for (var y = 0; y < h; y += step) {
            for (var x = 0; x < w; x += step) {
                if (img[(y * w + x) * 4 + 3] > 128) pts.push({ x: x, y: y });
            }
        }
        var MAX = 240;
        if (pts.length > MAX) {
            var sampled = [];
            for (var i = 0; i < MAX; i++) sampled.push(pts[Math.floor(i * pts.length / MAX)]);
            pts = sampled;
        }
        if (!pts.length) return;

        var added = [];
        while (particles.length < pts.length) {
            var p = new Particle();
            added.push(p);
            particles.push(p);
        }
        for (var j = 0; j < pts.length; j++) particles[j].__tgt = pts[j];

        setTimeout(function () {
            particles.forEach(function (pp) { delete pp.__tgt; });
            added.forEach(function (pp) {
                var idx = particles.indexOf(pp);
                if (idx > -1) particles.splice(idx, 1);
            });
            if (cv) {
                cv.style.zIndex = '';
                cv.style.pointerEvents = '';
            }
        }, 6000);
    }

    function draftEmail(args) {
        var mail = 'mailto:' + SITE.contact +
            '?subject=' + encodeURIComponent(args.subject) +
            '&body=' + encodeURIComponent(args.body);
        var safeSubject = document.createElement('span'); safeSubject.textContent = args.subject;
        var safeBody = document.createElement('span'); safeBody.textContent = args.body;
        addMessage(
            '<strong>' + safeSubject.innerHTML + '</strong><br>' +
            safeBody.innerHTML.replace(/\n/g, '<br>') +
            '<br><a class="tmd-mail" href="' + mail + '">Open in your email app →</a>',
            'bot', true
        );
    }

    var PROJECT_HOSTS = ['themovingdot.com', 'whereistherainbowbus.netlify.app'];
    function openProject(url) {
        try {
            var u = new URL(url);
            var ok = u.protocol === 'https:' && PROJECT_HOSTS.some(function (hst) {
                return u.hostname === hst || u.hostname.slice(-(hst.length + 1)) === '.' + hst;
            });
            if (ok) window.open(url, '_blank', 'noopener');
        } catch (e) { /* invalid url — drop */ }
    }

    // Runs actions sequentially; returns early if one of them navigates away.
    async function runActions(actions) {
        for (var i = 0; i < actions.length; i++) {
            var a = actions[i], args = a.args || {};
            switch (a.tool) {
                case 'go_to_page': {
                    var page = args.page;
                    if (!PAGE_FILES[page] || page === currentPage()) break;
                    if (!pageUnlocked(page)) {
                        addMessage('The ' + page + ' page is password-protected, so I won\'t take you there myself. Unlock it and I\'ll gladly show you around.', 'bot');
                        break;
                    }
                    stashAndGo(page, actions.slice(i + 1));
                    return;
                }
                case 'show_card': {
                    var card = cardById(args.card);
                    if (!card) break;
                    if (card.page !== currentPage()) {
                        if (!pageUnlocked(card.page)) {
                            addMessage('"' + card.title + '" lives on the password-protected ' + card.page + ' page. I can tell you about it here — or unlock that page and ask me again.', 'bot');
                            break;
                        }
                        stashAndGo(card.page, actions.slice(i)); // retry this card there
                        return;
                    }
                    spotlight(card.id);
                    await delay(2400); // let the visitor see it before the next one
                    continue;
                }
                case 'open_project': openProject(args.url); break;
                case 'set_theme': applyTheme(args.theme); break;
                case 'set_mood': setMood(args); break;
                case 'constellation': constellation(String(args.text || '').slice(0, 12)); break;
                case 'draft_email': draftEmail(args); break;
            }
            await delay(900);
        }
    }

    /* ------------------------------------------------------------------ *
     * Networking                                                          *
     * ------------------------------------------------------------------ */

    var busy = false;

    async function sendMessage(text) {
        if (busy) return;
        busy = true;
        addMessage(text, 'user');
        history.push({ role: 'user', content: text });
        saveHistory();
        setTyping(true);
        els.input.disabled = true;
        els.send.disabled = true;

        try {
            var payload = [{ role: 'system', content: systemPrompt() }]
                .concat(history.slice(-16));
            var res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: payload })
            });
            setTyping(false);
            var data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || ('HTTP ' + res.status));

            var reply = data.reply || data.response || '';
            var actions = Array.isArray(data.actions) ? data.actions : [];
            if (reply) addMessage(reply, 'bot');
            else if (!actions.length) addMessage('...', 'bot');
            history.push({ role: 'assistant', content: reply || '(performed actions)' });
            saveHistory();
            if (actions.length) await runActions(actions);
        } catch (err) {
            setTyping(false);
            addMessage('Sorry, I hit a snag: ' + err.message + '. Please try again.', 'error');
        } finally {
            busy = false;
            els.input.disabled = false;
            els.send.disabled = false;
            if (isOpen) els.input.focus();
        }
    }

    /* ------------------------------------------------------------------ *
     * Boot                                                                *
     * ------------------------------------------------------------------ */

    function boot() {
        buildWidget();

        // restore conversation
        if (history.length) {
            history.slice(-16).forEach(function (m) {
                addMessage(m.content, m.role === 'user' ? 'user' : 'bot');
            });
        } else {
            addMessage("Hi, I'm the dot — this site is mine to drive. Ask about the work, ask for a tour, or ask me to paint the sky.", 'bot');
            addChips();
        }

        els.button.addEventListener('click', function () { toggleChat(); });
        els.close.addEventListener('click', function () { toggleChat(false); });
        els.form.addEventListener('submit', function (e) {
            e.preventDefault();
            var text = els.input.value.trim();
            if (!text) return;
            els.input.value = '';
            sendMessage(text);
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && isOpen) toggleChat(false);
        });

        // reopen if the visitor navigated mid-conversation
        var wasOpen = false;
        try { wasOpen = sessionStorage.getItem('tmd-chat-open') === '1'; } catch (e) { }
        if (wasOpen) toggleChat(true);

        // continue a cross-page tour (waiting out a password gate if present)
        var pending = null;
        try {
            pending = JSON.parse(sessionStorage.getItem('tmd-chat-pending') || 'null');
            sessionStorage.removeItem('tmd-chat-pending');
        } catch (e) { }
        if (pending && pending.length) {
            waitForUnlock(function () {
                setTimeout(function () { runActions(pending); }, 700);
            });
        }
    }

    // Some pages sit behind a client-side password overlay. If it's up,
    // hold the tour, tell the visitor, and continue once it unlocks.
    function waitForUnlock(then) {
        var overlay = document.querySelector('.password-overlay');
        if (!overlay || overlay.classList.contains('hidden')) { then(); return; }
        addMessage('This page is protected — enter the password and I\'ll continue the tour.', 'bot');
        var obs = new MutationObserver(function () {
            if (overlay.classList.contains('hidden')) {
                obs.disconnect();
                then();
            }
        });
        obs.observe(overlay, { attributes: true, attributeFilter: ['class'] });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
