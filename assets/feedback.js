/*!
 * The Moving Dot - shared feedback template.
 * Copyright (c) 2022-2026 The Moving Dot Ltd. All rights reserved.
 *
 * One line in any of our web tools:
 *   <script src="https://themovingdot.com/assets/feedback.js" data-site="my-tool" defer></script>
 *
 * Adds a small "Feedback" button (feedback / bug / enquiry). Everything is saved
 * to the central Supabase table (project_database -> public.feedback); enquiries,
 * feedback and bugs also go to the Google Sheet + instant email (Apps Script).
 *
 * Options (data attributes on the script tag):
 *   data-site      required. Short name of the tool, e.g. "vehcount", "one2many".
 *   data-button    "on" (default) or "off" for code-only use (window.TMDFeedback.send).
 *   data-position  "bottom-left" (default) or "bottom-right".
 *
 * JavaScript API:
 *   TMDFeedback.send({ kind: 'feedback'|'bug'|'enquiry'|'chat', email, message, reply, meta }) -> Promise
 *   TMDFeedback.open()   open the feedback panel
 *
 * The Supabase key below is the PUBLISHABLE key: safe in a web page because the
 * table only accepts new rows. Never put a secret / service_role key here.
 */
(function () {
    'use strict';

    // ---- central settings: change here, every tool follows ----------------
    var SUPABASE_URL = 'https://tbfmcxsbiybtyytbgyic.supabase.co';
    var SUPABASE_KEY = 'sb_publishable_dGytCWeXoKbdvJC2X2fzew_wir2ndP2';
    var ALERT_URL = 'https://script.google.com/macros/s/AKfycbyQO2-wu7IJeN8y2YD_WAh8AGJH9oIFQiDo4lTq_Oya56MsVtfvxVtyPkciSa0IKPCTLQ/exec';   // Apps Script (workers/enquiry-alert): Sheet row + instant email
    var CONTACT = 'info@themovingdot.com';
    // ---------------------------------------------------------------------------

    if (window.TMDFeedback) return;   // loaded twice on one page

    var me = document.currentScript || document.querySelector('script[src*="feedback.js"]');
    var opt = function (name, dflt) { var v = me && me.getAttribute('data-' + name); return v == null || v === '' ? dflt : v; };
    var SITE = opt('site', location.hostname || 'unknown').slice(0, 80);
    var EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]{2,}$/;
    var ALERT_KINDS = { enquiry: 1, feedback: 1, bug: 1 };

    var sessionId;
    try { sessionId = sessionStorage.getItem('tmd-fb-sid'); } catch (e) { /* storage blocked */ }
    if (!sessionId) {
        sessionId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
        try { sessionStorage.setItem('tmd-fb-sid', sessionId); } catch (e) { /* fine */ }
    }

    function clip(v, n) { return v == null || v === '' ? null : String(v).slice(0, n); }

    function send(item) {
        item = item || {};
        var kind = item.kind || 'feedback';
        var email = clip(item.email && String(item.email).trim(), 254);
        if (email && !EMAIL_RE.test(email)) return Promise.reject(new Error('invalid email'));
        if (kind === 'enquiry' && !email) return Promise.reject(new Error('email required'));
        var row = {
            site: SITE,
            kind: kind,
            email: email,
            message: clip(item.message, 4000),
            reply: clip(item.reply, 4000),
            meta: item.meta || null,
            session_id: sessionId,
            page: clip(item.page || location.pathname, 300),
            language: clip(navigator.language, 20),
            user_agent: clip(navigator.userAgent, 400)
        };

        // Instant email + Sheet row. Apps Script can't answer cross-site requests, so fire and forget.
        if (ALERT_URL && ALERT_KINDS[kind]) {
            try {
                fetch(ALERT_URL, {
                    method: 'POST', mode: 'no-cors', keepalive: true,
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ site: SITE, kind: kind, email: email, message: row.message, page: row.page, source: (item.meta && item.meta.source) || 'widget' })
                }).catch(function () { /* Supabase still has it */ });
            } catch (e) { /* ignore */ }
        }

        var headers = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Prefer: 'return=minimal' };
        if (!/^sb_/.test(SUPABASE_KEY)) headers.Authorization = 'Bearer ' + SUPABASE_KEY;   // legacy anon key
        return fetch(SUPABASE_URL + '/rest/v1/feedback', { method: 'POST', headers: headers, body: JSON.stringify(row), keepalive: true })
            .then(function (r) { if (!r.ok) throw new Error('save failed: ' + r.status); return true; });
    }

    window.TMDFeedback = { send: send, open: function () {}, site: SITE, contact: CONTACT };

    if (opt('button', 'on') === 'off') return;

    /* ------------------------------------------------------------------ *
     * The widget (shadow DOM, so it never clashes with the tool's CSS)   *
     * ------------------------------------------------------------------ */

    function build() {
        var host = document.createElement('div');
        host.setAttribute('data-tmd-feedback', '');
        var side = opt('position', 'bottom-left') === 'bottom-right' ? 'right' : 'left';
        host.style.cssText = 'position:fixed;bottom:16px;' + side + ':16px;z-index:8999;';
        var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
        root.innerHTML =
            '<style>' +
            ':host{all:initial;}' +
            '*{box-sizing:border-box;font-family:"DM Sans",system-ui,-apple-system,"Segoe UI",sans-serif;}' +
            '.w{--bg:#fff;--fg:#16161d;--mute:#5d5c6b;--line:rgba(0,0,0,.12);--acc:#8b45c5;color:var(--fg);}' +
            '.w.dark{--bg:#15151a;--fg:#ececf1;--mute:#a7a6b4;--line:rgba(255,255,255,.14);}' +
            '.tab{border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:999px;padding:8px 14px;font-size:13px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.15);}' +
            '.tab:hover{border-color:var(--acc);}' +
            '.p{width:300px;max-width:calc(100vw - 32px);background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:14px;box-shadow:0 16px 40px rgba(0,0,0,.25);}' +
            '.h{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:14px;font-weight:600;}' +
            '.x{background:none;border:none;color:var(--mute);font-size:18px;cursor:pointer;line-height:1;}' +
            '.k{display:flex;gap:6px;margin-bottom:10px;}' +
            '.k button{flex:1;border:1px solid var(--line);background:none;color:var(--mute);border-radius:8px;padding:6px 0;font-size:12px;cursor:pointer;}' +
            '.k button[aria-pressed="true"]{border-color:var(--acc);color:var(--fg);background:rgba(139,69,197,.12);}' +
            'textarea,input{width:100%;border:1px solid var(--line);background:none;color:var(--fg);border-radius:8px;padding:8px 10px;font-size:13px;margin-bottom:8px;resize:vertical;}' +
            'textarea:focus,input:focus{outline:none;border-color:var(--acc);}' +
            'input.bad{border-color:#d03b3b;}' +
            '.s{width:100%;border:none;border-radius:8px;padding:9px;font-size:13px;font-weight:600;color:#fff;background:linear-gradient(135deg,#8b45c5,#3498db);cursor:pointer;}' +
            '.s:disabled{opacity:.6;cursor:default;}' +
            '.m{font-size:13px;color:var(--mute);margin:4px 0 0;}' +
            '.m a{color:var(--fg);}' +
            '[hidden]{display:none!important;}' +
            '</style>' +
            '<div class="w">' +
            '<button class="tab" type="button" aria-expanded="false">Feedback</button>' +
            '<form class="p" hidden novalidate aria-label="Send feedback">' +
            '<div class="h"><span>Send us a note</span><button class="x" type="button" aria-label="Close">&times;</button></div>' +
            '<div class="k" role="group" aria-label="Type">' +
            '<button type="button" data-k="feedback" aria-pressed="true">Feedback</button>' +
            '<button type="button" data-k="bug" aria-pressed="false">Bug</button>' +
            '<button type="button" data-k="enquiry" aria-pressed="false">Enquiry</button></div>' +
            '<textarea rows="3" placeholder="What would you like to tell us?" aria-label="Message"></textarea>' +
            '<input type="email" placeholder="Your email (optional)" aria-label="Your email" autocomplete="email">' +
            '<button class="s" type="submit">Send</button>' +
            '<p class="m" hidden></p>' +
            '</form></div>';

        var w = root.querySelector('.w'), tab = root.querySelector('.tab'), form = root.querySelector('form');
        var msg = root.querySelector('textarea'), mail = root.querySelector('input'), btn = root.querySelector('.s'), note = root.querySelector('.m');
        var kind = 'feedback';

        function theme() {
            var t = document.documentElement.getAttribute('data-theme');
            var dark = t ? t === 'dark' : (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
            w.classList.toggle('dark', !!dark);
        }
        theme();
        new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });

        function show(open) {
            form.hidden = !open;
            tab.hidden = open;
            tab.setAttribute('aria-expanded', String(open));
            if (open) setTimeout(function () { msg.focus(); }, 30);
        }

        tab.addEventListener('click', function () { show(true); });
        root.querySelector('.x').addEventListener('click', function () { show(false); tab.focus(); });
        Array.prototype.forEach.call(root.querySelectorAll('.k button'), function (b) {
            b.addEventListener('click', function () {
                kind = b.getAttribute('data-k');
                Array.prototype.forEach.call(root.querySelectorAll('.k button'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
                mail.placeholder = kind === 'enquiry' ? 'Your email' : 'Your email (optional)';
            });
        });

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var email = mail.value.trim(), text = msg.value.trim();
            var badMail = (email && !EMAIL_RE.test(email)) || (kind === 'enquiry' && !email);
            mail.classList.toggle('bad', !!badMail);
            if (!text && !email) { msg.focus(); return; }
            if (badMail) { mail.focus(); return; }
            btn.disabled = true;
            send({ kind: kind, email: email, message: text, meta: { source: 'widget' } }).then(function () {
                msg.value = ''; mail.value = '';
                note.hidden = false;
                note.textContent = email ? 'Thanks! We will reply to ' + email + '.' : 'Thanks, received.';
                setTimeout(function () { note.hidden = true; btn.disabled = false; show(false); }, 2200);
            }, function () {
                btn.disabled = false;
                note.hidden = false;
                note.innerHTML = 'Could not send. <a href="mailto:' + CONTACT + '?subject=' + encodeURIComponent('Feedback: ' + SITE) + '&body=' + encodeURIComponent(text) + '">Email us instead</a>.';
            });
        });

        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !form.hidden) show(false); });
        window.TMDFeedback.open = function () { show(true); };
        document.body.appendChild(host);
    }

    if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
