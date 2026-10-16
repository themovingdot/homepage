/**
 * The Moving Dot — website enquiry alerts (Google Apps Script).
 * Copyright (c) 2022-2026 The Moving Dot Ltd. All rights reserved.
 *
 * Bound to the "Website enquiries" Google Sheet. The website POSTs each
 * enquiry here; this script adds a row to the sheet and emails the owner
 * straight away. Press Reply in that email to answer the visitor.
 *
 * Every enquiry is also stored in Supabase (project_database, public.feedback);
 * this sheet is the quick-look copy with instant email.
 *
 * Deploy: Extensions → Apps Script → paste → Deploy → New deployment →
 * Web app, Execute as: Me, Who has access: Anyone → copy the /exec URL.
 */

var OWNER = 'hongwei@themovingdot.com';
var SHEET_NAME = 'Enquiries';
var HEADERS = ['Time', 'Site', 'Kind', 'Email', 'Message', 'Page', 'Source'];
var KINDS = ['enquiry', 'feedback', 'bug'];
var MAX_EMAILS_PER_HOUR = 30;   // spam guard: rows are still saved above this, only emails stop
var EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]{2,}$/;

function doPost(e) {
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (d.website) return reply_('ignored');                 // honeypot field: bots fill it, people never see it
    var kind = KINDS.indexOf(d.kind) >= 0 ? d.kind : null;
    var email = clean_(d.email, 254);
    if (!kind) return reply_('bad kind');
    if (email && !EMAIL_RE.test(email)) return reply_('bad email');
    if (kind === 'enquiry' && !email) return reply_('email required');

    var row = [new Date(), clean_(d.site, 80), kind, email, clean_(d.message, 4000), clean_(d.page, 300), clean_(d.source, 20)];

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      sheet_().appendRow(row.map(safeCell_));
    } finally {
      lock.releaseLock();
    }

    if (underHourlyLimit_()) {
      MailApp.sendEmail({
        to: OWNER,
        replyTo: email || OWNER,
        subject: 'New website ' + kind + (email ? ' from ' + email : '') + ' (' + row[1] + ')',
        body: [
          'Site: ' + row[1],
          'Kind: ' + kind,
          'From: ' + (email || '(no email)'),
          'Page: ' + row[5],
          'Sent from: ' + (row[6] || '-'),
          '',
          row[4] || '(no message)',
          '',
          '---',
          'Press Reply to answer the visitor.',
          'All enquiries: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl()
        ].join('\n')
      });
    }
    return reply_('ok');
  } catch (err) {
    console.error(err);
    return reply_('error');
  }
}

// Opening the /exec URL in a browser shows this, so you can check the deployment is live.
function doGet() {
  return reply_('The Moving Dot enquiry alerts are running.');
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function clean_(v, max) {
  return v == null ? '' : String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

// Text starting with = + - @ would run as a formula in Sheets; store it as plain text instead.
function safeCell_(v) {
  return (typeof v === 'string' && /^[=+\-@]/.test(v)) ? "'" + v : v;
}

function underHourlyLimit_() {
  var cache = CacheService.getScriptCache();
  var key = 'emails-' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH');
  var n = Number(cache.get(key) || 0);
  if (n >= MAX_EMAILS_PER_HOUR) return false;
  cache.put(key, String(n + 1), 3600);
  return true;
}

function reply_(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
}

// Run this once from the editor (select "testAlert", press Run) to see a test email arrive.
function testAlert() {
  var res = doPost({ postData: { contents: JSON.stringify({
    site: 'themovingdot.com', kind: 'enquiry', email: OWNER,
    message: 'Test enquiry from the Apps Script editor.', page: '/', source: 'test'
  }) } });
  console.log(res.getContent());
}
