## Cloudflare Email Router for Notesnook Notes.
This is a Cloudflare worker that allows users to send notes to their Notesnook account(s) by sending emails to randomly generated email addresses. [You can try it out here](https://notesnook-inbox.youwereneverhere.fyi/)

### Deploying
To deploy this worker, you need to do a few things:
- Set up email routing in the Cloudflare dash, this requires a domain name added to Cloudflare. 
- If you already have the catch all rule set to forward to a worker, you will need to either:
  - Define your own email addresses and forward *only those* to this worker. This has the advantage of preventing random sign ups, as the worker will never know about these emails.
  - Create a worker that calls this worker and/or your original catch-all worker.
- You will need to edit `src/config.js` to specify limits for your instance. This also includes the constant `DOMAIN`, which is used to both reject emails not addressed to the domain configured, and to know what domain newly generated emails should be addressed to.
- Once you've configured all of that, you may now edit `wrangler.jsonc` to adjust the sync server configuration, if necessary.
- After that's set up, you should now navigate to the `frontend/` folder and run `npm i`, then `npm run build`. This will build the dashboard used for configuring user settings.
- You may now run `npm i` and `wrangler deploy` in the root directory of this repository to deploy the worker to Cloudflare.
- After deploying, you will want to use the included `admin.py` script to initialize the database.