// The Moving Dot — homepage assistant.
// Copyright (c) 2022-2026 The Moving Dot Ltd. All rights reserved.
//
// Talks to the site's Cloudflare worker (workers/cloudflare-llm-worker) and
// runs the actions it returns on the dashboard through window.TMD. The
// deployed worker whitelists a fixed set of tools, so dashboard controls are
// expressed as `show_card` ids (module-*, scenario-*, close-*, demand-*,
// counting-*), which it already accepts. Quick-reply chips, and any time the
// worker is unreachable, are answered by the local guide below, so the
// assistant never goes silent.

(function () {
    'use strict';

    var API_URL = 'https://cloudflare-llm-worker.hongwei-8a7.workers.dev/chat';
    try { API_URL = localStorage.getItem('tmd-chat-api') || API_URL; } catch (e) { /* storage blocked */ }

    var TIMEOUT_MS = 15000;
    var STEP_MS = 900;

    var panel = document.getElementById('assistant');
    var launch = document.getElementById('assistant-launch');
    var log = document.getElementById('as-log');
    var form = document.getElementById('as-form');
    var input = document.getElementById('as-input');
    var status = document.getElementById('as-status');
    var history = [];
    var busy = false;
    var greeted = false;

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
     * Panel                                                              *
     * ------------------------------------------------------------------ */

    function openPanel() {
        panel.hidden = false;
        launch.hidden = true;
        launch.setAttribute('aria-expanded', 'true');
        if (!greeted) {
            greeted = true;
            addMsg('bot', "Hi, I'm the dot, The Moving Dot's assistant. I can show you AI traffic counting, run a modelling scenario, walk you through our tools and services, or help you start a project. Pick a button below or just ask.");
        }
        setTimeout(function () { input.focus({ preventScroll: true }); }, 50);
    }

    function closePanel() {
        panel.hidden = true;
        launch.hidden = false;
        launch.setAttribute('aria-expanded', 'false');
        launch.focus({ preventScroll: true });
    }

    launch.addEventListener('click', openPanel);
    document.getElementById('as-close').addEventListener('click', closePanel);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) closePanel(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-assistant]'), function (b) {
        b.addEventListener('click', openPanel);
    });

    function addMsg(kind, text) {
        var div = document.createElement('div');
        div.className = 'msg ' + kind;
        div.textContent = text;
        log.appendChild(div);
        log.scrollTop = log.scrollHeight;
        return div;
    }

    function typing() {
        var div = document.createElement('div');
        div.className = 'msg bot typing';
        div.setAttribute('aria-label', 'Assistant is typing');
        div.innerHTML = '<span></span><span></span><span></span>';
        log.appendChild(div);
        log.scrollTop = log.scrollHeight;
        return div;
    }

    /* ------------------------------------------------------------------ *
     * Actions                                                            *
     * ------------------------------------------------------------------ */

    function linkById(raw) {
        var id = raw.toLowerCase();
        return window.TMD.links.filter(function (l) { return l.id.toLowerCase() === id; })[0];
    }

    // Each returns a short note for the log, or null if it did nothing.
    function runAction(act) {
        var T = window.TMD;
        var a = act.args || {};
        switch (act.tool) {
            case 'show_card': {
                var card = String(a.card || '');
                var m;
                if ((m = card.match(/^module-(counting|modelling|tools|services)$/))) {
                    T.openModule(m[1]);
                    return 'Opened ' + ({ counting: 'traffic counting', modelling: 'transport modelling', tools: 'tools', services: 'services' })[m[1]];
                }
                if ((m = card.match(/^scenario-(base|peak|closure|growth)$/))) {
                    T.openModule('modelling');
                    T.scenario(m[1]);
                    return 'Ran scenario: ' + ({ base: 'today', peak: 'event peak +30%', closure: 'central bridge closed', growth: '2035 growth + new bridge' })[m[1]];
                }
                if ((m = card.match(/^(close|open)-([a-z]+-[a-z]+)$/))) {
                    var link = linkById(m[2]);
                    if (!link) return null;
                    T.openModule('modelling');
                    return T.toggleLink(link.id, m[1] === 'close') ? (m[1] === 'close' ? 'Closed ' : 'Reopened ') + link.name : null;
                }
                if ((m = card.match(/^demand-(\d{2,3})$/))) {
                    T.openModule('modelling');
                    T.setDemand(+m[1]);
                    return 'Set demand to ' + Math.max(60, Math.min(160, +m[1])) + '%';
                }
                if (card === 'counting-fast') { T.counting({ fast: true }); return 'Fast-forwarded the count'; }
                if (card === 'counting-normal') { T.counting({ fast: false }); return 'Back to normal speed'; }
                if (card === 'counting-detections-off') { T.counting({ detections: false }); return 'Hid the AI detections'; }
                if (card === 'counting-detections-on') { T.counting({ detections: true }); return 'Showing the AI detections'; }
                if (card === 'counting-reset') { T.counting({ reset: true }); return 'Restarted the count'; }
                if (card === 'contact') { T.fillEnquiry({}); return 'Opened the enquiry form'; }
                if (card === 'ai') { document.getElementById('ai').scrollIntoView({ behavior: 'smooth' }); return 'Showed where we use AI'; }
                return T.spotlight(card) ? 'Highlighted ' + card.replace(/-/g, ' ') : null;
            }
            case 'open_project': {
                try {
                    var u = new URL(a.url);
                    var ok = u.protocol === 'https:' && (/(^|\.)themovingdot\.com$/.test(u.hostname) || u.hostname === 'whereistherainbowbus.netlify.app');
                    if (!ok) return null;
                    window.open(u.href, '_blank', 'noopener');
                    return 'Opened ' + u.hostname;
                } catch (e) { return null; }
            }
            case 'set_theme': {
                var current = document.documentElement.getAttribute('data-theme');
                if ((a.theme === 'light' || a.theme === 'dark') && a.theme !== current && window.toggleTheme) window.toggleTheme();
                return 'Switched to ' + a.theme + ' mode';
            }
            case 'draft_email': {
                var subject = String(a.subject || '').toLowerCase();
                var type = /count/.test(subject) ? 'Traffic counts'
                    : /survey/.test(subject) ? 'Transport surveys'
                    : /model|analys/.test(subject) ? 'Modelling & analysis'
                    : /software|dashboard|platform|app/.test(subject) ? 'Software, dashboard or platform' : null;
                T.fillEnquiry({ type: type, message: String(a.body || '') });
                return 'Drafted your enquiry in the form; check it and press Send';
            }
            case 'go_to_page': {
                if (a.page === 'lab' || a.page === 'flow') { location.href = '/' + a.page; return 'Going to ' + a.page; }
                if (a.page === 'home') { window.scrollTo({ top: 0, behavior: 'smooth' }); return 'Back to the top'; }
                return null;
            }
            default:
                return null;   // set_mood, constellation and the like belong to other pages
        }
    }

    function runActions(actions) {
        return actions.slice(0, 4).reduce(function (p, act, i) {
            return p.then(function () {
                return new Promise(function (resolve) {
                    setTimeout(function () {
                        var note = null;
                        try { note = runAction(act); } catch (e) { note = null; }
                        if (note) addMsg('act', '↳ ' + note);
                        resolve();
                    }, i === 0 ? 150 : STEP_MS);
                });
            });
        }, Promise.resolve());
    }

    /* ------------------------------------------------------------------ *
     * Local guide: quick replies and the offline fallback                *
     * ------------------------------------------------------------------ */

    function insight() { return window.TMD.insight(); }

    var LOCAL = [
        {
            test: /tour|overview|show me around|what can you|walk me/i,
            run: function () {
                return {
                    say: "Here's the short tour: first, AI counting a junction from video; then a live network model; then the services we offer. Ask me about any of it as we go.",
                    actions: [{ tool: 'show_card', args: { card: 'module-counting' } },
                        { tool: 'show_card', args: { card: 'scenario-peak' } },
                        { tool: 'show_card', args: { card: 'module-services' } }]
                };
            }
        },
        {
            test: /close|closure|shut|bridge/i,
            run: function () {
                return { say: null, after: function () { return 'Done: the central bridge is closed in the model and traffic has re-routed. ' + insight() + ' Click any road on the map to try your own change.'; },
                    actions: [{ tool: 'show_card', args: { card: 'scenario-closure' } }] };
            }
        },
        {
            test: /peak|event|busier|rush|more traffic/i,
            run: function () {
                return { say: null, after: function () { return 'Here is the network with 30% more traffic. ' + insight(); },
                    actions: [{ tool: 'show_card', args: { card: 'scenario-peak' } }] };
            }
        },
        {
            test: /2035|future|growth|forecast|new (road|link|bridge)/i,
            run: function () {
                return { say: null, after: function () { return 'This is 2035 with 25% more trips and a new Centre–Port bridge. ' + insight(); },
                    actions: [{ tool: 'show_card', args: { card: 'scenario-growth' } }] };
            }
        },
        {
            test: /\bcount(s|ing|er)?\b|camera|video|detect|cctv|classif/i,
            run: function () {
                return {
                    say: 'This is AI traffic counting: every vehicle is detected, classified as car, van, bus or HGV, and counted by turning movement as it crosses the stop line. Our Vehicle Counter does this with real camera footage, so a count no longer needs people at the roadside.',
                    actions: [{ tool: 'show_card', args: { card: 'counting-detections-on' } }]
                };
            }
        },
        {
            test: /model|visum|sumo|activitysim|simulat|scenario|assign/i,
            run: function () {
                return {
                    say: 'This is a small network solved live: traffic takes its fastest route and roads slow as they fill. Try a scenario, change the demand, or click a road to close it. For real projects we model in PTV Visum, SUMO and ActivitySim, with AI agents checking the network and validating against counts.',
                    actions: [{ tool: 'show_card', args: { card: 'module-modelling' } }]
                };
            }
        },
        {
            test: /survey|interview|questionnaire|household|roadside|diary/i,
            run: function () {
                return {
                    say: 'We run the whole survey: questionnaire and sample design, phone-based forms for interviewers, a live dashboard during fieldwork, and a validated dataset with the quality checks recorded.',
                    actions: [{ tool: 'show_card', args: { card: 'service-surveys' } }]
                };
            }
        },
        {
            test: /start|quote|price|cost|hire|contact|email|talk|call|meeting|enquir/i,
            run: function () {
                return {
                    say: "Happy to help. I've opened the enquiry form: tell us what you need to decide and where, and we'll reply with how we'd approach it. Pricing depends on scope, so the form is the quickest route to a quote.",
                    actions: [{ tool: 'show_card', args: { card: 'contact' } }]
                };
            }
        },
        {
            test: /project|client|experience|portfolio|saudi|uae|riyadh|dubai|where have/i,
            run: function () {
                return {
                    say: "We've delivered work in the UK, Saudi Arabia and the UAE: travel survey programmes, metro passenger surveys, a digital trip-generation manual and junction prioritisation. Client names stay confidential.",
                    actions: [{ tool: 'show_card', args: { card: 'projects' } }]
                };
            }
        },
        {
            test: /tool|platform|demo|app\b|product|built/i,
            run: function () {
                return {
                    say: 'These are platforms we built that are live right now: AI vehicle counting, routing and OD tools, accessibility analysis and 3D transit animations. Open any of them to try it.',
                    actions: [{ tool: 'show_card', args: { card: 'module-tools' } }]
                };
            }
        },
        {
            test: /\bai\b|artificial|machine learning|innovat/i,
            run: function () {
                return {
                    say: 'We use AI where it saves real effort: counting traffic from video, AI agents that run model checks and validation, automated survey data quality, and this assistant.',
                    actions: [{ tool: 'show_card', args: { card: 'ai' } }]
                };
            }
        },
        {
            test: /service|offer|do you do|what do you|capabilit|help with/i,
            run: function () {
                return {
                    say: 'Three things, by one team. Advise: planning, surveys and modelling. Build: transport software, dashboards and AI counting. Run: hosting and data operations after launch.',
                    actions: [{ tool: 'show_card', args: { card: 'module-services' } }]
                };
            }
        },
        {
            test: /dark mode|light mode|too dark|too bright/i,
            run: function (text) {
                var theme = /light|too dark/i.test(text) ? 'light' : 'dark';
                return { say: 'Switched.', actions: [{ tool: 'set_theme', args: { theme: theme } }] };
            }
        }
    ];

    function localReply(text) {
        for (var i = 0; i < LOCAL.length; i++) if (LOCAL[i].test.test(text)) return LOCAL[i].run(text);
        return {
            say: 'I can show you AI traffic counting, run a modelling scenario (try "close the bridge"), show the tools we have built, or help you start a project. What would you like?',
            actions: []
        };
    }

    /* ------------------------------------------------------------------ *
     * The AI model                                                       *
     * ------------------------------------------------------------------ */

    function systemPrompt() {
        return [
            'You are "the dot", the assistant on the homepage of The Moving Dot Ltd, a transport software and consultancy company working with clients worldwide. You guide visitors and you can DRIVE the page they are looking at.',
            '',
            'WHAT THE COMPANY DOES: Advise (transport planning, survey design, traffic/demand/trip-generation analysis, network modelling and scenario testing). Build (field survey apps, web platforms, dashboards, interactive maps, AI video-based traffic counting, 3D visualisation). Run (hosting, monitoring, data pipelines and quality control, live dashboards). One team from the planning question to the live platform.',
            'AI: computer-vision traffic counting from camera footage (Vehicle Counter); AI agents connected to modelling software (PTV Visum) that check network coding, run assignments and validate against counts; automated survey data quality checks; this assistant.',
            'Survey types: roadside interview, household travel diary, public transport interview, hotel & visitor travel diary, park-and-ride, parking interview, special generator / trip generation, traffic counts (automatic, turning, video). Tools used: PTV Visum, SUMO, ActivitySim, Python, PostgreSQL/Supabase, three.js.',
            'Experience: projects in the UK, Saudi Arabia and the UAE: a city-wide travel survey programme, metro passenger surveys at 10+ stations, a digital trip generation manual, junction and corridor prioritisation. NEVER name clients or projects; they are confidential.',
            'Live tools (card id -> url): ' + Object.keys(TOOLS).map(function (k) { return k + ' -> ' + TOOLS[k]; }).join('; ') + '.',
            '',
            'THE PAGE: a hero, an "AI" section, and a dashboard with four modules: counting (animated junction with AI detections, simulated), modelling (a small demo network solved live), tools, services. Then an enquiry form. Demos are simulated illustrations, not client data.',
            'Modelling network roads (id: name): ' + window.TMD.links.map(function (l) { return l.id.toLowerCase() + ': ' + l.name + (l.planned ? ' (only exists in the 2035 scenario)' : ''); }).join('; ') + '.',
            'CURRENT PAGE STATE: ' + window.TMD.state(),
            '',
            'ANSWER WITH EXACTLY ONE JSON OBJECT AND NOTHING ELSE:',
            '{"say": "<reply, max ~60 words, plain and friendly>", "actions": [<0 to 4 actions>]}',
            '',
            'Actions ("tool" + "args"):',
            '- show_card {"card": "module-counting" | "module-modelling" | "module-tools" | "module-services"} - open a dashboard module.',
            '- show_card {"card": "scenario-base" | "scenario-peak" | "scenario-closure" | "scenario-growth"} - run a modelling scenario (today; event peak +30%; central bridge closed; 2035 +25% demand with a new Centre-Port bridge).',
            '- show_card {"card": "close-<road id>"} or {"card": "open-<road id>"} - close or reopen one road, e.g. "close-c-e".',
            '- show_card {"card": "demand-<60..160>"} - set modelling demand in percent, e.g. "demand-140".',
            '- show_card {"card": "counting-fast" | "counting-normal" | "counting-detections-on" | "counting-detections-off" | "counting-reset"}',
            '- show_card {"card": "<tool card id>" | "service-advise" | "service-build" | "service-run" | "service-surveys" | "projects" | "contact" | "ai"} - scroll to and highlight it.',
            '- open_project {"url": "<a tool url above>"} - only when the visitor asks to open or try a tool.',
            '- draft_email {"subject": "...", "body": "..."} - fill the enquiry form with what the visitor told you (they press Send themselves).',
            '- set_theme {"theme": "light" | "dark"}',
            '',
            'Rules:',
            '- Act, do not just describe: whenever the visitor wants to see, try, compare or start something, include the matching actions.',
            '- Never state trip times, percentages or other modelling results yourself: the page recalculates after your actions and posts the real result. Describe the effect in words only (traffic re-routes, roads fill, trips get longer).',
            '- Never invent prices, timelines, staff, clients or statistics. For price or availability, offer the enquiry form (show_card contact) or draft_email.',
            '- If the visitor writes in another language, reply in that language.',
            '- Output nothing before or after the JSON object.',
            '',
            'Examples:',
            'Visitor: "what if the central bridge closes?" -> {"say":"Closing it now. Watch the traffic move to the north and south bridges.","actions":[{"tool":"show_card","args":{"card":"scenario-closure"}}]}',
            'Visitor: "can you count from our cameras?" -> {"say":"Yes. Our Vehicle Counter detects, classifies and counts vehicles from camera footage. Here it is on a demo junction.","actions":[{"tool":"show_card","args":{"card":"module-counting"}},{"tool":"show_card","args":{"card":"counting-detections-on"}}]}',
            'Visitor: "push demand to 150%" -> {"say":"Raising demand to 150%. The busiest roads go over capacity first.","actions":[{"tool":"show_card","args":{"card":"demand-150"}}]}',
            'Visitor: "we need a parking survey in Doha" -> {"say":"We can design and run that. I have started an enquiry for you; add your details and press Send.","actions":[{"tool":"draft_email","args":{"subject":"Parking survey in Doha","body":"We need a parking survey in Doha. Please get in touch to discuss scope and timing."}}]}',
            'Visitor: "what tools have you built?" -> {"say":"These are live now. Open any of them to try it.","actions":[{"tool":"show_card","args":{"card":"module-tools"}}]}'
        ].join('\n');
    }

    function askModel(text) {
        var messages = [{ role: 'system', content: systemPrompt() }].concat(history.slice(-10));
        var ctrl = 'AbortController' in window ? new AbortController() : null;
        var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);
        return fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: messages }),
            signal: ctrl ? ctrl.signal : undefined
        }).then(function (r) {
            clearTimeout(timer);
            return r.json().then(function (data) {
                if (!r.ok || data.error || typeof data.reply !== 'string') throw new Error(data.error || 'bad response');
                return { say: data.reply, actions: Array.isArray(data.actions) ? data.actions : [] };
            });
        }, function (err) { clearTimeout(timer); throw err; });
    }

    /* ------------------------------------------------------------------ *
     * Conversation                                                       *
     * ------------------------------------------------------------------ */

    function changesModel(act) {
        return act && act.tool === 'show_card' && /^(scenario-|close-|open-|demand-)/.test(String((act.args || {}).card || ''));
    }

    function respond(reply) {
        if (reply.say) addMsg('bot', reply.say);
        return runActions(reply.actions || []).then(function () {
            if (reply.after) addMsg('bot', reply.after());
            else if ((reply.actions || []).slice(0, 4).some(changesModel)) addMsg('bot', 'Result from the model: ' + window.TMD.insight());
            var said = reply.say || '';
            if (reply.after) said += (said ? ' ' : '') + '[page updated]';
            history.push({ role: 'assistant', content: JSON.stringify({ say: said, actions: reply.actions || [] }) });
        });
    }

    function send(text, opts) {
        text = (text || '').trim();
        if (!text || busy) return;
        openPanel();
        addMsg('user', text);
        history.push({ role: 'user', content: text });
        busy = true;

        if (opts && opts.local) {
            respond(localReply(text)).then(function () { busy = false; });
            return;
        }

        var dots = typing();
        status.textContent = 'Thinking…';
        askModel(text).then(function (reply) {
            dots.remove();
            status.textContent = 'Opens demos, runs scenarios, drafts your enquiry';
            if (!reply.say && !reply.actions.length) return respond(localReply(text));
            return respond(reply);
        }).catch(function () {
            dots.remove();
            status.textContent = 'Quick-answer mode (AI service busy)';
            return respond(localReply(text));
        }).then(function () { busy = false; });
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var t = input.value;
        input.value = '';
        send(t);
    });

    document.getElementById('hero-ask').addEventListener('submit', function (e) {
        e.preventDefault();
        var field = document.getElementById('hero-input');
        var t = field.value;
        field.value = '';
        send(t);
    });

    // Quick-reply chips answer instantly and predictably from the local guide.
    Array.prototype.forEach.call(document.querySelectorAll('[data-prompt]'), function (chip) {
        chip.addEventListener('click', function () { send(chip.dataset.prompt, { local: true }); });
    });

    window.TMDAssistant = { send: send, open: openPanel, close: closePanel };
})();
