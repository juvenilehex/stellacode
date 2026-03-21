# Contributing to StellaCode

StellaCode is maintained by a single developer for now, so we're not accepting code contributions at this time.

But honestly, **hearing what you think matters more than any pull request.**

## How to Give Feedback

### Discord (preferred)

Join the StellaCode Discord: **[discord.gg/Mpvn4xEx](https://discord.gg/VGQJSda5eZ)**

Channels:
- **#bug-reports** -- something broke or behaves unexpectedly
- **#feature-requests** -- ideas for what StellaCode should do next
- **#show-your-stars** -- share a screenshot of your project's constellation
- **#general** -- questions, thoughts, anything else

### GitHub Issues

If you prefer GitHub, open an issue. Please include:
- What you expected to happen
- What actually happened
- A screenshot if it's visual
- Your OS and browser

## What Happens to Your Feedback

Feedback is reviewed in batches. When fixes or features ship, they'll be announced in Discord's #announcements channel and in GitHub releases.

Not every request will become a feature, but every one will be read. We promise.

## Running StellaCode Locally

If you want to try it out and report back:

```bash
git clone https://github.com/juvenilehex/stellacode.git
cd stellacode
npm install
npm run dev
```

Open http://localhost:3001 and point it at any project on your machine.

```bash
# Or set the target directly
STELLA_TARGET=/path/to/your/project npm run dev

# Dogfooding -- observe StellaCode with StellaCode
STELLA_TARGET=./ npm run dev
```

## Code of Conduct

Be kind. That's the whole policy.
