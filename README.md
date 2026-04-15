## Getting Started

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Automation Runner

The due schedules runner is exposed through:

- `GET /api/automation/run-due-schedules`
- `POST /api/automation/run-due-schedules`

Both methods use the same internal runner and require the same secret protection.

### Required environment variables

Add these variables in your deployment environment:

```env
AUTOMATION_RUNNER_SECRET=replace_with_a_long_random_secret
CRON_SECRET=replace_with_the_same_value_used_in_AUTOMATION_RUNNER_SECRET
```

`AUTOMATION_RUNNER_SECRET` is the application-level secret already used by the endpoint.

`CRON_SECRET` is required by Vercel Cron so Vercel can automatically send:

```txt
Authorization: Bearer <CRON_SECRET>
```

To keep a single source of truth, set `CRON_SECRET` to the same value as `AUTOMATION_RUNNER_SECRET`.

### Vercel Cron configuration

The project includes [vercel.json](./vercel.json) with an hourly schedule:

```json
{
  "crons": [
    {
      "path": "/api/automation/run-due-schedules",
      "schedule": "0 * * * *"
    }
  ]
}
```

This runs every hour in UTC against the production deployment.

If the project is deployed on Vercel Hobby, Vercel only allows daily cron jobs. In that case, change the schedule before deploying to something like `0 3 * * *`.

### Manual testing

Local or remote manual test with `POST`:

```bash
curl -X POST http://localhost:3000/api/automation/run-due-schedules \
  -H "Authorization: Bearer YOUR_AUTOMATION_RUNNER_SECRET"
```

Manual test with `GET`:

```bash
curl http://localhost:3000/api/automation/run-due-schedules \
  -H "Authorization: Bearer YOUR_AUTOMATION_RUNNER_SECRET"
```

The endpoint returns the persisted execution summary, so every invocation remains auditable in `/operations`.

## Deploy on Vercel

After setting `AUTOMATION_RUNNER_SECRET` and `CRON_SECRET`, deploy the project to Vercel. The cron job defined in `vercel.json` will start invoking the protected endpoint on production automatically.
