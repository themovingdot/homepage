---
name: tmd-feedback
description: The Moving Dot's standard feedback, enquiry and bug-report setup for any website, web app, dashboard or web tool. Use whenever a new or existing TMD web project needs a feedback button, contact or enquiry form, bug reports, chatbot logging, or asks where feedback is stored, how enquiries reach the owner, or how to read them. One script tag; everything lands in one central Supabase table, with instant email + Google Sheet for enquiries.
---

# TMD feedback template

Every The Moving Dot web project uses the same feedback pipe. Never build a new
table, form backend or email script for a project; plug into this one.

## Add it to a project (one line)

Put this before `</body>`, with a short, lowercase tool name in `data-site`
(e.g. `vehcount`, `one2many`, `riyadh-transit`):

```html
<script src="https://themovingdot.com/assets/feedback.js" data-site="my-tool" defer></script>
```

That adds a small **Feedback** button (bottom-left) with three types: Feedback,
Bug, Enquiry. Enquiry requires an email; the others don't. It uses its own
shadow DOM, follows the page's light/dark theme, and works on pages with any CSS.

Options on the script tag:

| Attribute | Values | Use |
|---|---|---|
| `data-site` | required | Which tool the row came from |
| `data-button` | `on` (default) / `off` | `off` when the page has its own form or a chatbot and only needs the API |
| `data-position` | `bottom-left` (default) / `bottom-right` | Move it away from a chatbot launcher |

From code (forms, chatbots):

```js
TMDFeedback.send({ kind: 'feedback' | 'bug' | 'enquiry' | 'chat', email, message, reply, meta })  // → Promise
TMDFeedback.open()   // open the panel, e.g. from a "Report a problem" link
```

`kind: 'chat'` is for chatbot logs: `message` = visitor question, `reply` = bot answer,
`meta` = anything else (actions, source). Chats are stored but never emailed.

## Where it goes

1. **Supabase** project `project_database` (ref `tbfmcxsbiybtyytbgyic`, EU), table
   `public.feedback`: `site, kind, email, message, reply, meta, session_id, page,
   language, user_agent, status (new/replied/closed), notified_at, created_at`.
   The website key can only INSERT; it cannot read, change or delete.
2. **Google Sheet + instant email** for `enquiry`, `feedback` and `bug`: the Apps
   Script in `enquiry-alert.gs` (bound to the sheet "Website enquiries — The Moving
   Dot" in the owner's Drive) appends a row and emails hongwei@themovingdot.com;
   Reply in that email goes to the visitor. Its URL is `ALERT_URL` in `feedback.js`.

Central settings (Supabase URL, publishable key, `ALERT_URL`, contact email) live
only at the top of `assets/feedback.js` in the `themovingdot/homepage` repo.
Change them there; every tool follows on the next page load.

## Reading the data

- Quick look: the Google Sheet (enquiries, feedback, bugs).
- Everything, including chats: Supabase dashboard → project_database → Table Editor → `feedback`,
  or SQL: `select created_at, site, kind, email, message from public.feedback where site = 'my-tool' order by created_at desc;`
- Mark handled rows: `update public.feedback set status = 'replied' where id = …;`

## Rules

- Only the **publishable** key (`sb_publishable_…`) ever goes in a web page. Never a
  `sb_secret_` / `service_role` key.
- Don't add read, update or delete permissions for the website role on `public.feedback`.
- Don't copy `feedback.js` into a project; load it from themovingdot.com so fixes reach every tool.
  Exception: a tool that must work offline may vendor a copy, and must say so in its README.
- New fields go in `meta` (jsonb), not new columns.
- Don't show a "chats are saved" line in the UI (owner's decision); the site's legal footer covers it.

## Check it works (after adding to a project)

1. Open the tool, press Feedback, send a test with message `TEST <tool name>`.
2. Confirm the row: `select id, site, kind, message from public.feedback order by id desc limit 3;`
3. For an enquiry test, confirm the email arrived and the Sheet has the row (only once `ALERT_URL` is set).
4. Delete nothing; mark test rows `status = 'closed'`.

## Files

- `enquiry-alert.gs`: the Apps Script (deploy steps in its header).
- `schema.sql`: the table and its insert-only policy, for reference or to rebuild.
