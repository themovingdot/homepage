// The Moving Dot — homepage dashboard.
// Copyright (c) 2022-2026 The Moving Dot Ltd. All rights reserved.
//
// Four modules (traffic counting, transport modelling, tools, services) plus
// the hero background. Everything the assistant can do on the page goes
// through window.TMD, so clicks and the assistant share one code path.

(function () {
    'use strict';

    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function $(sel, root) { return (root || document).querySelector(sel); }
    function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
    function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
    function fmt(n) { return Math.round(n).toLocaleString('en-GB'); }
    function el(tag, attrs, parent) {
        var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
        for (var k in attrs) node.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(node);
        return node;
    }

    // Colours come from CSS so both themes stay in one place.
    var colours = {};
    function readColours() {
        colours = {
            car: css('--c-car'), lgv: css('--c-lgv'), bus: css('--c-bus'), hgv: css('--c-hgv'),
            road: css('--road'), mark: css('--road-mark'), text: css('--text'), text2: css('--text-2'),
            muted: css('--muted'), grid: css('--grid'), bg: css('--bg'), surface: css('--surface'),
            ok: css('--ok'), warn: css('--warn'), crit: css('--crit')
        };
    }
    readColours();
    new MutationObserver(function () {
        readColours();
        renderChart();
        renderNetwork();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    /* ================================================================== *
     * Tabs                                                               *
     * ================================================================== */

    var MODULES = ['counting', 'modelling', 'tools', 'services'];
    var currentModule = 'counting';

    function openModule(name, opts) {
        if (MODULES.indexOf(name) === -1) return false;
        currentModule = name;
        MODULES.forEach(function (m) {
            var tab = $('#tab-' + m);
            var panel = $('#' + m);
            var on = m === name;
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
            tab.tabIndex = on ? 0 : -1;
            panel.hidden = !on;
        });
        if (name === 'counting') sizeCountCanvas();
        if (!opts || opts.scroll !== false) {
            $('#dashboard').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        }
        return true;
    }

    $all('.tab').forEach(function (tab) {
        tab.addEventListener('click', function () { openModule(tab.dataset.module, { scroll: false }); });
        tab.addEventListener('keydown', function (e) {
            var i = MODULES.indexOf(tab.dataset.module);
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                var next = MODULES[(i + (e.key === 'ArrowRight' ? 1 : MODULES.length - 1)) % MODULES.length];
                openModule(next, { scroll: false });
                $('#tab-' + next).focus();
                e.preventDefault();
            }
        });
    });

    $all('[data-open]').forEach(function (node) {
        node.addEventListener('click', function (e) {
            e.preventDefault();
            openModule(node.dataset.open);
            if (node.dataset.spot) setTimeout(function () { spotlight(node.dataset.spot); }, 450);
        });
    });

    function spotlight(id) {
        var target = document.querySelector('[data-agent-id="' + id + '"]');
        if (!target) return false;
        var panel = target.closest('.panel');
        if (panel && panel.hidden) openModule(panel.id, { scroll: false });
        target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
        target.classList.add('spotlight');
        setTimeout(function () { target.classList.remove('spotlight'); }, 2800);
        return true;
    }

    /* ================================================================== *
     * Traffic counting simulation                                        *
     * ================================================================== */

    var CLASSES = [
        { id: 'car', label: 'Car', p: 0.72, len: 14, wid: 7, speed: 105 },
        { id: 'lgv', label: 'Van', p: 0.14, len: 16, wid: 8, speed: 95 },
        { id: 'bus', label: 'Bus', p: 0.05, len: 27, wid: 9, speed: 80 },
        { id: 'hgv', label: 'HGV', p: 0.09, len: 25, wid: 9, speed: 78 }
    ];
    var ARMS = [
        { id: 'N', name: 'North', d: [0, 1], rate: 0.7, phase: 0 },
        { id: 'S', name: 'South', d: [0, -1], rate: 0.65, phase: 0 },
        { id: 'W', name: 'West', d: [1, 0], rate: 0.8, phase: 1 },
        { id: 'E', name: 'East', d: [-1, 0], rate: 0.6, phase: 1 }
    ];
    var TURNS = [{ id: 'left', label: 'Left', p: 0.2 }, { id: 'ahead', label: 'Ahead', p: 0.6 }, { id: 'right', label: 'Right', p: 0.2 }];

    var SIM_SECONDS_PER_REAL = 30;      // accelerated clock
    var BIN_MIN = 5;
    var BINS_SHOWN = 12;
    var GREEN = 6, AMBER_ALLRED = 1.6;  // signal timings, real seconds

    var cv = $('#count-canvas');
    var ctx = cv.getContext('2d');
    var W = 0, H = 0, DPR = 1;
    var vehicles = [], counts, bins, turning, simTime, signalT, showDetections = true, fast = false;
    var flashes = [];
    var spawnAcc = {};

    function rn(v) { return [-v[1], v[0]]; }          // right-hand normal (traffic keeps right)
    function ln(v) { return [v[1], -v[0]]; }
    function add(a, b, k) { return [a[0] + b[0] * k, a[1] + b[1] * k]; }

    function resetCounting() {
        vehicles = [];
        counts = { car: 0, lgv: 0, bus: 0, hgv: 0 };
        bins = [];
        turning = {};
        ARMS.forEach(function (a) { turning[a.id] = { left: 0, ahead: 0, right: 0 }; spawnAcc[a.id] = Math.random(); });
        simTime = 7 * 3600;
        signalT = 0;
        newBin();
        renderTiles();
        renderChart();
        renderTable();
    }

    function newBin() {
        bins.push({ start: simTime - (simTime % (BIN_MIN * 60)), car: 0, lgv: 0, bus: 0, hgv: 0 });
        if (bins.length > BINS_SHOWN) bins.shift();
    }

    function sizeCountCanvas() {
        var w = cv.clientWidth;
        if (!w) return;
        DPR = Math.min(window.devicePixelRatio || 1, 2);
        W = w;
        H = Math.round(Math.max(260, Math.min(400, w * 0.62)));
        cv.width = Math.round(W * DPR);
        cv.height = Math.round(H * DPR);
        cv.style.height = H + 'px';
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        vehicles = [];   // geometry changed, paths are stale
    }

    var OFF = 11, J = 34;

    function buildPath(arm, turnId) {
        var c = [W / 2, H / 2];
        var d = arm.d;
        var e = turnId === 'ahead' ? d : (turnId === 'left' ? ln(d) : rn(d));
        var reach = function (v) { return (v[0] !== 0 ? W / 2 : H / 2) + 40; };
        var p0 = add(add(c, d, -reach(d)), rn(d), OFF);
        var p1 = add(add(c, d, -J), rn(d), OFF);
        var p2 = add(add(c, e, J), rn(e), OFF);
        var p3 = add(add(c, e, reach(e)), rn(e), OFF);
        var pts = [p0, p1];
        if (turnId === 'ahead') {
            pts.push(p2);
        } else {
            // control point: where the entry and exit lane centre-lines meet
            var ctrl = d[0] === 0 ? [p1[0], p2[1]] : [p2[0], p1[1]];
            for (var i = 1; i <= 12; i++) {
                var t = i / 12, u = 1 - t;
                pts.push([u * u * p1[0] + 2 * u * t * ctrl[0] + t * t * p2[0], u * u * p1[1] + 2 * u * t * ctrl[1] + t * t * p2[1]]);
            }
        }
        pts.push(p3);
        var cum = [0];
        for (var k = 1; k < pts.length; k++) {
            cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
        }
        return { pts: pts, cum: cum, total: cum[cum.length - 1], stop: cum[1] };
    }

    function at(path, s) {
        var i = 1;
        while (i < path.cum.length - 1 && path.cum[i] < s) i++;
        var a = path.pts[i - 1], b = path.pts[i];
        var seg = path.cum[i] - path.cum[i - 1] || 1;
        var t = Math.max(0, Math.min(1, (s - path.cum[i - 1]) / seg));
        return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    }

    function pick(list) {
        var r = Math.random(), acc = 0;
        for (var i = 0; i < list.length; i++) { acc += list[i].p; if (r <= acc) return list[i]; }
        return list[list.length - 1];
    }

    function greenFor(phase) {
        var cycle = 2 * (GREEN + AMBER_ALLRED);
        var t = signalT % cycle;
        return phase === 0 ? t < GREEN : (t >= GREEN + AMBER_ALLRED && t < 2 * GREEN + AMBER_ALLRED);
    }

    function spawn(arm) {
        var cls = pick(CLASSES), turn = pick(TURNS);
        var last = null;
        for (var i = vehicles.length - 1; i >= 0; i--) if (vehicles[i].arm === arm) { last = vehicles[i]; break; }
        if (last && last.s < last.cls.len + 14) return;  // entry blocked by queue
        vehicles.push({
            arm: arm, cls: cls, turn: turn.id, path: buildPath(arm, turn.id), s: 0, v: cls.speed,
            counted: false, conf: (0.86 + Math.random() * 0.13).toFixed(2)
        });
    }

    function step(dt) {
        signalT += dt;
        simTime += dt * SIM_SECONDS_PER_REAL;
        if (simTime >= bins[bins.length - 1].start + BIN_MIN * 60) { newBin(); renderChart(); }

        ARMS.forEach(function (arm) {
            spawnAcc[arm.id] += arm.rate * dt;
            while (spawnAcc[arm.id] >= 1) { spawnAcc[arm.id] -= 1; spawn(arm); }
        });

        // move: follow the vehicle ahead on the same approach, stop at red
        var byArm = {};
        vehicles.forEach(function (v) { (byArm[v.arm.id] = byArm[v.arm.id] || []).push(v); });
        Object.keys(byArm).forEach(function (id) {
            var list = byArm[id];
            list.sort(function (a, b) { return b.s - a.s; });
            for (var i = 0; i < list.length; i++) {
                var v = list[i];
                var limit = v.path.total;
                var leader = list[i - 1];
                if (leader && leader.s < leader.path.stop + 40) {
                    limit = Math.min(limit, leader.s - (leader.cls.len + v.cls.len) / 2 - 6);
                }
                if (!v.counted && !greenFor(v.arm.phase) && v.s < v.path.stop - 1) {
                    limit = Math.min(limit, v.path.stop - v.cls.len / 2 - 2);
                }
                var target = Math.min(v.s + v.cls.speed * dt, limit);
                v.s = Math.max(v.s, target);
                if (!v.counted && v.s >= v.path.stop) {
                    v.counted = true;
                    counts[v.cls.id]++;
                    bins[bins.length - 1][v.cls.id]++;
                    turning[v.arm.id][v.turn]++;
                    flashes.push({ arm: v.arm, t: 0.5 });
                    countDirty = true;
                }
            }
        });
        vehicles = vehicles.filter(function (v) { return v.s < v.path.total - 1; });
        flashes = flashes.filter(function (f) { f.t -= dt; return f.t > 0; });
    }

    var countDirty = false;

    function drawJunction() {
        var cx = W / 2, cy = H / 2, half = 24;
        ctx.fillStyle = colours.bg;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = colours.road;
        ctx.fillRect(0, cy - half, W, half * 2);
        ctx.fillRect(cx - half, 0, half * 2, H);
        // centre lines
        ctx.strokeStyle = colours.mark;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(0, cy); ctx.lineTo(cx - J, cy);
        ctx.moveTo(cx + J, cy); ctx.lineTo(W, cy);
        ctx.moveTo(cx, 0); ctx.lineTo(cx, cy - J);
        ctx.moveTo(cx, cy + J); ctx.lineTo(cx, H);
        ctx.stroke();
        ctx.setLineDash([]);
        // count lines at each stop line, with signal state
        ARMS.forEach(function (arm) {
            var d = arm.d, r = rn(d);
            var p = add([cx, cy], d, -J);
            var a = add(p, r, 2), b = add(p, r, half);
            var flash = flashes.some(function (f) { return f.arm === arm; });
            ctx.strokeStyle = flash ? '#f1c40f' : colours.muted;
            ctx.lineWidth = flash ? 3 : 2;
            ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
            var light = add(add(p, r, half + 9), d, -4);
            ctx.fillStyle = greenFor(arm.phase) ? '#0ca30c' : '#d03b3b';
            ctx.beginPath(); ctx.arc(light[0], light[1], 4, 0, Math.PI * 2); ctx.fill();
        });
        // arm labels
        ctx.fillStyle = colours.muted;
        ctx.font = '11px DM Sans, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('NORTH', cx - 52, 16);
        ctx.fillText('SOUTH', cx + 52, H - 8);
        ctx.textAlign = 'left';
        ctx.fillText('WEST', 8, cy + 42);
        ctx.textAlign = 'right';
        ctx.fillText('EAST', W - 8, cy - 34);
    }

    function drawVehicles() {
        vehicles.forEach(function (v) {
            var p = at(v.path, v.s);
            var col = colours[v.cls.id];
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.ang);
            ctx.fillStyle = col;
            roundRect(-v.cls.len / 2, -v.cls.wid / 2, v.cls.len, v.cls.wid, 2.5);
            ctx.fill();
            ctx.restore();
            if (!showDetections) return;
            var cos = Math.abs(Math.cos(p.ang)), sin = Math.abs(Math.sin(p.ang));
            var bw = v.cls.len * cos + v.cls.wid * sin + 8, bh = v.cls.len * sin + v.cls.wid * cos + 8;
            ctx.strokeStyle = col;
            ctx.lineWidth = 1.2;
            ctx.strokeRect(p.x - bw / 2, p.y - bh / 2, bw, bh);
            var near = v.s > v.path.stop - 16 && v.s < v.path.stop + 45;   // label at the count line only
            if (near) {
                var label = v.cls.label.toLowerCase() + ' ' + v.conf;
                ctx.font = '10px DM Sans, system-ui, sans-serif';
                var tw = ctx.measureText(label).width + 6;
                ctx.fillStyle = col;
                ctx.fillRect(p.x - bw / 2, p.y - bh / 2 - 13, tw, 13);
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'left';
                ctx.fillText(label, p.x - bw / 2 + 3, p.y - bh / 2 - 3);
            }
        });
    }

    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function clockText(t) {
        var m = Math.floor(t / 60) % (24 * 60);
        return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    }

    function renderTiles() {
        var host = $('#count-tiles');
        if (!host.children.length) {
            CLASSES.forEach(function (c) {
                var t = document.createElement('div');
                t.className = 'tile';
                t.innerHTML = '<div class="tile-label"><span class="sw" style="background:var(--c-' + c.id + ')"></span>' + c.label + '</div><div class="tile-value" data-count="' + c.id + '">0</div>';
                host.appendChild(t);
            });
        }
        CLASSES.forEach(function (c) { host.querySelector('[data-count="' + c.id + '"]').textContent = fmt(counts[c.id]); });
    }

    function totalCount() { return counts.car + counts.lgv + counts.bus + counts.hgv; }

    var chart = $('#count-chart');
    var tip = $('#count-tip');

    function renderChart() {
        if (!bins) return;
        while (chart.firstChild) chart.removeChild(chart.firstChild);
        var x0 = 30, x1 = 356, y0 = 128, y1 = 8;
        var max = 10;
        bins.forEach(function (b) { max = Math.max(max, b.car + b.lgv + b.bus + b.hgv); });
        max = Math.ceil(max / 10) * 10;
        for (var g = 0; g <= 2; g++) {
            var gy = y0 - (y0 - y1) * g / 2;
            el('line', { x1: x0, x2: x1, y1: gy, y2: gy, stroke: g === 0 ? colours.muted : colours.grid, 'stroke-width': 1 }, chart);
            var lab = el('text', { x: x0 - 6, y: gy + 4, 'text-anchor': 'end', 'font-size': 10, fill: colours.muted }, chart);
            lab.textContent = Math.round(max * g / 2);
        }
        var slot = (x1 - x0) / BINS_SHOWN, bw = slot - 6;
        bins.forEach(function (b, i) {
            var x = x0 + i * slot + 3, y = y0;
            CLASSES.forEach(function (c) {
                var h = (y0 - y1) * b[c.id] / max;
                if (h <= 0) return;
                var hh = Math.max(1, h - 2);           // 2px surface gap between segments
                el('rect', { x: x, y: y - hh, width: bw, height: hh, rx: 2, fill: colours[c.id] }, chart);
                y -= h;
            });
            if (i % 3 === 0) {
                var t = el('text', { x: x + bw / 2, y: y0 + 16, 'text-anchor': 'middle', 'font-size': 10, fill: colours.muted }, chart);
                t.textContent = clockText(b.start);
            }
            var hit = el('rect', { x: x0 + i * slot, y: y1, width: slot, height: y0 - y1, fill: 'transparent' }, chart);
            hit.addEventListener('mousemove', function (e) { showBinTip(e, b); });
            hit.addEventListener('mouseleave', function () { tip.hidden = true; });
        });
        var title = document.querySelector('#counting .chart-title');
        title.textContent = 'Vehicles per ' + BIN_MIN + ' minutes, by class · ' + fmt(totalCount()) + ' counted so far';
    }

    function showBinTip(e, b) {
        var total = b.car + b.lgv + b.bus + b.hgv;
        tip.innerHTML = '<b>' + clockText(b.start) + '–' + clockText(b.start + BIN_MIN * 60) + '</b><br>' +
            CLASSES.map(function (c) { return '<span class="sw" style="background:var(--c-' + c.id + ')"></span> ' + c.label + ': ' + b[c.id]; }).join('<br>') +
            '<br>Total: ' + total;
        var box = chart.parentNode.getBoundingClientRect();
        tip.hidden = false;
        var left = e.clientX - box.left + 12;
        if (left + tip.offsetWidth > box.width) left = e.clientX - box.left - tip.offsetWidth - 12;
        tip.style.left = left + 'px';
        tip.style.top = (e.clientY - box.top - 10) + 'px';
    }

    function renderLegend() {
        $('#count-legend').innerHTML = CLASSES.map(function (c) {
            return '<span><span class="sw" style="background:var(--c-' + c.id + ')"></span>' + c.label + '</span>';
        }).join('');
    }

    function renderTable() {
        var wrap = $('#count-table-wrap');
        if (wrap.hidden) return;
        var rows = ARMS.map(function (a) {
            var t = turning[a.id];
            return '<tr><td>From ' + a.name + '</td><td>' + t.left + '</td><td>' + t.ahead + '</td><td>' + t.right + '</td><td>' + (t.left + t.ahead + t.right) + '</td></tr>';
        }).join('');
        wrap.innerHTML = '<table class="data-table"><thead><tr><th>Approach</th><th>Left</th><th>Ahead</th><th>Right</th><th>Total</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }

    $('#ctl-table').addEventListener('click', function () {
        var wrap = $('#count-table-wrap');
        wrap.hidden = !wrap.hidden;
        this.setAttribute('aria-expanded', String(!wrap.hidden));
        this.textContent = wrap.hidden ? 'Show turning counts as a table' : 'Hide turning counts table';
        renderTable();
    });

    function setDetections(on) {
        showDetections = !!on;
        $('#ctl-detect').setAttribute('aria-pressed', String(showDetections));
    }

    function setFast(on) {
        fast = !!on;
        $('#ctl-fast').setAttribute('aria-pressed', String(fast));
    }

    $('#ctl-detect').addEventListener('click', function () { setDetections(!showDetections); });
    $('#ctl-fast').addEventListener('click', function () { setFast(!fast); });
    $('#ctl-reset').addEventListener('click', function () { resetCounting(); sizeCountCanvas(); });

    var countVisible = false;
    new IntersectionObserver(function (entries) {
        countVisible = entries[0].isIntersecting;
    }).observe(cv);

    var lastT = 0, uiAcc = 0;
    function loop(t) {
        var dt = Math.min(0.05, (t - lastT) / 1000 || 0);
        lastT = t;
        if (countVisible && !$('#counting').hidden && W) {
            var k = fast ? 4 : 1;
            for (var i = 0; i < k; i++) step(dt);
            drawJunction();
            drawVehicles();
            $('#count-clock').textContent = clockText(simTime);
            uiAcc += dt;
            if (countDirty && uiAcc > 0.25) {
                uiAcc = 0;
                countDirty = false;
                renderTiles();
                renderChart();
                renderTable();
            }
        }
        requestAnimationFrame(loop);
    }

    renderLegend();
    resetCounting();
    sizeCountCanvas();
    window.addEventListener('resize', function () { sizeCountCanvas(); sizeHero(); });
    requestAnimationFrame(loop);

    /* ================================================================== *
     * Transport modelling: equilibrium assignment on a small network     *
     * ================================================================== */

    var NODES = {
        W: { x: 140, y: 200, name: 'West suburbs', lx: -16, ly: 5, anchor: 'end' },
        N: { x: 265, y: 75, name: 'North', lx: 0, ly: -18, anchor: 'middle' },
        C: { x: 335, y: 200, name: 'Centre', lx: 14, ly: 26, anchor: 'start' },
        S: { x: 265, y: 325, name: 'South', lx: 0, ly: 30, anchor: 'middle' },
        NE: { x: 540, y: 75, name: 'Business park', lx: 0, ly: -18, anchor: 'middle' },
        E: { x: 575, y: 200, name: 'CBD', lx: 16, ly: 5, anchor: 'start' },
        SE: { x: 540, y: 325, name: 'Port', lx: 0, ly: 30, anchor: 'middle' }
    };

    // len km, cap veh/h, kmh free-flow speed
    var LINKS = [
        { id: 'W-N', a: 'W', b: 'N', len: 4, cap: 1400, kmh: 50, name: 'West–North road' },
        { id: 'W-C', a: 'W', b: 'C', len: 3.5, cap: 2200, kmh: 50, name: 'West–Centre avenue' },
        { id: 'W-S', a: 'W', b: 'S', len: 4, cap: 1200, kmh: 50, name: 'West–South road' },
        { id: 'N-C', a: 'N', b: 'C', len: 2.5, cap: 1000, kmh: 40, name: 'North–Centre street' },
        { id: 'C-S', a: 'C', b: 'S', len: 2.5, cap: 1000, kmh: 40, name: 'Centre–South street' },
        { id: 'C-E', a: 'C', b: 'E', len: 3, cap: 2400, kmh: 60, name: 'Central bridge', bridge: true },
        { id: 'N-NE', a: 'N', b: 'NE', len: 3.6, cap: 1300, kmh: 60, name: 'North bridge', bridge: true },
        { id: 'S-SE', a: 'S', b: 'SE', len: 3.6, cap: 1100, kmh: 60, name: 'South bridge', bridge: true },
        { id: 'NE-E', a: 'NE', b: 'E', len: 2.4, cap: 1500, kmh: 50, name: 'Business park link' },
        { id: 'SE-E', a: 'SE', b: 'E', len: 2.4, cap: 1300, kmh: 50, name: 'Port link' },
        { id: 'C-SE', a: 'C', b: 'SE', len: 3.4, cap: 1800, kmh: 60, name: 'New Centre–Port bridge', bridge: true, planned: true }
    ];

    var OD = [
        ['W', 'E', 1150], ['W', 'NE', 350], ['W', 'SE', 220], ['N', 'E', 500],
        ['S', 'E', 420], ['C', 'E', 650], ['S', 'SE', 220], ['N', 'NE', 220]
    ];

    var SCENARIOS = {
        base: { label: 'Today', demand: 100, closed: [], planned: false },
        peak: { label: 'Event peak +30%', demand: 130, closed: [], planned: false },
        closure: { label: 'Central bridge closed', demand: 100, closed: ['C-E'], planned: false },
        growth: { label: '2035 growth + new bridge', demand: 125, closed: [], planned: true }
    };

    var model = { demand: 100, closed: {}, planned: false, scenario: 'base' };
    var result = null, baseline = null;

    function freeTime(l) { return l.len / l.kmh * 60; }        // minutes
    function bpr(l, v) { return freeTime(l) * (1 + 0.15 * Math.pow(v / l.cap, 4)); }

    function activeLinks(state) {
        return LINKS.filter(function (l) { return !state.closed[l.id] && (!l.planned || state.planned); });
    }

    function shortestPaths(origin, links, times) {
        var dist = {}, prev = {}, done = {};
        Object.keys(NODES).forEach(function (n) { dist[n] = Infinity; });
        dist[origin] = 0;
        for (;;) {
            var u = null;
            Object.keys(NODES).forEach(function (n) { if (!done[n] && dist[n] < Infinity && (u === null || dist[n] < dist[u])) u = n; });
            if (u === null) break;
            done[u] = true;
            links.forEach(function (l, i) {
                var v = l.a === u ? l.b : (l.b === u ? l.a : null);
                if (!v) return;
                var nd = dist[u] + times[i];
                if (nd < dist[v]) { dist[v] = nd; prev[v] = i; }
            });
        }
        return { dist: dist, prev: prev };
    }

    function assign(state) {
        var links = activeLinks(state);
        var flow = links.map(function () { return 0; });
        var factor = state.demand / 100;
        var unserved = 0;
        for (var k = 0; k < 60; k++) {
            var times = links.map(function (l, i) { return bpr(l, flow[i]); });
            var aon = links.map(function () { return 0; });
            unserved = 0;
            var trees = {};
            OD.forEach(function (od) {
                var tree = trees[od[0]] || (trees[od[0]] = shortestPaths(od[0], links, times));
                var q = od[2] * factor;
                if (tree.dist[od[1]] === Infinity) { unserved += q; return; }
                var n = od[1];
                while (n !== od[0]) {
                    var li = tree.prev[n];
                    aon[li] += q;
                    var l = links[li];
                    n = l.a === n ? l.b : l.a;
                }
            });
            for (var i = 0; i < flow.length; i++) flow[i] += (aon[i] - flow[i]) / (k + 1);   // method of successive averages
        }
        var times2 = links.map(function (l, i) { return bpr(l, flow[i]); });
        var vehMin = 0, demand = 0, over = 0, busiest = null;
        var byId = {};
        links.forEach(function (l, i) {
            vehMin += flow[i] * times2[i];
            var vc = flow[i] / l.cap;
            if (vc > 1) over++;
            if (!busiest || vc > busiest.vc) busiest = { link: l, vc: vc };
            byId[l.id] = { flow: flow[i], vc: vc, time: times2[i] };
        });
        OD.forEach(function (od) { demand += od[2] * factor; });
        var served = demand - unserved;
        // a trip's time is the time spent on each link it uses, so total vehicle-minutes / trips
        var trips = OD.map(function (od) {
            var tree = shortestPaths(od[0], links, times2);
            return tree.dist[od[1]];
        });
        var avgTrip = 0;
        OD.forEach(function (od, i) { if (trips[i] < Infinity) avgTrip += trips[i] * od[2] * factor; });
        avgTrip = served ? avgTrip / served : 0;
        return { byId: byId, vehHours: vehMin / 60, avgTrip: avgTrip, over: over, busiest: busiest, demand: demand, unserved: unserved };
    }

    var net = $('#net');
    var netTip = $('#net-tip');

    function vcColour(vc) { return vc > 1 ? colours.crit : (vc >= 0.85 ? colours.warn : colours.ok); }

    function renderNetwork() {
        if (!result) return;
        while (net.firstChild) net.removeChild(net.firstChild);
        // the river the bridges cross
        el('path', { d: 'M420 0 C 400 120, 445 250, 415 380', fill: 'none', stroke: colours.car, 'stroke-opacity': 0.18, 'stroke-width': 34 }, net);
        var river = el('text', { x: 432, y: 372, 'font-size': 11, fill: colours.muted }, net);
        river.textContent = 'River';

        LINKS.forEach(function (l) {
            if (l.planned && !model.planned) return;
            var a = NODES[l.a], b = NODES[l.b];
            var r = result.byId[l.id];
            var closed = !!model.closed[l.id];
            var w = closed ? 3 : 3 + Math.min(16, (r ? r.flow : 0) / 110);
            el('line', {
                x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'link',
                stroke: closed ? colours.muted : vcColour(r.vc), 'stroke-width': w,
                'stroke-dasharray': closed ? '6 8' : 'none', 'stroke-opacity': closed ? 0.7 : 0.9
            }, net);
            if (!closed && r.vc > 1) {
                var f = el('text', { x: (a.x + b.x) / 2 + 10, y: (a.y + b.y) / 2 - 10, class: 'flag' }, net);
                f.textContent = '!';
            }
            if (closed) {
                var x = el('text', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 5, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700, fill: colours.crit }, net);
                x.textContent = '✕';
            }
            var hit = el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'link-hit', tabindex: 0, role: 'button', 'aria-label': (closed ? 'Reopen ' : 'Close ') + l.name }, net);
            hit.addEventListener('click', function () { toggleLink(l.id); });
            hit.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleLink(l.id); } });
            hit.addEventListener('mousemove', function (e) { showLinkTip(e, l); });
            hit.addEventListener('mouseleave', function () { netTip.hidden = true; });
        });

        Object.keys(NODES).forEach(function (id) {
            var n = NODES[id];
            el('circle', { cx: n.x, cy: n.y, r: 9, fill: colours.surface, stroke: colours.text, 'stroke-width': 2 }, net);
            var t = el('text', { x: n.x + n.lx, y: n.y + n.ly, 'text-anchor': n.anchor, class: 'node-label' }, net);
            t.textContent = n.name;
        });
    }

    function showLinkTip(e, l) {
        var r = result.byId[l.id];
        var closed = !!model.closed[l.id];
        netTip.innerHTML = '<b>' + l.name + '</b><br>' + (closed
            ? 'Closed · click to reopen'
            : fmt(r.flow) + ' veh/h of ' + fmt(l.cap) + ' capacity (' + Math.round(r.vc * 100) + '%)<br>Travel time ' + r.time.toFixed(1) + ' min · click to close');
        var box = net.parentNode.getBoundingClientRect();
        netTip.hidden = false;
        var left = e.clientX - box.left + 14;
        if (left + netTip.offsetWidth > box.width) left = e.clientX - box.left - netTip.offsetWidth - 14;
        netTip.style.left = left + 'px';
        netTip.style.top = (e.clientY - box.top + 14) + 'px';
    }

    function pct(a, b) { return b ? Math.round((a - b) / b * 100) : 0; }

    function renderModelPanel() {
        var r = result, b = baseline;
        var tiles = [
            { label: 'Average trip', value: r.avgTrip.toFixed(1) + ' min', note: signed(pct(r.avgTrip, b.avgTrip)) + ' vs today' },
            { label: 'Vehicle-hours', value: fmt(r.vehHours), note: signed(pct(r.vehHours, b.vehHours)) + ' vs today' },
            { label: 'Roads over capacity', value: String(r.over), note: 'of ' + activeLinks(model).length + ' open roads' },
            { label: 'Busiest road', value: Math.round(r.busiest.vc * 100) + '%', note: r.busiest.link.name }
        ];
        $('#net-tiles').innerHTML = tiles.map(function (t) {
            return '<div class="tile"><div class="tile-label">' + t.label + '</div><div class="tile-value">' + t.value + '</div><div class="tile-note">' + t.note + '</div></div>';
        }).join('');
        $('#net-insight').textContent = insightText();
        $('#demand').value = model.demand;
        $('#demand-out').textContent = model.demand + '%';
        $all('#scenarios [data-scenario]').forEach(function (btn) {
            btn.setAttribute('aria-pressed', String(btn.dataset.scenario === model.scenario));
        });
    }

    function signed(n) { return (n > 0 ? '+' : '') + n + '%'; }

    function insightText() {
        var r = result, b = baseline;
        var parts = [];
        var closedNames = LINKS.filter(function (l) { return model.closed[l.id]; }).map(function (l) { return l.name; });
        if (closedNames.length) parts.push('With ' + closedNames.join(' and ') + ' closed,');
        else if (model.planned) parts.push('With the new Centre–Port bridge open,');
        parts.push((parts.length ? 'the average trip takes ' : 'The average trip takes ') + r.avgTrip.toFixed(1) + ' minutes (' + signed(pct(r.avgTrip, b.avgTrip)) + ' vs today) at ' + model.demand + '% demand.');
        if (r.unserved > 0) parts.push(fmt(r.unserved) + ' trips per hour can no longer reach their destination.');
        if (r.over === 0) parts.push('Every road stays within capacity.');
        else parts.push(r.over + (r.over === 1 ? ' road is' : ' roads are') + ' over capacity; the busiest is the ' + r.busiest.link.name + ' at ' + Math.round(r.busiest.vc * 100) + '%.');
        return parts.join(' ');
    }

    function solve() {
        result = assign(model);
        renderNetwork();
        renderModelPanel();
    }

    function setScenario(name) {
        var s = SCENARIOS[name];
        if (!s) return false;
        model.scenario = name;
        model.demand = s.demand;
        model.planned = s.planned;
        model.closed = {};
        s.closed.forEach(function (id) { model.closed[id] = true; });
        solve();
        return true;
    }

    function setDemand(p) {
        model.demand = Math.max(60, Math.min(160, Math.round(p / 5) * 5));
        model.scenario = null;
        solve();
    }

    function toggleLink(id, closed) {
        var l = LINKS.filter(function (x) { return x.id === id; })[0];
        if (!l || (l.planned && !model.planned)) return false;
        model.closed[id] = closed === undefined ? !model.closed[id] : !!closed;
        if (!model.closed[id]) delete model.closed[id];
        model.scenario = null;
        netTip.hidden = true;
        solve();
        return true;
    }

    $all('#scenarios [data-scenario]').forEach(function (btn) {
        btn.addEventListener('click', function () { setScenario(btn.dataset.scenario); });
    });
    $('#demand').addEventListener('input', function () { setDemand(+this.value); });

    baseline = assign({ demand: 100, closed: {}, planned: false });
    setScenario('base');

    /* ================================================================== *
     * Enquiry form + contact                                             *
     * ================================================================== */

    function fillEnquiry(opts) {
        opts = opts || {};
        if (opts.type) {
            var sel = $('#enq-type');
            for (var i = 0; i < sel.options.length; i++) if (sel.options[i].text === opts.type) sel.selectedIndex = i;
        }
        if (opts.location) $('#enq-where').value = opts.location;
        if (opts.message) $('#enq-msg').value = opts.message;
        $('#contact').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        setTimeout(function () { $('#enq-name').focus({ preventScroll: true }); }, 600);
        return true;
    }

    $all('[data-enquire]').forEach(function (a) {
        a.addEventListener('click', function (e) { e.preventDefault(); fillEnquiry({ type: a.dataset.enquire }); });
    });

    $('#enquiry').addEventListener('submit', function (e) {
        e.preventDefault();
        var v = function (id) { return $('#' + id).value.trim(); };
        var type = v('enq-type');
        var body = ['Name: ' + v('enq-name'), 'Organisation: ' + v('enq-org'), 'Need: ' + type, 'Location: ' + v('enq-where'), '', v('enq-msg')].join('\n');
        var subject = 'Project enquiry: ' + type + (v('enq-where') ? ' (' + v('enq-where') + ')' : '');
        window.location.href = 'mailto:info@themovingdot.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    });

    $('#copy-email').addEventListener('click', function () {
        var btn = this;
        var done = function (ok) { btn.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(function () { btn.textContent = 'Copy'; }, 2000); };
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText('info@themovingdot.com').then(function () { done(true); }, function () { done(false); });
        } else done(false);
    });

    $('#tmd-year').textContent = new Date().getFullYear();

    /* ================================================================== *
     * Hero background: dots moving along a road network                  *
     * ================================================================== */

    var hero = $('#hero-net');
    var hctx = hero.getContext('2d');
    var hw = 0, hh = 0, hNodes = [], hEdges = [], hDots = [], heroVisible = true;
    var BRAND = ['#8b45c5', '#3498db', '#e74c3c', '#f1c40f'];

    function sizeHero() {
        var r = hero.getBoundingClientRect();
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        hw = r.width; hh = r.height;
        hero.width = Math.round(hw * dpr);
        hero.height = Math.round(hh * dpr);
        hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        var cols = Math.max(4, Math.round(hw / 160)), rows = Math.max(3, Math.round(hh / 150));
        hNodes = [];
        for (var i = 0; i <= cols; i++) for (var j = 0; j <= rows; j++) {
            hNodes.push({ x: (i + (Math.random() - 0.5) * 0.6) * hw / cols, y: (j + (Math.random() - 0.5) * 0.6) * hh / rows });
        }
        hEdges = [];
        hNodes.forEach(function (n, i) {
            var near = hNodes.map(function (m, k) { return { k: k, d: Math.hypot(m.x - n.x, m.y - n.y) }; })
                .filter(function (o) { return o.k > i; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 2);
            near.forEach(function (o) { hEdges.push([i, o.k]); });
        });
        hDots = [];
        var count = Math.min(70, hEdges.length);
        for (var d = 0; d < count; d++) {
            hDots.push({ e: Math.floor(Math.random() * hEdges.length), t: Math.random(), v: 0.08 + Math.random() * 0.18, c: BRAND[d % 4] });
        }
    }

    new IntersectionObserver(function (entries) { heroVisible = entries[0].isIntersecting; }).observe(hero);

    var hLast = 0;
    function heroLoop(t) {
        var dt = Math.min(0.05, (t - hLast) / 1000 || 0);
        hLast = t;
        if (heroVisible && hw) {
            hctx.clearRect(0, 0, hw, hh);
            hctx.strokeStyle = colours.grid;
            hctx.lineWidth = 1;
            hctx.beginPath();
            hEdges.forEach(function (e) {
                var a = hNodes[e[0]], b = hNodes[e[1]];
                hctx.moveTo(a.x, a.y); hctx.lineTo(b.x, b.y);
            });
            hctx.stroke();
            hDots.forEach(function (d) {
                if (!reduceMotion) d.t += d.v * dt;
                if (d.t > 1) {
                    // continue onto a connected edge so dots travel the network
                    var end = hEdges[d.e][1];
                    var options = [];
                    hEdges.forEach(function (e, k) { if (e[0] === end) options.push(k); });
                    d.e = options.length ? options[Math.floor(Math.random() * options.length)] : Math.floor(Math.random() * hEdges.length);
                    d.t = 0;
                }
                var e = hEdges[d.e], a = hNodes[e[0]], b = hNodes[e[1]];
                var x = a.x + (b.x - a.x) * d.t, y = a.y + (b.y - a.y) * d.t;
                hctx.fillStyle = d.c;
                hctx.shadowColor = d.c;
                hctx.shadowBlur = 8;
                hctx.beginPath(); hctx.arc(x, y, 2.4, 0, Math.PI * 2); hctx.fill();
            });
            hctx.shadowBlur = 0;
        }
        requestAnimationFrame(heroLoop);
    }
    sizeHero();
    requestAnimationFrame(heroLoop);

    /* ================================================================== *
     * Public API for the assistant                                       *
     * ================================================================== */

    window.TMD = {
        modules: MODULES.slice(),
        scenarios: Object.keys(SCENARIOS),
        links: LINKS.map(function (l) { return { id: l.id, name: l.name, planned: !!l.planned }; }),
        openModule: openModule,
        spotlight: spotlight,
        scenario: setScenario,
        setDemand: setDemand,
        toggleLink: toggleLink,
        counting: function (opts) {
            opts = opts || {};
            openModule('counting');
            if ('detections' in opts) setDetections(opts.detections);
            if ('fast' in opts) setFast(opts.fast);
            if (opts.reset) { resetCounting(); sizeCountCanvas(); }
            return true;
        },
        fillEnquiry: fillEnquiry,
        insight: insightText,
        state: function () {
            var lines = ['Open module: ' + currentModule + '.'];
            lines.push('Counting demo: ' + fmt(totalCount()) + ' vehicles counted so far (cars ' + counts.car + ', vans ' + counts.lgv + ', buses ' + counts.bus + ', HGVs ' + counts.hgv + '); AI detections ' + (showDetections ? 'on' : 'off') + ', fast forward ' + (fast ? 'on' : 'off') + '.');
            lines.push('Modelling demo: ' + (model.scenario ? 'scenario "' + SCENARIOS[model.scenario].label + '"' : 'custom settings') + '. ' + insightText());
            return lines.join(' ');
        }
    };
})();
