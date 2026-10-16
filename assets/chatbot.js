// The Moving Dot — floating AI chatbot.
// Copyright (c) 2022-2026 The Moving Dot Ltd. All rights reserved.
//
// A plain-JavaScript port of our AIChatbot.tsx template: floating launcher
// with a sparkle badge, header with minimise / maximise / close, welcome
// message, proactive help when the visitor goes idle, timestamps, a loading
// state, a "Try:" hint, and toasts when the bot acts on the page.
// Additions for the homepage: it minimises itself when the visitor goes back
// to the page, and the AI key stays server-side in our Cloudflare worker
// (the template read a key in the browser).
//
// The worker's reply is {reply, actions}; actions drive the page through
// window.TMD. When the worker is unreachable, a small local guide answers.

(function () {
    'use strict';

    var CONFIG = {
        apiUrl: 'https://cloudflare-llm-worker.hongwei-8a7.workers.dev/chat',
        title: 'the dot',
        subtitle: 'AI assistant',
        welcome: "Hi, I'm the dot. Ask me about AI traffic counting, transport modelling, our tools, or starting a project.",
        proactive: 'Need a hand? I can point you to the right service, open one of our live tools, or draft an enquiry for you.',
        tryExample: 'Try: "Can you count traffic from our cameras?" · Chats are saved to improve our service.',
        minimisedText: 'Minimised. Click ⤢ to expand.',
        suggestions: ['What do you do?', 'Show me your tools', 'Start a project'],
        proactiveAfterMs: 40000,   // template: 3 min idle on a survey form; a homepage visit is shorter
        timeoutMs: 15000,
        contact: 'info@themovingdot.com',
        // Chats and enquiries are saved here (Supabase project "project_database").
        // Paste the project's PUBLISHABLE key below (Supabase dashboard → Project Settings → API Keys).
        // It is safe in a web page: the tables only accept new rows; nobody can read them with it.
        supabaseUrl: 'https://tbfmcxsbiybtyytbgyic.supabase.co',
        supabaseKey: ''
    };
    try { CONFIG.apiUrl = localStorage.getItem('tmd-chat-api') || CONFIG.apiUrl; } catch (e) { /* storage blocked */ }

    /* ------------------------------------------------------------------ *
     * Icons (lucide, ISC licence)                                        *
     * ------------------------------------------------------------------ */

    var ICON = {
        bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
        x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
        send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
        min: '<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" x2="21" y1="10" y2="3"/><line x1="3" x2="10" y1="21" y2="14"/>',
        max: '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/>',
        loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
        sparkles: '<path d="M9.94 14.06 8 20l-1.94-5.94L0 12l6.06-1.94L8 4l1.94 6.06L16 12z" transform="translate(4 -1) scale(.8)"/><path d="M20 3v4"/><path d="M22 5h-4"/>',
        alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>'
    };

    function svg(name, size) {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="' + (size || 20) + '" height="' + (size || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>';
    }

    /* ------------------------------------------------------------------ *
     * Styles                                                             *
     * ------------------------------------------------------------------ */

    var CSS = [
        '.tmdc{--g:linear-gradient(135deg,#8b45c5,#3498db);font-family:"DM Sans",system-ui,-apple-system,"Segoe UI",sans-serif;}',
        '.tmdc-launch{position:fixed;right:24px;bottom:24px;z-index:9000;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;color:#fff;background:var(--g);box-shadow:0 10px 30px rgba(139,69,197,.45);display:grid;place-items:center;transition:transform .2s;animation:tmdcPop .3s ease;}',
        '.tmdc-launch:hover{transform:scale(1.06);}',
        '.tmdc-badge{position:absolute;left:-6px;top:-6px;width:24px;height:24px;border-radius:50%;background:#e74c3c;color:#fff;display:grid;place-items:center;animation:tmdcIn .4s ease;}',
        '.tmdc-badge[hidden],.tmdc-launch[hidden],.tmdc-card[hidden]{display:none;}',
        '.tmdc-card{position:fixed;right:24px;bottom:24px;z-index:9000;width:384px;max-width:calc(100vw - 32px);background:var(--surface,#fff);color:var(--text,#141418);border:1px solid var(--line,rgba(0,0,0,.1));border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.35);overflow:hidden;animation:tmdcIn .25s ease;}',
        '.tmdc-card.min{width:320px;}',
        '.tmdc-head{display:flex;align-items:center;justify-content:space-between;padding:14px 14px 14px 16px;background:var(--g);color:#fff;}',
        '.tmdc-who{display:flex;align-items:center;gap:10px;}',
        '.tmdc-who b{display:block;font-size:.95rem;font-weight:600;line-height:1.2;}',
        '.tmdc-who small{display:block;font-size:.72rem;opacity:.9;}',
        '.tmdc-ctl{display:flex;align-items:center;gap:2px;}',
        '.tmdc-ctl button{background:none;border:none;color:#fff;width:32px;height:32px;border-radius:8px;cursor:pointer;display:grid;place-items:center;}',
        '.tmdc-ctl button:hover{background:rgba(255,255,255,.2);}',
        '.tmdc-err{color:#fde68a;display:grid;place-items:center;}',
        '.tmdc-err[hidden]{display:none;}',
        '.tmdc-body[hidden],.tmdc-mini[hidden]{display:none;}',
        '.tmdc-log{height:min(384px,52vh);overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;}',
        '.tmdc-row{display:flex;}',
        '.tmdc-row.user{justify-content:flex-end;}',
        '.tmdc-msg{max-width:80%;border-radius:10px;padding:10px 12px;font-size:.88rem;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--bg,#f4f4f6);}',
        '.tmdc-row.user .tmdc-msg{background:var(--g);color:#fff;}',
        '.tmdc-time{display:block;font-size:.68rem;opacity:.65;margin-top:4px;}',
        '.tmdc-msg a{color:inherit;font-weight:600;}',
        '.tmdc-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}',
        '.tmdc-chips button{border:1px solid var(--line,rgba(0,0,0,.12));background:var(--surface,#fff);color:var(--text,#141418);border-radius:999px;padding:4px 10px;font-size:.78rem;cursor:pointer;}',
        '.tmdc-chips button:hover{border-color:#8b45c5;}',
        '.tmdc-spin{animation:tmdcSpin 1s linear infinite;color:#8b45c5;display:block;}',
        '.tmdc-foot{padding:14px 16px 12px;border-top:1px solid var(--line,rgba(0,0,0,.1));background:var(--bg,#f7f7f9);}',
        '.tmdc-form{display:flex;gap:8px;}',
        '.tmdc-form input{flex:1;min-width:0;border:1px solid var(--line,rgba(0,0,0,.12));background:var(--surface,#fff);color:var(--text,#141418);border-radius:8px;padding:9px 12px;font:inherit;font-size:.88rem;}',
        '.tmdc-form input:focus{outline:none;border-color:#8b45c5;}',
        '.tmdc-form button{border:none;border-radius:8px;width:42px;color:#fff;background:var(--g);cursor:pointer;display:grid;place-items:center;}',
        '.tmdc-form button:disabled{opacity:.5;cursor:default;}',
        '.tmdc-enq{display:grid;gap:6px;}',
        '.tmdc-enq input,.tmdc-enq textarea{width:100%;border:1px solid var(--line,rgba(0,0,0,.12));background:var(--surface,#fff);color:var(--text,#141418);border-radius:8px;padding:8px 10px;font:inherit;font-size:.84rem;resize:vertical;}',
        '.tmdc-enq input:focus,.tmdc-enq textarea:focus{outline:none;border-color:#8b45c5;}',
        '.tmdc-enq button{justify-self:start;border:none;border-radius:8px;padding:7px 14px;color:#fff;background:var(--g);font-weight:600;cursor:pointer;}',
        '.tmdc-enq button:disabled{opacity:.6;cursor:default;}',
        '.tmdc-hint{font-size:.72rem;color:var(--text-2,#6b6b78);margin-top:8px;}',
        '.tmdc-mini{padding:12px;text-align:center;font-size:.85rem;color:var(--text-2,#6b6b78);cursor:pointer;}',
        '.tmdc-toasts{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9100;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;}',
        '.tmdc-toast{background:var(--text,#141418);color:var(--bg,#fff);font-size:.82rem;padding:8px 14px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.25);animation:tmdcIn .25s ease;}',
        '@keyframes tmdcPop{from{transform:scale(0);}to{transform:scale(1);}}',
        '@keyframes tmdcIn{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:none;}}',
        '@keyframes tmdcSpin{to{transform:rotate(360deg);}}',
        '@media (max-width:600px){.tmdc-launch{right:16px;bottom:16px;}.tmdc-card{right:8px;bottom:8px;width:calc(100vw - 16px);max-width:none;}.tmdc-card.min{width:calc(100vw - 16px);}.tmdc-toasts{top:16px;bottom:auto;}}',
        '@media (prefers-reduced-motion:reduce){.tmdc *,.tmdc{animation:none!important;}}'
    ].join('');

    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    /* ------------------------------------------------------------------ *
     * DOM                                                                *
     * ------------------------------------------------------------------ */

    var root = document.createElement('div');
    root.className = 'tmdc';
    root.innerHTML =
        '<button type="button" class="tmdc-launch" aria-label="Open the AI assistant" aria-expanded="false">' + svg('bot', 24) +
            '<span class="tmdc-badge">' + svg('sparkles', 14) + '</span></button>' +
        '<section class="tmdc-card" role="dialog" aria-label="AI assistant" hidden>' +
            '<div class="tmdc-head">' +
                '<div class="tmdc-who">' + svg('bot', 20) + '<div><b>' + CONFIG.title + '</b><small>' + CONFIG.subtitle + '</small></div></div>' +
                '<div class="tmdc-ctl"><span class="tmdc-err" title="The AI service is busy; quick answers only" hidden>' + svg('alert', 16) + '</span>' +
                    '<button type="button" class="tmdc-toggle" aria-label="Minimise">' + svg('min', 16) + '</button>' +
                    '<button type="button" class="tmdc-close" aria-label="Close">' + svg('x', 16) + '</button></div>' +
            '</div>' +
            '<div class="tmdc-body">' +
                '<div class="tmdc-log" aria-live="polite"></div>' +
                '<div class="tmdc-foot"><form class="tmdc-form"><input type="text" autocomplete="off" placeholder="Ask anything…" aria-label="Message">' +
                    '<button type="submit" aria-label="Send">' + svg('send', 16) + '</button></form>' +
                    '<p class="tmdc-hint">' + CONFIG.tryExample + '</p></div>' +
            '</div>' +
            '<div class="tmdc-mini" hidden>' + CONFIG.minimisedText + '</div>' +
        '</section>' +
        '<div class="tmdc-toasts" aria-live="polite"></div>';
    document.body.appendChild(root);

    var launch = root.querySelector('.tmdc-launch');
    var badge = root.querySelector('.tmdc-badge');
    var card = root.querySelector('.tmdc-card');
    var body = root.querySelector('.tmdc-body');
    var mini = root.querySelector('.tmdc-mini');
    var log = root.querySelector('.tmdc-log');
    var form = root.querySelector('.tmdc-form');
    var input = form.querySelector('input');
    var sendBtn = form.querySelector('button');
    var toggleBtn = root.querySelector('.tmdc-toggle');
    var errIcon = root.querySelector('.tmdc-err');
    var toasts = root.querySelector('.tmdc-toasts');

    var state = { open: false, minimised: false, loading: false, greeted: false };
    var history = [];

    function session(key, value) {
        try {
            if (value === undefined) return sessionStorage.getItem(key);
            sessionStorage.setItem(key, value);
        } catch (e) { return null; }
    }

    /* ------------------------------------------------------------------ *
     * Open / minimise / close                                            *
     * ------------------------------------------------------------------ */

    function render() {
        launch.hidden = state.open;
        card.hidden = !state.open;
        card.classList.toggle('min', state.minimised);
        body.hidden = state.minimised;
        mini.hidden = !state.minimised;
        toggleBtn.innerHTML = svg(state.minimised ? 'max' : 'min', 16);
        toggleBtn.setAttribute('aria-label', state.minimised ? 'Expand' : 'Minimise');
        launch.setAttribute('aria-expanded', String(state.open));
    }

    function open(focus) {
        state.open = true;
        state.minimised = false;
        badge.hidden = true;
        session('tmdc-seen', '1');
        if (!state.greeted) {
            state.greeted = true;
            addMessage('assistant', CONFIG.welcome, { chips: CONFIG.suggestions });
        }
        render();
        if (focus !== false) setTimeout(function () { input.focus({ preventScroll: true }); }, 30);
    }

    function close() {
        state.open = false;
        render();
        launch.focus({ preventScroll: true });
    }

    function minimise(on) {
        state.minimised = on === undefined ? !state.minimised : !!on;
        render();
        if (!state.minimised) input.focus({ preventScroll: true });
    }

    launch.addEventListener('click', function () { open(); });
    root.querySelector('.tmdc-close').addEventListener('click', close);
    toggleBtn.addEventListener('click', function () { minimise(); });
    mini.addEventListener('click', function () { minimise(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.open) close(); });
    if (session('tmdc-seen')) badge.hidden = true;

    // Auto-minimise: once the visitor goes back to the page, step aside.
    document.addEventListener('pointerdown', function (e) {
        if (state.open && !state.minimised && !state.loading && !root.contains(e.target)) minimise(true);
    });
    var scrollStart = null, quietUntil = 0;   // page scrolls the bot itself causes don't count
    window.addEventListener('scroll', function () {
        if (!state.open || state.minimised || state.loading || Date.now() < quietUntil) { scrollStart = null; return; }
        if (scrollStart === null) scrollStart = window.scrollY;
        if (Math.abs(window.scrollY - scrollStart) > 240) { scrollStart = null; minimise(true); }
    }, { passive: true });

    // Proactive help: if the visitor idles, offer help once per session.
    var lastActivity = Date.now();
    ['pointermove', 'pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(function (ev) {
        window.addEventListener(ev, function () { lastActivity = Date.now(); }, { passive: true });
    });
    setInterval(function () {
        if (state.open || session('tmdc-proactive') || session('tmdc-seen')) return;
        if (Date.now() - lastActivity < CONFIG.proactiveAfterMs) return;
        session('tmdc-proactive', '1');
        state.greeted = true;
        addMessage('assistant', CONFIG.proactive, { chips: CONFIG.suggestions });
        open(false);
    }, 5000);

    /* ------------------------------------------------------------------ *
     * Messages and toasts                                                *
     * ------------------------------------------------------------------ */

    function addMessage(role, text, opts) {
        opts = opts || {};
        var row = document.createElement('div');
        row.className = 'tmdc-row ' + (role === 'user' ? 'user' : 'bot');
        var msg = document.createElement('div');
        msg.className = 'tmdc-msg';
        msg.appendChild(document.createTextNode(text));
        if (opts.link) {
            msg.appendChild(document.createTextNode(' '));
            var a = document.createElement('a');
            a.href = opts.link.href;
            a.textContent = opts.link.text;
            msg.appendChild(a);
        }
        var time = document.createElement('span');
        time.className = 'tmdc-time';
        time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        msg.appendChild(time);
        if (opts.chips) {
            var chips = document.createElement('div');
            chips.className = 'tmdc-chips';
            opts.chips.forEach(function (c) {
                var b = document.createElement('button');
                b.type = 'button';
                b.textContent = c;
                b.addEventListener('click', function () { send(c, { local: true }); });
                chips.appendChild(b);
            });
            msg.appendChild(chips);
        }
        row.appendChild(msg);
        log.appendChild(row);
        log.scrollTop = log.scrollHeight;
    }

    function spinner() {
        var row = document.createElement('div');
        row.className = 'tmdc-row bot';
        row.innerHTML = '<div class="tmdc-msg" aria-label="Thinking"><span class="tmdc-spin">' + svg('loader', 16) + '</span></div>';
        log.appendChild(row);
        log.scrollTop = log.scrollHeight;
        return row;
    }

    function toast(text) {
        var t = document.createElement('div');
        t.className = 'tmdc-toast';
        t.textContent = text;
        toasts.appendChild(t);
        setTimeout(function () { t.remove(); }, 2600);
    }

    /* ------------------------------------------------------------------ *
     * Actions on the page                                                *
     * ------------------------------------------------------------------ */

    var AREA_NAMES = { counting: 'Traffic counting', modelling: 'Transport modelling', tools: 'Tools', services: 'Services' };
    var TOOLS = {
        'vehicle-counter': 'https://vehcount.themovingdot.com',
        'one2many': 'https://one2many.themovingdot.com/',
        'many2many': 'https://many2many.themovingdot.com/',
        'mismatch': 'https://mismatch.themovingdot.com/',
        'bus-flow-analyzer': 'https://wmbusflow.themovingdot.com/',
        'uae-transit-animation': 'https://uaetransit.themovingdot.com/',
        'riyadh-transit-animation': 'https://riyadh-transit-animation.themovingdot.com/',
        'rainbow-bus-tracker': 'https://whereistherainbowbus.netlify.app/'
    };

    /* ------------------------------------------------------------------ *
     * Storage: chat log and enquiries (Supabase, insert-only)            *
     * ------------------------------------------------------------------ */

    var EMAIL_RE = /[^\s@<>()"',;]+@[^\s@<>()"',;]+\.[a-z]{2,}/i;

    var sessionId = session('tmdc-sid');
    if (!sessionId) { sessionId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); session('tmdc-sid', sessionId); }

    function clip(v, n) { return v == null ? null : String(v).slice(0, n); }

    function store(table, row) {
        if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey) return Promise.reject(new Error('storage not configured'));
        var headers = { 'Content-Type': 'application/json', apikey: CONFIG.supabaseKey, Prefer: 'return=minimal' };
        if (!/^sb_/.test(CONFIG.supabaseKey)) headers.Authorization = 'Bearer ' + CONFIG.supabaseKey;   // legacy anon key
        return fetch(CONFIG.supabaseUrl + '/rest/v1/' + table, { method: 'POST', headers: headers, body: JSON.stringify(row), keepalive: true })
            .then(function (r) { if (!r.ok) throw new Error('save failed: ' + r.status); return true; });
    }

    function logExchange(question, reply, source) {
        store('website_chat_log', {
            session_id: sessionId,
            page: clip(location.pathname, 300),
            question: clip(question, 2000),
            reply: clip(reply.say, 4000),
            actions: reply.actions && reply.actions.length ? reply.actions : null,
            source: source,
            language: clip(navigator.language, 20),
            user_agent: clip(navigator.userAgent, 400)
        }).catch(function () { /* logging must never break the chat */ });
    }

    function saveEnquiry(email, message, source) {
        return store('website_enquiries', {
            email: clip(email.trim(), 254),
            message: clip(message || '', 4000),
            source: source,
            session_id: sessionId,
            page: clip(location.pathname, 300)
        });
    }

    // What the visitor has said so far, as context for an enquiry from the chat.
    function conversationSoFar() {
        return history.filter(function (m) { return m.role === 'user' && CONFIG.suggestions.indexOf(m.content) === -1; })
            .map(function (m) { return '- ' + m.content; }).slice(-6).join('\n');
    }

    function enquiryCard(message) {
        var row = document.createElement('div');
        row.className = 'tmdc-row bot';
        var msg = document.createElement('div');
        msg.className = 'tmdc-msg';
        var f = document.createElement('form');
        f.className = 'tmdc-enq';
        f.innerHTML = '<input type="email" required placeholder="Your email" aria-label="Your email" autocomplete="email">' +
            '<textarea rows="3" aria-label="Your message" placeholder="What do you need?"></textarea>' +
            '<button type="submit">Send</button>';
        f.querySelector('textarea').value = message || '';
        f.addEventListener('submit', function (e) {
            e.preventDefault();
            var email = f.querySelector('input').value;
            var text = f.querySelector('textarea').value;
            if (!EMAIL_RE.test(email)) { f.querySelector('input').focus(); return; }
            f.querySelector('button').disabled = true;
            saveEnquiry(email, text, 'chat').then(function () {
                row.remove();
                addMessage('assistant', 'Thanks! We have your message and will reply to ' + email.trim() + '.');
                toast('Enquiry sent');
            }, function () {
                row.remove();
                addMessage('assistant', 'Sorry, that did not go through.', { link: { href: mailto('Project enquiry', text), text: 'Send it by email instead' } });
            });
        });
        msg.appendChild(f);
        row.appendChild(msg);
        log.appendChild(row);
        log.scrollTop = log.scrollHeight;
        setTimeout(function () { f.querySelector('input').focus({ preventScroll: true }); }, 50);
    }

    function mailto(subject, bodyText) {
        return 'mailto:' + CONFIG.contact + '?subject=' + encodeURIComponent(subject || 'Project enquiry') + '&body=' + encodeURIComponent(bodyText || '');
    }

    function runAction(act) {
        var T = window.TMD || {};
        var a = act.args || {};
        var m;
        switch (act.tool) {
            case 'show_card':
                var card = String(a.card || '');
                if ((m = card.match(/^module-(counting|modelling|tools|services)$/)) && T.openArea) {
                    T.openArea(m[1]);
                    return 'Opened ' + AREA_NAMES[m[1]];
                }
                if (card === 'contact' && T.spotlight) { T.spotlight('contact'); return 'Showing contact details'; }
                if (T.spotlight && T.spotlight(card)) return 'Highlighted ' + card.replace(/-/g, ' ');
                return null;
            case 'open_project':
                try {
                    var u = new URL(a.url);
                    if (u.protocol !== 'https:' || !(/(^|\.)themovingdot\.com$/.test(u.hostname) || u.hostname === 'whereistherainbowbus.netlify.app')) return null;
                    window.open(u.href, '_blank', 'noopener');
                    return 'Opened ' + u.hostname;
                } catch (e) { return null; }
            case 'draft_email':
                enquiryCard(a.body || conversationSoFar());
                return null;
            case 'set_theme':
                if ((a.theme === 'light' || a.theme === 'dark') && a.theme !== document.documentElement.getAttribute('data-theme') && window.toggleTheme) window.toggleTheme();
                return 'Switched to ' + a.theme + ' mode';
            case 'go_to_page':
                if (a.page === 'lab' || a.page === 'flow') { location.href = '/' + a.page; return 'Going to ' + a.page; }
                return null;
            default:
                return null;
        }
    }

    function runActions(actions) {
        actions = (actions || []).slice(0, 3);
        quietUntil = Date.now() + 1500 + actions.length * 700;
        // On a phone the panel covers the page: step aside so the visitor sees what the bot opened.
        if (actions.some(function (a) { return a.tool === 'show_card'; }) && window.innerWidth < 600) {
            setTimeout(function () { minimise(true); }, 1400);
        }
        actions.forEach(function (act, i) {
            setTimeout(function () {
                var note = null;
                try { note = runAction(act); } catch (e) { note = null; }
                if (note) toast(note);
            }, 250 + i * 700);
        });
    }

    /* ------------------------------------------------------------------ *
     * Local guide (quick replies, and when the AI service is down)       *
     * ------------------------------------------------------------------ */

    var LOCAL = [
        [/start|quote|price|cost|hire|contact|email|enquir|talk|meeting/i, function () {
            return { say: "Great. Tell us briefly what you need and where, and leave your email. We'll reply with how we'd approach it.",
                actions: [{ tool: 'draft_email', args: { subject: 'Project enquiry', body: '' } }] };
        }],
        [/\bcount(s|ing|er)?\b|camera|video|cctv|detect|classif/i, function () {
            return { say: 'We count traffic from camera footage with computer vision: every vehicle detected, classified and counted by turning movement.',
                actions: [{ tool: 'show_card', args: { card: 'module-counting' } }] };
        }],
        [/model|visum|sumo|activitysim|scenario|forecast|simulat/i, function () {
            return { say: 'We build network and demand models in PTV Visum, SUMO and ActivitySim, with AI agents checking the network and validating against counts.',
                actions: [{ tool: 'show_card', args: { card: 'module-modelling' } }] };
        }],
        [/tool|platform|demo|app\b|product|built/i, function () {
            return { say: 'Here are the platforms we built that are live now. Pick one to try.',
                actions: [{ tool: 'show_card', args: { card: 'module-tools' } }] };
        }],
        [/survey|interview|household|roadside|diary/i, function () {
            return { say: 'We design and run transport surveys end to end: phone-based forms, live fieldwork monitoring and a validated dataset.',
                actions: [{ tool: 'show_card', args: { card: 'module-services' } }] };
        }],
        [/what do you|service|offer|help with|about you|who are/i, function () {
            return { say: 'Three things, one team. Advise: surveys, analysis and modelling. Build: transport software and AI counting. Run: the platforms and data after launch.',
                actions: [{ tool: 'show_card', args: { card: 'module-services' } }] };
        }]
    ];

    function localReply(text) {
        for (var i = 0; i < LOCAL.length; i++) if (LOCAL[i][0].test(text)) return LOCAL[i][1]();
        return { say: 'I can tell you about AI traffic counting, transport modelling, our tools, or help you start a project.', actions: [], chips: CONFIG.suggestions };
    }

    /* ------------------------------------------------------------------ *
     * AI service                                                         *
     * ------------------------------------------------------------------ */

    function systemPrompt() {
        var T = window.TMD || {};
        return [
            'You are "the dot", the assistant on themovingdot.com, the homepage of The Moving Dot Ltd: transport consultancy and software, powered by AI, working with clients worldwide. You guide visitors and can act on the page.',
            'The business: (1) Traffic counting: computer vision counts vehicles from camera footage by class and turning movement (product: Vehicle Counter). (2) Transport modelling: network and demand models in PTV Visum, SUMO and ActivitySim, with AI agents that check network coding, run assignments and validate against counts. (3) Tools: live platforms we built. (4) Services: Advise (surveys, analysis, modelling), Build (software, dashboards, AI counting), Run (hosting, data pipelines, quality control). Projects in the UK, Saudi Arabia and the UAE. Survey types: roadside, household travel diary, public transport, hotel/visitor, park-and-ride, parking, special generator, traffic counts.',
            'Tools (id -> url): ' + Object.keys(TOOLS).map(function (k) { return k + ' -> ' + TOOLS[k]; }).join('; ') + '.',
            'Page state: ' + (T.state ? T.state() : '') ,
            '',
            'LANGUAGE: write "say" in the same language as the visitor\'s latest message (Spanish question -> Spanish answer, Arabic -> Arabic, Chinese -> Chinese).',
            'ANSWER WITH EXACTLY ONE JSON OBJECT AND NOTHING ELSE: {"say": "<reply in the visitor\'s language, max 45 words, plain and friendly>", "actions": [<0 to 3 actions>]}',
            'Actions:',
            '- show_card {"card": "module-counting" | "module-modelling" | "module-tools" | "module-services"} opens that section.',
            '- show_card {"card": "<tool id>" | "contact"} highlights it.',
            '- open_project {"url": "<tool url>"} only when the visitor asks to open or try a tool.',
            '- draft_email {"subject": "...", "body": "..."} shows an enquiry card in the chat, prefilled with a summary of what the visitor needs; they add their email and press Send. Use it whenever the visitor wants a quote, a call, to start a project or to be contacted.',
            '- set_theme {"theme": "light" | "dark"}',
            'Rules: use actions whenever the visitor wants to see, try or start something. Never name clients or projects (confidential). Never invent prices, timelines, staff or statistics; for those, offer draft_email. Output nothing outside the JSON.',
            '',
            'Examples:',
            'Visitor: "can you count from our cameras?" -> {"say":"Yes. Our Vehicle Counter detects, classifies and counts vehicles from camera footage, by turning movement.","actions":[{"tool":"show_card","args":{"card":"module-counting"}}]}',
            'Visitor: "do you use Visum?" -> {"say":"Yes, PTV Visum alongside SUMO and ActivitySim, with AI agents that check and validate the model.","actions":[{"tool":"show_card","args":{"card":"module-modelling"}}]}',
            'Visitor: "open the UAE transit animation" -> {"say":"Opening it in a new tab.","actions":[{"tool":"open_project","args":{"url":"https://uaetransit.themovingdot.com/"}}]}',
            'Visitor: "¿hacéis encuestas de movilidad?" -> {"say":"Sí. Diseñamos y realizamos encuestas de movilidad completas, con formularios móviles y control de calidad de los datos.","actions":[{"tool":"show_card","args":{"card":"module-services"}}]}',
            'Visitor: "we need a parking survey in Doha next month" -> {"say":"We can design and run that. Leave your email below and we will get back to you.","actions":[{"tool":"draft_email","args":{"subject":"Parking survey in Doha","body":"We need a parking survey in Doha next month. Please get in touch about scope and timing."}}]}'
        ].join('\n');
    }

    function askAI() {
        var ctrl = 'AbortController' in window ? new AbortController() : null;
        var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, CONFIG.timeoutMs);
        return fetch(CONFIG.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [{ role: 'system', content: systemPrompt() }].concat(history.slice(-10)) }),
            signal: ctrl ? ctrl.signal : undefined
        }).then(function (r) {
            clearTimeout(timer);
            return r.json().then(function (d) {
                if (!r.ok || d.error || typeof d.reply !== 'string' || !d.reply) throw new Error(d.error || 'bad response');
                return { say: d.reply, actions: Array.isArray(d.actions) ? d.actions : [] };
            });
        }, function (e) { clearTimeout(timer); throw e; });
    }

    function deliver(reply, question, source) {
        addMessage('assistant', reply.say, { chips: reply.chips });
        history.push({ role: 'assistant', content: JSON.stringify({ say: reply.say, actions: reply.actions || [] }) });
        runActions(reply.actions);
        if (question) logExchange(question, reply, source);
    }

    function setLoading(on) {
        state.loading = on;
        input.disabled = on;
        sendBtn.disabled = on;
    }

    function send(text, opts) {
        text = (text || '').trim();
        if (!text || state.loading) return;
        if (!state.open) open(false);
        if (state.minimised) minimise(false);
        addMessage('user', text);
        history.push({ role: 'user', content: text });

        // A visitor who types their email has just made an enquiry: save it, no AI needed.
        var found = text.match(EMAIL_RE);
        if (found) {
            var email = found[0];
            saveEnquiry(email, conversationSoFar(), 'chat').then(function () {
                deliver({ say: 'Thanks! We have your details and will reply to ' + email + '.', actions: [] }, text, 'local');
                toast('Enquiry sent');
            }, function () {
                addMessage('assistant', 'Sorry, I could not save that.', { link: { href: mailto('Project enquiry', conversationSoFar()), text: 'Send it by email instead' } });
            });
            return;
        }

        if (opts && opts.local) { deliver(localReply(text), text, 'local'); return; }

        setLoading(true);
        var wait = spinner();
        askAI().then(function (reply) {
            errIcon.hidden = true;
            deliver(reply, text, 'ai');
        }).catch(function () {
            errIcon.hidden = false;
            deliver(localReply(text), text, 'local');
        }).then(function () {
            wait.remove();
            setLoading(false);
            input.focus({ preventScroll: true });
        });
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var t = input.value;
        input.value = '';
        send(t);
    });

    render();
    window.TMDChat = { open: open, close: close, minimise: minimise, send: send, saveEnquiry: saveEnquiry };
})();
