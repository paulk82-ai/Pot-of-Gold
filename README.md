# Pot of Gold — setup guide

An installable phone app for the Pot of Gold, a monthly golf competition played at Rathsallagh. Golfers sign in, enter for the month, pay through Revolut, and enter their own signed cards (or scan them with the camera). The organiser manages golfers, payments and results. Everything runs on Google's Firebase free tier.

**What's in the box**

- `docs/` is the app itself (the folder that gets put online).
- `firestore.rules` holds the security rules, which you paste into Firebase.
- `docs/config.js` is the one file you fill in with your Firebase details.

**How the competition works**

- Each month has 4 weekend rounds, open Friday to Sunday. The organiser can change the number of rounds and the dates per month.
- Each round can have its own format (Stableford, Medal, Gross or v Par), tees and holes (18 or 14). Each round's own table uses its format. When a month mixes formats or hole counts, the monthly table adds up Stableford points from each golfer's best 3 cards.
- The €10 entry covers the month. Each golfer gets one card per round, and their best 3 cards count.
- Entries are paid through Revolut only (no cash): in the Revolut app, or by debit card, Apple Pay or Google Pay on the Revolut page for anyone without Revolut. The golfer taps **I've paid**, and the organiser confirms it under **Payments**. Only confirmed payments go into the pot.
- Golfers with fewer than 3 counting cards are ranked on what they have, below anyone with 3.
- Before teeing off, each player taps **Start my round** in the app. That's their one round for the weekend, and the start time is recorded.
- After the round they get the paper card signed by their marker (anyone, not just players in the competition), then enter or scan it, add the marker's name and tick **My marker has signed my card**, all by **midnight that day**. Complete, signed cards count.
- At midnight the card locks. If it isn't complete and ticked as signed by then, that round doesn't count and can't be re-entered. Players should keep the signed card in case the organiser asks to see it.
- Scanned cards are only accepted for golfers whose names match the golfer list and who are entered that month. Unrecognised names are turned away.
- League points: 1st 5, 2nd 4, 3rd 3, 4th 2, everyone else 1. They are added when the organiser finalises the month. You can change them in Admin.
- The **Table** tab has **This month** (any month, with live provisional standings while it's open, and each round's results) and **Year** (the Order of Merit for the year, plus a points-by-month grid).

**Competition handicaps**

These are worked out automatically each time a month is finalised:

- Cuts depend on the golfer's competition handicap going into the month, so lower handicaps are cut less:
  - under 10: winner cut 1, runner-up cut 0.5;
  - 10 to 19.9: winner cut 2, runner-up cut 1;
  - 20 and over: winner cut 3, runner-up cut 1.5.
- A golfer who plays 2 months in a row without a cut (winning or runner-up) goes up 0.5, and the count starts again. Months a golfer doesn't enter don't count.
- Everyone can see each golfer's current handicap, starting handicap, history of changes, and when they're next due to rise, under **Golfers → Handicaps** and on each golfer's page.
- Reopening a month undoes its changes. You can change the bands, the cuts, the rise, the number of months and a top limit in **Admin → Handicap changes**.
- Each card is played off the handicap the golfer had on the day it was marked.

You can try every screen first with made-up golfers: open the app's address with `?sample=1` on the end.

---

## 1. Create the Firebase project (about 10 minutes)

This is easiest on a computer, but it works in a phone browser too.

1. Go to **console.firebase.google.com** and sign in with your Google account.
2. Tap **Create a project** and name it, for example `rathsallagh-monthly`. You can leave Google Analytics off.
3. On the project home, tap the **Web** icon (`</>`) to add a web app. Call it `Rathsallagh` and skip Firebase Hosting.
4. Firebase shows a block of code with `firebaseConfig = { apiKey: ..., authDomain: ..., projectId: ... }`. Copy those six values into `docs/config.js`, or send them to Claude to fill in. These values aren't secret.
5. Turn on sign-in: go to **Build → Authentication → Get started**, then under **Sign-in method**:
   - turn on **Google**, choosing your email as the support email;
   - turn on **Email/Password**, but not the separate "Email link" option.
6. Create the database: go to **Build → Firestore Database → Create database**. Choose the **europe-west** location nearest you (for example `europe-west1`) and start in **production mode**.
7. Paste in the rules: still in Firestore, open the **Rules** tab, replace everything with the contents of `firestore.rules`, and tap **Publish**.

## 2. Turn on card scanning (Gemini)

1. In the Firebase console, go to **AI Logic** (under *AI services* or *Build*) and tap **Get started**.
2. Choose the **Gemini Developer API**, which has a free tier, and follow the prompts.
3. Firebase now requires **App Check** for AI Logic. Go to **App Check → Apps**, pick your web app, and choose **reCAPTCHA Enterprise**.
   - Firebase helps you create a site key; add your app's web address (step 3 below) as an allowed domain.
   - Copy the **site key** into `recaptchaEnterpriseSiteKey` in `docs/config.js`.
4. If Google ever renames the model, change `geminiModel` in `docs/config.js`.

Without this step the app still works fully; golfers just type scores in instead of scanning.

## 3. Put the app online (free, with GitHub Pages)

