# enquiry-alert — instant email + Google Sheet for website enquiries

`Code.gs` is a Google Apps Script bound to the Google Sheet
**Website enquiries — The Moving Dot** (owner's Drive). The website posts every
enquiry to it; the script adds a row to the sheet and emails
hongwei@themovingdot.com at once (Reply goes straight to the visitor).
Every enquiry is also stored in Supabase (`project_database`, `public.feedback`).

## Deploy (once)

1. Open the sheet → **Extensions → Apps Script**.
2. Replace everything in `Code.gs` with this folder's `Code.gs`. Save.
3. Choose `testAlert` in the function list, press **Run**, allow the permissions.
   A test row appears in the sheet and a test email arrives.
4. **Deploy → New deployment → Web app**: Execute as **Me**, Who has access **Anyone**. Deploy.
5. Copy the URL ending in `/exec` and paste it into `alertUrl` at the top of `assets/chatbot.js`.

Opening the `/exec` URL in a browser should say "The Moving Dot enquiry alerts are running."

After editing `Code.gs`, use **Deploy → Manage deployments → Edit → New version**
so the same URL keeps working.

## Guards

- Accepts only kinds `enquiry`, `feedback`, `bug`; enquiries need a valid email.
- At most 30 emails per hour (rows are still saved above that).
- Text starting with `= + - @` is stored as plain text, never as a formula.
