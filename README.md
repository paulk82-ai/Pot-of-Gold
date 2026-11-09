# Pot of Gold — setup guide

An installable phone app for the Pot of Gold, a monthly golf competition played at Rathsallagh. Golfers sign in, enter for the month, pay through Revolut, and enter their own signed cards. The organiser manages golfers, payments and results. Everything runs on Google's Firebase free tier.

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
- After the round they get the paper card signed by their marker (anyone, not just players in the competition), then type their scores in, add the marker's name, tick **My marker has signed my card** and send a photo of the card to the organiser, all by **midnight that day**. Complete, signed cards that have been sent count.
- At midnight the card locks. If it isn't complete, ticked as signed and sent by then, that round doesn't count and can't be re-entered.
- **Close round** (organiser): when everyone's in, tap **Close round N** on the competition page (or on Home on the round's last day; To do reminds you from 6pm that Sunday). Golfers can't start, enter or send cards for that round after that, Home moves on to the next round, and the round's 2's closes too (so golfers can join next weekend's 2's straight away). The confirmation warns about cards that are started but not finished, signed cards not sent yet, and 2's payments still to confirm. You can still change cards yourself, and **Reopen round N** on the competition page undoes it until the weekend ends. Rounds you don't close end at midnight on the Sunday as before.
- **Golfers send their card to the organiser.** There's no scanning for golfers. Once their card is entered and signed, Home and the card show **Send my card to the organiser**: they take a photo of the signed card (or choose one), tap **Share the photo**, and in the phone's share menu pick WhatsApp, then the organiser. The app records that it was sent, and the card counts from then (for the month and the 2's). If the share menu doesn't open, they can save the photo, open WhatsApp, send it, and tap **I've sent it**. Until it's sent, the card shows *Not sent to the organiser yet* and doesn't count, and the organiser isn't told the card is in. The organiser can tap **Count it anyway** on a card. Cards the organiser enters or uploads, and cards started before Sunday 8 November 2026, 9am, don't need it. It can be switched off in **Admin → Cards**.
- **The organiser checks cards with Upload card** (Admin → Check cards, or on any card). Save the photo the golfer sent on WhatsApp to your phone, then tap **Upload card** and choose it. The app reads the strokes off the card and compares them with what the golfer entered, hole by hole. Points are worked out with the golfer's handicap in the app: any handicap or points written on the card are ignored. If every hole matches, tap **Mark checked**. If some differ, they're highlighted and you choose **Use the card's scores** or **Keep what they entered**. If the golfer entered nothing, **Add the card's scores** fills in their card. If the scanner can't read it, the photo is shown beside what they entered so you can check it by eye. Either way the photo is saved with the card. **Check cards** lists every signed card not yet checked, sent ones first, and Home's To do shows how many sent cards are waiting. A card changed after you checked it goes back on the list. **Upload several cards** does a whole round in one go: pick all the photos at once (from the gallery), the app reads them all, then takes you through each golfer found, one at a time, on the same check screen (Card 3 of 9, with Skip). A photo with four golfers on it gives four cards to check. Names it doesn't recognise, and photos it can't read, ask you whose card it is; at the end you get a summary, with buttons for any cards you chose to fix yourself. To try a card without saving anything, pick a golfer and any round (including next weekend's) under Check cards and tap **Test a card**: it reads the photo and compares it the same way, with round buttons to check the same card against another round, and nothing is saved. The app reads every hole on the card, so if the card has a hole that isn't part of the round (say the 18th on a 1–14 round), it says so. If you've already checked the WhatsApp photos yourself, **Mark all checked** clears every card on the list that counts in one go (cards not sent yet stay on the list).
- **Send my card** and **Upload card** ask **Take a photo**, which opens the camera, or **Choose from gallery**, which opens the phone's photos.
- The app always works out the points itself from the strokes on each hole, using the handicap in the app.
- **From December 2026, league points go by the number of players**: in each round the winner gets 1 point for every paid player in that month plus a bonus point, 2nd gets one fewer, and so on down to 1 (14 paid players: winner 15, 2nd 13, 3rd 12 … down to 1). It's set per month (**League points** in the month's settings, "By players" for new months); November stays on the fixed points below.
- League points are given **each weekend round**, from that round's leaderboard: 1st 5, 2nd 4, 3rd 3, 4th 2, and 1 for every other signed card. Each golfer's best 3 rounds of points count each month (the same number as the month's best cards), so up to 15 a month. On a round's leaderboard, points in brackets are outside that golfer's best 3. Golfers tied on a round (after countback) each get that place's points. Points show on the league table straight away and are provisional until the month is finalised. You can change them in Admin.
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

## 2. Turn on card reading for Upload card (Gemini)

1. In the Firebase console, go to **AI Logic** (under *AI services* or *Build*) and tap **Get started**.
2. Choose the **Gemini Developer API**, which has a free tier, and follow the prompts.
3. Firebase now requires **App Check** for AI Logic. Go to **App Check → Apps**, pick your web app, and choose **reCAPTCHA Enterprise**.
   - Firebase helps you create a site key; add your app's web address (step 3 below) as an allowed domain.
   - Copy the **site key** into `recaptchaEnterpriseSiteKey` in `docs/config.js`.
4. If Google ever renames the model, change `geminiModel` in `docs/config.js`.
5. **Free limits.** On the free tier, the main model (`gemini-3.8-flash`) allows only about 20 scans a day and 5 a minute for the whole app. When it's used up, busy, retired or gives a reply the app can't use, the app automatically scans with `gemini-3.5-flash-lite` (about 500 a day, 10 a minute), then `gemini-3.1-flash-lite`. Each has its own allowance, and they reset at 8am Irish time (midnight Pacific). Turning on billing (the Blaze plan) removes the low limits; a scan then costs well under a cent. If a scan fails, the message shows the details, so you can tell what went wrong.

Without this step the app still works fully; Upload card shows the photo beside what the golfer entered so you can check it by eye.

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
3. Before you tee off (Friday to Sunday), tap **Start my round** on **Home**. You get one round per weekend. A page confirms you're signed in for the round; **Enter my scores** there shows the Step 3 page (enter your scores, add your marker, send your card), and its **Enter my scores** opens your card on the keypad.
4. Play, and get your marker to sign your paper card.
5. By midnight that day, tap **Enter my scores** and enter your scores hole by hole.
6. Add your marker's name and tick **My marker has signed my card**.
7. Tap **Send my card to the organiser**, take a photo of your signed card, then **Share the photo** and pick WhatsApp, then the organiser. Your card counts once it's sent.

## What the organiser can do

- **Chase list** (Admin → Cards): everyone who has started but not finished, signed but not sent, not paid the 2's, not paid their entry, or not entered. Each name has **Remind**, which opens WhatsApp with a message already written (you pick the golfer), and each group has **Remind all** for one group message.
- **Start a round for someone** (Admin → Cards): for a golfer who texts you "starting now". It records the time as if they'd tapped Start my round; then upload their card as usual.
- **Share round N results** (on a round's leaderboard): one tap shares the top 10 with scores and league points, the 2's result and who leads the month.
- **Prizes to pay** (Admin → Money): monthly prizes (once a month is finalised) and every 2's win, each with **Paid** to tick off as you pay on Revolut.
- **Season highlights** (Table → Year): most round wins, best 18-hole Stableford, most 2s and most rounds played, with **Share the season**.

- **Test a competition** (Admin): one tap starts a one-round test competition that's open today. **Try it as a golfer** puts you on Home in it as a golfer, so you can Start my round, enter scores, send your card, then check it under Check cards. Only organisers ever see it, it never counts for the league, handicaps or the 2's, and **Finish testing** takes you back. Delete it in Admin when you're done.

- Add and edit golfers and their emails, let in people who ask to join, and add other organisers.
- Play too: tap **Add me** in the To do box on Home to put yourself on the golfer list. Locking **Admin** (or tapping your initials → **See the app as a golfer**) shows you exactly what golfers see, with your own card. Tap your initials → **Back to organiser view** to return; Admin asks for the code again.
- Create months and change round dates.
- Try things out with a **Test month** (tick it on New competition): rounds can start on any day, and it never counts towards the league or handicaps. Delete it when you're done.
- Confirm payments under **Payments**: people who say they've paid are listed first, with the reference to look for in Revolut. **Remind** sends the unpaid list to WhatsApp.
- Share the table to the WhatsApp group from the leaderboard.
- Get phone notifications: in **Admin → Phone notifications**, tap **Turn on**, install the free **ntfy** app, subscribe to the channel name shown and tap **Send test**. You'll be notified when someone asks to join, enters, says they've paid, starts a round or finishes a card. Keep the channel name private; your own actions don't send notifications.
- See what's been happening: the **Activity** list on Home shows the last two weeks (joins, entries, payments, rounds started, cards in), with a count of new items on the Home tab. **Mark as seen** clears it.
- Chase entries and payments: the **To do** box on Home shows how many golfers haven't entered or paid this month. **Remind** opens WhatsApp with a ready message naming them and saying what to do. Golfers who haven't entered or paid also see a reminder strip at the top of the app.
- Enter or correct any card, at any time, including the marker's name and the signed tick (untick it if a card turns out not to be signed), and override shots. Each card shows when the golfer started it.
- Delete a card if a golfer started a round by mistake; they can then start it again while the round is open.
- Check cards: upload the photo a golfer sent you, and the app compares it with what they entered (see above).
- A **⚠ check card** note on a round's leaderboard (from cards scanned before November 2026) means the points written on the card didn't match the app. Open the card to see why, then tap **Looked at it, clear this**.
- Finalise the month, which locks scores, makes the league points final, sets the prize money and makes the handicap changes. Months can be reopened.

## Payments through Revolut

- Golfers pay at `revolut.me/paul3d7qv`. Change the username in **Admin → Entry & payments** if needed.
- So people without Revolut can pay by card, turn on **Revtag discoverability** in your Revolut app's privacy settings.
- Revolut limits how much you can receive by card through your link each week; the limit is shown in your Revolut app. Payments from other Revolut users have no limit. If a lot of people pay by card in the same week, some may need to wait or pay Revolut to Revolut.

## Next step on Home

Golfers see one **Your next step** card at the top of Home: the single thing to do now, with one big button, and a progress bar (Enter, Pay, Start, Scores, Signed, Sent). It goes: Enter the month, then Start round N (at the course, before teeing off), then Enter your scores (straight onto the keypad, and Carry on entering if they stop partway), then Add your marker, then Send your card to the organiser, then All done (with a tick). Before a round opens it says when the next one starts. An unpaid entry shows a second **Pay my €10 entry** button, without stopping them playing. The round box underneath just shows where their card is, with a plain Open my card.

## The golfer's card screen

When golfers open their own card, it starts simple: the marker's name and signed tick at the top, then **Enter my scores**, then a plain list of the holes with par, stroke index, yards and where their shots fall. Tapping **Enter my scores** (or any hole) opens the keypad; **Done** closes it. After the last hole the card shows the scores, points and totals so they can check it before ticking it signed, with **Edit my scores** to change anything. Below that is **Send my card to the organiser**. The organiser's view of a card is unchanged.

## Opening the app from WhatsApp or Facebook

Google won't allow signing in inside another app's built-in browser (WhatsApp, Facebook, Instagram, the Google app and so on). When the app is opened in one of those, the sign-in screen says so and offers **Open in Safari** (iPhone) or **Open in Chrome** (Android), plus **Copy link**. Signing in with email and a password works anywhere. Once someone has signed in and added the app to their Home Screen, they stay signed in and go straight in from the icon.

## 2's club (side competition)

Off until you switch it on in **Admin → 2's club**.

**Open to everyone on the golfer list, weekend by weekend.** Golfers who aren't in that month's competition see "Not in November? You can play the 2's on its own this weekend" on Home. They tap **Join & pay €2**, then **Start my round**, enter their card and send it to the organiser as normal. Their card is marked **2's only**: it counts for the 2's but never for the monthly table, league points, prizes or handicaps, even if they enter the month later. You see them tagged **2's only** on the 2's club sheet, with a **Card** button to check their card. Before switching it on, paste the latest `firestore.rules` into Firebase (Firestore Database → Rules → Publish), because the 2's club needs its own rules.

- €2 a round (you can change it in Admin). Golfers can tap **Join** in the 2's panel on Home any time the round is open before they tee off. When they tap **Start my round**, the app knows if they're already in; if not, it asks **Are you in the 2's club this round?** with **Yes, I'm in** or **No, just start**. They can still join and pay for 10 minutes after starting, but not later.
- **Nobody is in without paying, and it's paid before teeing off.** Joining takes them straight to Revolut; they're in once they tap **I've paid**, and you confirm it under the month's **2's club** button. Anyone who hasn't paid within 10 minutes of starting their round is not in that weekend and can't pay later. A 2 counts once you've confirmed the payment. You can still mark someone paid yourself if you know they paid in time.
- A gross 2 on any hole wins the pot, on a complete card ticked as signed by midnight. Each 2 is a share, so two 2s get a double share.
- A hole-in-one takes the whole pot, however many 2s there are. Two aces share it.
- Shares are rounded down to whole euros. What's left over stays in the pot for the next weekend.
- No 2s: the whole pot rolls over to the next weekend, including from the last weekend of a month into the next month. Test months are left out.
- The **Table → 2's club** tab shows this weekend's pot, the rules and every result. From the month's 2's club button you can confirm payments, add or take out golfers, and share the result to WhatsApp. You pay the winners yourself on Revolut.
- **Close the 2's** when a round is over: open the month's **2's club** button and tap **Close the 2's for round N** (it shows from the round's first day; Home's To do reminds you from Sunday 6pm). It shows the result first, and warns about payments still to confirm and cards not finished. Once closed, the result is fixed, nobody can join or pay for that round, and golfers' Home moves on to the next round, showing the last result. **Golfers can join and pay for the next round straight away** (within the same month; the first round of a new month opens on its Friday). This needs the latest `firestore.rules`. If cards or payments change afterwards, the sheet says so; tap **Reopen round N**, then close it again to update. Rounds you don't close are still settled automatically when the weekend ends.

## Prepaid credit

For golfers who pay you in advance. In **Admin → Prepaid credit**, choose the golfer, whether it's for the **2's club** or the **Monthly entry**, and the amount they paid, then tap **Add credit**. Use a minus amount to take credit off (for example after a refund). **History** shows every change.

- **2's credit:** each round they start, they're put in the 2's automatically and marked paid, and one round's cost (€2) comes off. The Start my round screen says "You're in the 2's club, paid from your credit" with the amount left, and they can tap **Skip the 2's** to keep their credit for another weekend. €8 covers four rounds.
- **Monthly credit:** your app enters them in each open month and marks the entry paid, taking the entry fee (€10) off. €20 covers two months. This happens whenever your app is open, including straight after you create a new month.
- Golfers see what's left on their profile and on Home. You see everyone's balance under Admin → Prepaid credit.
- When a golfer is on the last of their credit, their Home page says so: "This is your last week's credit for the 2's" or "This is your last month's credit", with a reminder to pay you again.

## Updates

When a new version is put online, phones that have the app open show **A new version of the app is ready → Update now**. Otherwise they pick it up the next time the app is opened.

## Costs

- **Firebase (Spark plan)** is free for a club of this size.
- **Gemini card reading** (Upload card) uses the free tier of the Gemini Developer API. If you ever outgrow it, Google asks you to add billing first; it doesn't charge without it.
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