1. Create a free account at **github.com**, then create a new repository called `Pot-of-Gold`.
2. In Claude, connect GitHub (claude.ai → Settings → Connectors → GitHub) and ask Claude to push the app to your repository. You can also upload the files yourself on github.com.
3. In the repository, go to **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**, then branch **main** and folder **/docs**, and save.
4. After a minute your app is live at `https://YOUR-GITHUB-NAME.github.io/Pot-of-Gold/`.
5. Back in Firebase, go to **Authentication → Settings → Authorized domains → Add domain** and add `YOUR-GITHUB-NAME.github.io`. Without this, sign-in won't work.

## 4. First sign-in and setup

1. Open the app address on your phone and sign in with Google using your own email.
2. The app offers **"I'm the organiser"**. Tap it. You are now the organiser; only the first person can do this.
3. Open **Admin**, set your 4 to 8 digit admin code, and check the entry fee, Revolut username (`paul3d7qv` is filled in), prize split and points.
4. On **Golfers**, add each golfer with their name, handicap index, and the email they will sign in with. Or tap **Invite** to share the app link on WhatsApp: anyone who signs in with an email that isn't on the list can **Ask to join**, and you let them in from the **To do** box (or decline).
5. On **Comps**, tap **New competition**. The four Fridays are filled in for the next month; adjust them if needed.
6. Share the app address with the golfers.

## 5. Install it on phones

- **iPhone:** open the address in Safari, tap **Share**, then **Add to Home Screen**.
- **Android:** open it in Chrome, then tap **Install app** (or the menu, then **Add to Home screen**).

It then opens full-screen like any other app, and it keeps working with a weak signal on the course. Cards save when the phone reconnects.

---

## How golfers use it

The app has four tabs for golfers: **Home** (this weekend's round, your card, your position and payment), **Table** (this month and the year), **Me** (your cards, handicap, stats and account) and **Golfers**. Organisers also get **Comps** (running months, entries and payments) and **Admin**.


1. Sign in with Google, or create an email and password account. If the organiser doesn't have that email yet, fill in **Ask to join** and wait to be let in.
2. On **Home**, tap **Enter**, then **Pay €10** to open Revolut (the app, or a debit card, Apple Pay or Google Pay). Add the reference shown, then tap **I've paid**. The organiser confirms it.
3. Before you tee off (Friday to Sunday), tap **Start my round** on **Home**. You get one round per weekend.
4. Play, and get your marker to sign your paper card.
5. By midnight that day, tap **Enter my card** and enter your scores hole by hole, or tap **Scan my card** and photograph it, then check the numbers.
6. Add your marker's name and tick **My marker has signed my card**. Your card counts from then. Keep the signed card.

## What the organiser can do

- Add and edit golfers and their emails, let in people who ask to join, and add other organisers.
- Play too: tap **Add me** in the To do box on Home to put yourself on the golfer list. Locking **Admin** (or tapping your initials → **See the app as a golfer**) shows you exactly what golfers see, with your own card. Tap your initials → **Back to organiser view** to return; Admin asks for the code again.
- Create months and change round dates.
- Confirm payments under **Payments**: people who say they've paid are listed first, with the reference to look for in Revolut. **Remind** sends the unpaid list to WhatsApp.
- Share the table to the WhatsApp group from the leaderboard.
- Enter or correct any card, at any time, including the marker's name and the signed tick (untick it if a card turns out not to be signed), and override shots. Each card shows when the golfer started it.
- Delete a card if a golfer started a round by mistake; they can then start it again while the round is open.
- Scan any card. Only golfers on your list are accepted. The marker's name and signature are read from the card for you to check.
- Finalise the month, which locks scores and adds league points. Months can be reopened.

## Payments through Revolut

- Golfers pay at `revolut.me/paul3d7qv`. Change the username in **Admin → Entry & payments** if needed.
- So people without Revolut can pay by card, turn on **Revtag discoverability** in your Revolut app's privacy settings.
- Revolut limits how much you can receive by card through your link each week; the limit is shown in your Revolut app. Payments from other Revolut users have no limit. If a lot of people pay by card in the same week, some may need to wait or pay Revolut to Revolut.

## Updates

When a new version is put online, phones that have the app open show **A new version of the app is ready → Update now**. Otherwise they pick it up the next time the app is opened.

## Costs

- **Firebase (Spark plan)** is free for a club of this size.
- **Gemini scanning** uses the free tier of the Gemini Developer API. If you ever outgrow it, Google asks you to add billing first; it doesn't charge without it.
- **GitHub Pages** is free.

## Files

| File | What it is |
| --- | --- |
| `docs/index.html` | Page layout and design |
| `docs/app.js` | The app: competitions, scoring, signed cards, league, stats, admin |
| `docs/backend-firebase.js` | Sign-in, database and Gemini scanning via Firebase |
| `docs/backend-mock.js` | Sample mode (`?sample=1`), kept on the phone only |
| `docs/config.js` | Your Firebase details |
| `docs/sw.js`, `docs/manifest.webmanifest`, `docs/icons/` | Install and offline support |
| `firestore.rules` | Security rules for Firestore |
