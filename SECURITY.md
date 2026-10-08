# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report privately through GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**. Include what you found, how to reproduce it, and what impact you think it has.

You can expect an acknowledgement within a week. Fixes are released as soon as practical, and reporters are credited unless they prefer not to be.

## Scope

In scope: the website, the news CMS configuration and access rules, the Telegram bot, the data pipeline and the deployment files in this repository.

Out of scope: the hosting provider's infrastructure, third-party services (Open-Meteo, OpenStreetMap, Telegram), and denial-of-service testing against the live site.

## What the project does to stay safe

- No accounts, no tracking and no personal data on the public site.
- No secrets in the repository; secrets live in the deployment's environment variables. CI runs a secret scanner (gitleaks) on every push and pull request.
- A strict Content Security Policy; news text is rendered as text, never as HTML.
- The CMS admin UI is not exposed to the public site, and the bot uses a restricted account that can only change news items.
