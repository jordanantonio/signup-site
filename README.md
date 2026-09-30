# Basketball leagues and game signup

The public GitHub Pages site requires **no player accounts**. An admin creates leagues, adds the allowed names for each league, and creates dated games. Players select their league, game, and an allowed name. The first 15 regular signups appear in the game; later signups appear on the waitlist. The admin can add, move, and remove people, close or reopen games, and mark who actually played. Closed games stay under **Previous games**.

## Firebase setup

This repo is configured for Firebase project `signup-site-58aa3` in `firebase.js`.

1. Create a Cloud Firestore database in that project if it does not already exist.
2. In Firebase Authentication, enable **Email/Password** and create exactly one admin account in the Firebase Console. Use an email address you own and choose a unique password. The admin page asks only for the password; the email is configured in code.
3. Copy the admin account's email and UID from Authentication → Users. Replace `REPLACE_WITH_HOST_EMAIL` and `REPLACE_WITH_HOST_UID` in `firebase.js`. Replace `REPLACE_WITH_HOST_UID` in `firestore.rules` with the same UID. Never put the password into a file or GitHub.
4. Paste the contents of `firestore.rules` into Firestore → Rules and publish it. The `/host/` page and its password field do not protect the database by themselves; the UID check in these rules does.
5. In Authentication → Settings → Authorized domains, add your GitHub Pages hostname, such as `yourname.github.io`.
6. Publish the repository root through GitHub Pages. Visit its `/host/` page, enter the admin password, create a league, paste its names one per line, and create games. The app creates Firestore collections automatically.

The site stores league documents under `leagues`, approved names under `leagues/{leagueId}/players`, games under `leagues/{leagueId}/games`, and signups under each game. The old top-level `signups` collection and the previous top-level `games` and `roster` collections are not read by this version.

**Identity limit:** A player account is not required, so anyone who knows an approved name could choose it. The app limits each name to one signup per game, but it cannot prove which person typed that name.
